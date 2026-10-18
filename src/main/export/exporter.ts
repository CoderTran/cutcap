// Chạy một lần xuất video: kiểm tra dự án → dựng lệnh → chạy ffmpeg (tiến trình riêng) → báo tiến trình.
// Không import electron → test tích hợp chạy được với ffmpeg thật.
import { existsSync } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { EncoderId, ExportProgress, ExportRequest, ExportResult, TextFrameSet } from '@shared/ipc'
import { canvasSize } from '@shared/project/canvas'
import { clipAssetId, projectDuration } from '@shared/timeline/clips'
import { ProcessError, runProcess } from '../media/processRunner'
import { buildLut, hasColorChanges, lutToCube } from '@shared/render/grade'
import { type MaskOnDisk, buildExportGraph, sec, type TextFramesOnDisk } from './graphBuilder'
import { detectEncoders, encoderArgs, pixelFormatFor } from './encoders'

export interface ExporterOptions {
  ffmpegExe: string
  /** Thư mục tạm để ghi file filtergraph. */
  tempDir: string
  onProgress: (p: ExportProgress) => void
}

/** Lỗi do dự án (không phải do ffmpeg) – hiện thẳng cho người dùng. */
export class ExportValidationError extends Error {}

export class Exporter {
  private controller: AbortController | null = null

  constructor(private readonly options: ExporterOptions) {}

  get running(): boolean {
    return this.controller !== null
  }

  cancel(): void {
    this.controller?.abort()
  }

  async run(request: ExportRequest): Promise<ExportResult> {
    const { project, settings } = request
    if (this.controller) return { status: 'error', message: 'busy', detail: '' }
    this.controller = new AbortController()
    const startedAt = Date.now()
    const partial = `${settings.outputPath}.part`
    // Thư mục tạm riêng cho lần xuất này: filtergraph + ảnh chữ
    const workDir = join(this.options.tempDir, `export-${startedAt}`)

    try {
      // 1) Kiểm tra dự án
      const durationUs = projectDuration(project)
      if (durationUs === 0) throw new ExportValidationError('empty')
      const missing = Object.values(project.assets)
        .filter((a) => project.tracks.some((t) => t.clips.some((c) => clipAssetId(c) === a.id)))
        .filter((a) => !existsSync(a.path))
      if (missing.length > 0) throw new ExportValidationError(`missing:${missing.map((a) => a.name).join(', ')}`)

      // 2) Ghi ảnh chữ (do giao diện vẽ sẵn) ra thư mục tạm
      const textFrames = await writeTextFrames(workDir, request.textFrames ?? [])

      // 3) Chọn encoder
      const available = await detectEncoders(this.options.ffmpegExe)
      const first: EncoderId =
        settings.encoder === 'auto' ? (available[0] ?? 'libx264') : settings.encoder

      // 4) Chạy; nếu GPU lỗi giữa chừng (driver, hết bộ nhớ…) thì tự thử lại bằng CPU
      try {
        await this.encode(first, request, durationUs, startedAt, partial, workDir, textFrames)
        await this.embedCover(project, partial, workDir, durationUs)
        return await this.finish(partial, settings.outputPath, startedAt, first)
      } catch (err) {
        if (this.controller.signal.aborted || first === 'libx264' || err instanceof ExportValidationError) throw err
        await this.encode('libx264', request, durationUs, startedAt, partial, workDir, textFrames)
        await this.embedCover(project, partial, workDir, durationUs)
        return await this.finish(partial, settings.outputPath, startedAt, 'libx264')
      }
    } catch (err) {
      await rm(partial, { force: true })
      if (this.controller?.signal.aborted) return { status: 'cancelled' }
      if (err instanceof ExportValidationError) return { status: 'error', message: err.message, detail: '' }
      const detail = err instanceof ProcessError ? err.stderr.trim().split(/\r?\n/).slice(-15).join('\n') : String(err)
      return { status: 'error', message: 'ffmpeg', detail }
    } finally {
      this.controller = null
      await rm(workDir, { recursive: true, force: true })
      // File tạm của Làm đẹp (mỗi clip một thư mục beauty-…)
      for (const b of request.beautyRenders ?? []) await rm(dirname(b.path), { recursive: true, force: true })
    }
  }

  private async encode(
    encoder: EncoderId,
    { project, settings, beautyRenders, maskImages }: ExportRequest,
    durationUs: number,
    startedAt: number,
    partial: string,
    workDir: string,
    textFrames: Map<string, TextFramesOnDisk>
  ): Promise<void> {
    const size = canvasSize(project.settings.aspectRatio, settings.resolution)
    // Điều chỉnh màu: mỗi clip một bảng màu 3D (.cube) – cùng hàm màu với preview (shared/render/grade.ts)
    await mkdir(workDir, { recursive: true })
    const gradeLuts = new Map<string, string>()
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.type !== 'media' || !hasColorChanges(clip.grade)) continue
        const name = `lut-${gradeLuts.size}.cube`
        await writeFile(join(workDir, name), lutToCube(buildLut(clip.grade!)), 'utf8')
        gradeLuts.set(clip.id, name)
      }
    }
    // Mặt nạ: ảnh xám do giao diện vẽ sẵn
    const masks = new Map<string, MaskOnDisk>()
    for (const [i, m] of (maskImages ?? []).entries()) {
      if ('png' in m) {
        const file = join(workDir, `mask-${i}.png`)
        await writeFile(file, m.png)
        masks.set(m.clipId, { file })
      } else {
        // Mặt nạ có keyframe: chuỗi ảnh m_000000.png…
        const dir = join(workDir, `mask-${i}`)
        await mkdir(dir, { recursive: true })
        for (const [n, png] of m.frames.entries()) await writeFile(join(dir, `m_${String(n).padStart(6, '0')}.png`), png)
        masks.set(m.clipId, { pattern: join(dir, 'm_%06d.png'), startUs: m.startUs, fps: m.fps })
      }
    }
    const graph = buildExportGraph(project, {
      ...size,
      fps: settings.fps,
      pixelFormat: pixelFormatFor(encoder),
      textFrames,
      beautyRenders: new Map((beautyRenders ?? []).map((b) => [b.clipId, b])),
      gradeLuts,
      masks
    })

    // Filtergraph có thể rất dài → ghi ra file (dòng lệnh Windows giới hạn ~32 nghìn ký tự)
    const graphFile = join(workDir, `graph-${encoder}.txt`)
    await writeFile(graphFile, graph.filterGraph, 'utf8')

    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-nostats', '-progress', 'pipe:1',
      ...graph.inputArgs,
      // "-/filter_complex <file>": đọc giá trị tùy chọn từ file (FFmpeg 7+)
      '-/filter_complex', graphFile,
      '-map', `[${graph.videoLabel}]`,
      '-map', `[${graph.audioLabel}]`,
      ...encoderArgs(encoder, settings.quality),
      '-r', String(settings.fps),
      '-g', String(settings.fps * 2), // keyframe mỗi 2 giây: tua video xuất ra mượt
      '-c:a', 'aac', '-b:a', '192k',
      '-t', sec(durationUs),
      '-movflags', '+faststart', // đưa thông tin lên đầu file: xem online được ngay
      '-f', 'mp4',
      partial
    ]

    let lastEmit = 0
    try {
      await runProcess(this.options.ffmpegExe, args, {
        // Chạy trong thư mục làm việc: bảng màu .cube gọi bằng tên file (đường dẫn Windows có ":" khó thoát)
        cwd: workDir,
        signal: this.controller!.signal,
        onStdoutLine: (line) => {
          // -progress in ra các dòng "key=value"; ta chỉ cần out_time_us và speed
          const [key, value] = line.split('=')
          if (key !== 'out_time_us' && key !== 'out_time_ms') return
          const doneUs = Number(value)
          const now = Date.now()
          if (!Number.isFinite(doneUs) || now - lastEmit < 250) return
          lastEmit = now
          const progress = Math.min(0.999, Math.max(0, doneUs / durationUs))
          const elapsedSec = (now - startedAt) / 1000
          this.options.onProgress({
            progress,
            elapsedSec,
            etaSec: progress > 0.02 ? (elapsedSec / progress) * (1 - progress) : null,
            speed: elapsedSec > 0 ? doneUs / 1e6 / elapsedSec : null,
            encoder
          })
        }
      })
    } finally {
      await rm(graphFile, { force: true })
    }
  }

  /**
   * Ảnh bìa: lấy khung hình tại thời điểm đã chọn từ CHÍNH video vừa xuất (đủ chữ, hiệu ứng, màu…) hoặc ảnh trên máy,
   * rồi nhúng vào file mp4 làm hình thu nhỏ (không mã hóa lại video). Lỗi ở bước này → vẫn giữ video, chỉ thiếu ảnh bìa.
   */
  private async embedCover(project: ExportRequest['project'], partial: string, workDir: string, durationUs: number): Promise<void> {
    const cover = project.cover
    if (!cover) return
    const ffmpeg = this.options.ffmpegExe
    const signal = this.controller!.signal
    const q = ['-hide_banner', '-loglevel', 'error', '-y']
    const jpg = join(workDir, 'cover.jpg')
    const withCover = `${partial}.cover`
    try {
      if (cover.kind === 'frame') {
        const at = Math.max(0, Math.min(cover.time, durationUs - 100_000))
        await runProcess(ffmpeg, [...q, '-ss', sec(at), '-i', partial, '-frames:v', '1', '-q:v', '2', jpg], { signal })
      } else {
        await runProcess(ffmpeg, [...q, '-i', cover.path, '-frames:v', '1', '-vf', "scale='min(1920,iw)':-2", '-q:v', '2', jpg], { signal })
      }
      await runProcess(
        ffmpeg,
        [...q, '-i', partial, '-i', jpg, '-map', '0', '-map', '1', '-c', 'copy', '-disposition:v:1', 'attached_pic', '-movflags', '+faststart', '-f', 'mp4', withCover],
        { signal }
      )
      await rm(partial, { force: true })
      await rename(withCover, partial)
    } catch (err) {
      await rm(withCover, { force: true })
      if (signal.aborted) throw err
    }
  }

  private async finish(partial: string, output: string, startedAt: number, encoder: EncoderId): Promise<ExportResult> {
    await rm(output, { force: true })
    await rename(partial, output)
    const { size } = await stat(output)
    return { status: 'done', outputPath: output, elapsedSec: (Date.now() - startedAt) / 1000, encoder, sizeBytes: size }
  }
}

/** Ghi ảnh PNG của các clip chữ và lớp phủ hiệu ứng ra ổ đĩa, trả về đường dẫn theo id clip. */
async function writeTextFrames(workDir: string, sets: TextFrameSet[]): Promise<Map<string, TextFramesOnDisk>> {
  const result = new Map<string, TextFramesOnDisk>()
  for (const [i, set] of sets.entries()) {
    const dir = join(workDir, `text-${i}`)
    await mkdir(dir, { recursive: true })
    for (const [n, png] of set.animated.entries()) {
      await writeFile(join(dir, `f_${String(n).padStart(6, '0')}.png`), png)
    }
    const still = join(dir, 'still.png')
    await writeFile(still, set.still)
    result.set(set.clipId, {
      pattern: set.animated.length > 0 ? join(dir, 'f_%06d.png') : null,
      count: set.animated.length,
      still
    })
  }
  return result
}
