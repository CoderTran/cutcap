// Dịch vụ media: nhập file, tạo thumbnail, quản lý hàng đợi tạo proxy chạy nền.
//
// File này KHÔNG import electron → chạy được trong unit test với ffmpeg thật.
// Phần nối với Electron (IPC, giao thức) nằm ở ipc/mediaHandlers.ts và media/mediaProtocol.ts.
//
// Thư mục cache: <cacheRoot>/<khóa>/thumb.jpg, proxy.mp4 …
// Khóa = băm(đường dẫn + dung lượng + thời gian sửa) → nếu file gốc bị sửa, cache tự làm mới.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import type { ExtractAudioResult, ImportMediaResult, MediaPreview, PreviewQuality } from '@shared/ipc'
import { derivedFileName, fxKeyOf, type AudioDerive } from '@shared/media/derived'
import { audioFxChain, DENOISE_MODEL, parseAudioFxKey } from '@shared/render/voices'
import { fileNameOf, mediaKindFromPath } from '@shared/media/formats'
import { createId } from '@shared/project/factory'
import { ProbeError, probeFile, type ProbeInfo } from './probe'
import { parseProgressLine, runProcess } from './processRunner'
import {
  KARAOKE_VERSION,
  extractAudioArgs,
  karaokeArgs,
  loudnessArgs,
  parseIntegratedLoudness,
  voiceArgs,
  canPlayOriginal,
  PROXY_SHORT_SIDE,
  PROXY_SHORT_SIDES,
  proxyArgs,
  proxyFileName,
  proxyNeeded,
  thumbnailArgs,
  waveformArgs,
  type ProxyKind
} from './transcode'
import { mediaUrl } from './mediaUrl'

export interface MediaServiceOptions {
  /** Thư mục chứa ffmpeg.exe và ffprobe.exe. */
  ffmpegDir: string
  /** Thư mục cache (thumbnail, proxy). */
  cacheRoot: string
  /** Gọi mỗi khi trạng thái media thay đổi (để báo cho giao diện). */
  onUpdate: (preview: MediaPreview) => void
}

interface ProxyJob {
  path: string
  kind: ProxyKind
  info: ProbeInfo
  dest: string
  /** Cạnh ngắn của video proxy (540 / 720 / 1080). */
  shortSide: number
  controller: AbortController
}

/** Khóa so sánh đường dẫn trên Windows (không phân biệt hoa thường). */
const pathKey = (p: string): string => p.replace(/\//g, '\\').toLowerCase()

export class MediaService {
  private readonly previews = new Map<string, MediaPreview>()
  private readonly probeCache = new Map<string, { cacheKey: string; info: ProbeInfo }>()
  private readonly preparing = new Map<string, Promise<MediaPreview>>()
  private readonly queue: ProxyJob[] = []
  private running: ProxyJob | null = null
  /** Chất lượng khung Xem trước – giao diện gửi lên lúc mở app và mỗi khi người dùng đổi. */
  private quality: PreviewQuality = 'high'

  constructor(private readonly options: MediaServiceOptions) {}

  /** Thư mục mô hình AI (resources/models), nằm cạnh thư mục ffmpeg cả lúc phát triển lẫn khi đã cài. */
  get modelsDir(): string {
    return join(dirname(this.options.ffmpegDir), 'models')
  }

  get ffmpegExe(): string {
    return join(this.options.ffmpegDir, 'ffmpeg.exe')
  }
  get ffprobeExe(): string {
    return join(this.options.ffmpegDir, 'ffprobe.exe')
  }

  /** Có đủ ffmpeg.exe và ffprobe.exe chưa. */
  hasTools(): boolean {
    return existsSync(this.ffmpegExe) && existsSync(this.ffprobeExe)
  }

  /**
   * Giao diện chỉ được đọc file media (theo đuôi) hoặc file trong thư mục cache.
   * Ngăn trường hợp một trang lạ dùng giao thức cutcap-media để đọc file tùy ý trên máy.
   */
  isAllowedPath(filePath: string): boolean {
    if (!isAbsolute(filePath)) return false
    const rel = relative(this.options.cacheRoot, filePath)
    const insideCache = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
    return insideCache || mediaKindFromPath(filePath) !== null
  }

  // ───────── Nhập file ─────────

  async importFiles(paths: string[]): Promise<ImportMediaResult[]> {
    const hasTools = this.hasTools()
    // Đọc tối đa 4 file cùng lúc – đủ nhanh mà không làm máy quá tải khi kéo thả cả trăm file
    return mapLimit(paths, 4, async (path): Promise<ImportMediaResult> => {
      if (!mediaKindFromPath(path)) return { ok: false, path, error: 'unsupported' }
      if (!hasTools) return { ok: false, path, error: 'ffmpeg-missing' }
      try {
        const { info } = await this.probeCached(path)
        return {
          ok: true,
          asset: {
            id: createId(),
            kind: info.kind,
            path,
            name: fileNameOf(path),
            durationUs: info.durationUs,
            width: info.width,
            height: info.height,
            fps: info.fps,
            hasAudio: info.hasAudio
          }
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: false, path, error: 'missing' }
        const code = err instanceof ProbeError ? err.code : 'unreadable'
        return { ok: false, path, error: code, detail: (err as Error).message }
      }
    })
  }

  // ───────── Trích xuất âm thanh ─────────

  /**
   * Tách tiếng của video ra file .m4a trong `destDir` (file người dùng giữ lâu dài, KHÔNG phải cache).
   * mode = 'karaoke': tạo bản đã xóa giọng hát (từ video hoặc file âm thanh stereo).
   * Tên file kèm mã băm của video gốc (đường dẫn + dung lượng + giờ sửa): trích lại cùng một video
   * thì dùng lại file cũ; hai video trùng tên ở hai thư mục khác nhau không đè lên nhau.
   */
  async extractAudio(path: string, destDir: string, mode: AudioDerive = 'extract'): Promise<ExtractAudioResult> {
    if (!existsSync(path)) return { ok: false, error: 'missing' }
    if (!this.hasTools()) return { ok: false, error: 'ffmpeg-missing' }
    try {
      const { cacheKey, info } = await this.probeCached(path)
      // Trích xuất: chỉ từ video. Xóa giọng: từ video hoặc file âm thanh, phải là stereo. Xử lý âm thanh: video/âm thanh.
      if (!info.hasAudio || (mode === 'extract' && info.kind !== 'video')) return { ok: false, error: 'no-audio' }
      if (mode === 'karaoke' && (info.audioChannels ?? 0) < 2) return { ok: false, error: 'mono' }
      const fxKey = fxKeyOf(mode)
      const fx = fxKey !== null ? parseAudioFxKey(fxKey) : null
      const af = fx ? audioFxChain(fx) : null
      if (fxKey !== null && !af) return { ok: false, error: 'failed', detail: `Thiết lập xử lý âm thanh không hợp lệ: ${fxKey}` }
      if (fx?.denoise && !existsSync(join(this.modelsDir, DENOISE_MODEL))) {
        return { ok: false, error: 'failed', detail: `Thiếu mô hình khử ồn: ${join(this.modelsDir, DENOISE_MODEL)}` }
      }
      // Bản xóa giọng: băm thêm phiên bản bộ lọc → đổi bộ lọc thì tạo file mới, không dùng lại bản cũ
      // Xử lý âm thanh: băm thêm chuỗi bộ lọc → sửa công thức thì tạo file mới
      const hash =
        mode === 'karaoke'
          ? createHash('sha1').update(`${cacheKey}|karaoke-v${KARAOKE_VERSION}`).digest('hex')
          : af
            ? createHash('sha1').update(`${cacheKey}|${af}`).digest('hex')
            : cacheKey
      const dest = join(destDir, derivedFileName(fileNameOf(path), mode, hash))
      if (existsSync(dest)) return { ok: true, path: dest }
      await mkdir(destDir, { recursive: true })
      const partial = `${dest}.part`
      try {
        const args = af
          ? voiceArgs(path, partial, af)
          : mode === 'karaoke'
            ? karaokeArgs(path, partial)
            : extractAudioArgs(path, partial, info.audioCodec)
        // Chạy trong thư mục mô hình: bộ lọc khử ồn chỉ cần tên file mô hình (đường dẫn file vào/ra là tuyệt đối)
        await runProcess(this.ffmpegExe, args, { cwd: af ? this.modelsDir : undefined })
        await rename(partial, dest)
      } finally {
        await rm(partial, { force: true })
      }
      return { ok: true, path: dest }
    } catch (err) {
      return { ok: false, error: 'failed', detail: (err as Error).message }
    }
  }

  // ───────── Đo độ to (Chuẩn hóa âm lượng) ─────────

  /**
   * Độ to tích hợp (LUFS, chuẩn EBU R128) của đoạn file mà clip đang dùng.
   * @returns null nếu không có tiếng / im lặng / lỗi
   */
  async measureLoudness(path: string, startUs: number, durationUs: number): Promise<number | null> {
    if (!existsSync(path) || !this.hasTools()) return null
    try {
      const { stderr } = await runProcess(this.ffmpegExe, loudnessArgs(path, startUs / 1e6, Math.max(0.1, durationUs / 1e6)))
      return parseIntegratedLoudness(stderr)
    } catch {
      return null
    }
  }

  // ───────── Chuẩn bị để hiển thị ─────────

  /** Thumbnail + URL phát. Gọi nhiều lần cho cùng 1 file cũng chỉ xử lý 1 lần. */
  prepare(path: string): Promise<MediaPreview> {
    const key = pathKey(path)
    const existing = this.previews.get(key)
    if (existing && existing.status === 'ready') return Promise.resolve(existing)

    let pending = this.preparing.get(key)
    if (!pending) {
      pending = this.doPrepare(path).finally(() => this.preparing.delete(key))
      this.preparing.set(key, pending)
    }
    return pending
  }

  private async doPrepare(path: string): Promise<MediaPreview> {
    const base: MediaPreview = {
      path,
      status: 'ready',
      thumbnailUrl: null,
      waveformUrl: null,
      playbackUrl: null,
      proxy: 'not-needed',
      proxyProgress: 0,
      error: null
    }

    if (!existsSync(path)) return this.store({ ...base, status: 'missing' })
    if (!this.hasTools()) return this.store({ ...base, status: 'error', error: 'ffmpeg-missing' })

    let cacheKey: string
    let info: ProbeInfo
    try {
      ;({ cacheKey, info } = await this.probeCached(path))
    } catch (err) {
      return this.store({ ...base, status: 'error', error: (err as Error).message })
    }

    const dir = join(this.options.cacheRoot, cacheKey)
    await mkdir(dir, { recursive: true })

    // Thumbnail (ảnh nhỏ) – nhanh, làm ngay. File âm thanh không có hình.
    let thumbnailUrl: string | null = null
    if (info.kind !== 'audio') {
      const thumb = join(dir, 'thumb.jpg')
      if (!existsSync(thumb)) {
        try {
          await runProcess(this.ffmpegExe, thumbnailArgs(info, path, `${thumb}.part.jpg`))
          await rename(`${thumb}.part.jpg`, thumb)
        } catch {
          // Không có thumbnail cũng không sao – giao diện sẽ hiện biểu tượng thay thế
        }
      }
      if (existsSync(thumb)) thumbnailUrl = mediaUrl(thumb)
    }

    // Sóng âm (cho clip có tiếng trên timeline) – nhanh, làm ngay; lỗi thì bỏ qua
    let waveformUrl: string | null = null
    if (info.hasAudio && info.kind !== 'image') {
      const wave = join(dir, 'waveform.png')
      if (!existsSync(wave)) {
        try {
          await runProcess(this.ffmpegExe, waveformArgs(path, `${wave}.part.png`))
          await rename(`${wave}.part.png`, wave)
        } catch {
          // không có sóng âm cũng không sao
        }
      }
      if (existsSync(wave)) waveformUrl = mediaUrl(wave)
    }

    return this.choosePlayback(path, info, dir, { ...base, thumbnailUrl, waveformUrl })
  }

  // ───────── Bản phát & chất lượng Xem trước ─────────

  /**
   * Bản dùng để phát file này theo chất lượng hiện tại.
   * @returns null = phát thẳng file gốc; số = cạnh ngắn của bản proxy cần dùng
   */
  private wantedProxy(path: string, info: ProbeInfo): { kind: ProxyKind; shortSide: number } | null {
    const kind = proxyNeeded(info, path)
    if (!kind) return null
    if (kind !== 'video') return { kind, shortSide: PROXY_SHORT_SIDE }
    if (this.quality === 'full' && canPlayOriginal(info, path)) return null
    return { kind, shortSide: PROXY_SHORT_SIDES[this.quality] }
  }

  /** Đặt bản phát: file gốc, proxy đã có sẵn, hoặc xếp hàng tạo proxy (tạm phát bản proxy khác nếu có). */
  private async choosePlayback(path: string, info: ProbeInfo, dir: string, current: MediaPreview): Promise<MediaPreview> {
    const wanted = this.wantedProxy(path, info)
    if (!wanted) {
      const { mtimeMs } = await stat(path)
      return this.store({ ...current, playbackUrl: mediaUrl(path, Math.round(mtimeMs)), proxy: 'not-needed', proxyProgress: 0 })
    }
    const proxyPath = join(dir, proxyFileName(wanted.kind, wanted.shortSide))
    if (existsSync(proxyPath)) {
      return this.store({ ...current, playbackUrl: mediaUrl(proxyPath), proxy: 'ready', proxyProgress: 1 })
    }
    // Đang tạo bản mới (vd. vừa chuyển Thấp → Cao): vẫn xem được bằng bản proxy cũ trong lúc chờ
    const fallback =
      wanted.kind === 'video'
        ? Object.values(PROXY_SHORT_SIDES)
            .map((side) => join(dir, proxyFileName('video', side)))
            .find((p) => existsSync(p))
        : undefined
    // Chưa có bản proxy nào mà file gốc phát được (vd. H.264 4K của máy ảnh) → tạm phát file gốc, khỏi màn hình trống
    const original = !fallback && canPlayOriginal(info, path) ? mediaUrl(path, Math.round((await stat(path)).mtimeMs)) : null
    const playbackUrl = fallback ? mediaUrl(fallback) : original
    const preview = this.store({ ...current, playbackUrl, proxy: 'queued', proxyProgress: 0 })
    this.enqueue({ path, kind: wanted.kind, info, dest: proxyPath, shortSide: wanted.shortSide, controller: new AbortController() })
    return preview
  }

  /**
   * Đổi chất lượng Xem trước: bỏ các bản proxy video đang chờ tạo không còn cần, chọn lại bản phát
   * cho mọi video đã mở (bản đã tạo trước đây được dùng lại ngay, không phải tạo lại).
   */
  async setPreviewQuality(quality: PreviewQuality): Promise<void> {
    if (quality === this.quality) return
    this.quality = quality
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].kind === 'video') this.queue.splice(i, 1)
    if (this.running?.kind === 'video') {
      const wanted = this.wantedProxy(this.running.path, this.running.info)
      if (wanted?.shortSide !== this.running.shortSide) this.running.controller.abort()
    }
    for (const preview of [...this.previews.values()]) {
      if (preview.status !== 'ready') continue
      const probed = this.probeCache.get(pathKey(preview.path))
      if (probed?.info.kind !== 'video') continue
      await this.choosePlayback(preview.path, probed.info, join(this.options.cacheRoot, probed.cacheKey), preview)
    }
  }

  // ───────── Hàng đợi proxy ─────────

  private enqueue(job: ProxyJob): void {
    const duplicate = this.running?.dest === job.dest || this.queue.some((j) => j.dest === job.dest)
    if (!duplicate) this.queue.push(job)
    void this.pump()
  }

  /** Hủy tạo proxy của một file (vd. khi đóng app). */
  cancelAll(): void {
    this.queue.length = 0
    this.running?.controller.abort()
  }

  /** Chạy lần lượt từng job – tạo proxy rất nặng CPU nên chỉ 1 job một lúc. */
  private async pump(): Promise<void> {
    if (this.running) return
    const job = this.queue.shift()
    if (!job) return
    this.running = job

    const key = pathKey(job.path)
    const update = (changes: Partial<MediaPreview>): void => {
      const current = this.previews.get(key)
      if (current) this.store({ ...current, ...changes })
    }

    update({ proxy: 'running', proxyProgress: 0 })
    const partial = `${job.dest}.part`
    let lastEmit = 0
    try {
      await runProcess(this.ffmpegExe, proxyArgs(job.kind, job.path, partial, job.shortSide), {
        signal: job.controller.signal,
        onStdoutLine: (line) => {
          const doneUs = parseProgressLine(line)
          const now = Date.now()
          // Gửi cập nhật tối đa 5 lần/giây cho nhẹ
          if (doneUs === null || job.info.durationUs <= 0 || now - lastEmit < 200) return
          lastEmit = now
          update({ proxyProgress: Math.min(0.99, doneUs / job.info.durationUs) })
        }
      })
      await rename(partial, job.dest)
      // Người dùng đã đổi chất lượng trong lúc tạo → bản này vẫn giữ trong cache nhưng không đổi bản phát
      const wanted = this.wantedProxy(job.path, job.info)
      if (wanted?.shortSide === job.shortSide) update({ proxy: 'ready', proxyProgress: 1, playbackUrl: mediaUrl(job.dest) })
    } catch (err) {
      await rm(partial, { force: true })
      if ((err as Error).name !== 'AbortError') {
        // Proxy lỗi: vẫn thử phát file gốc – có thể Chromium đọc được
        const { mtimeMs } = await stat(job.path).catch(() => ({ mtimeMs: 0 }))
        update({ proxy: 'error', error: (err as Error).message, playbackUrl: mediaUrl(job.path, Math.round(mtimeMs)) })
      }
    } finally {
      this.running = null
      void this.pump()
    }
  }

  // ───────── Tiện ích ─────────

  private store(preview: MediaPreview): MediaPreview {
    this.previews.set(pathKey(preview.path), preview)
    this.options.onUpdate(preview)
    return preview
  }

  /** Probe có cache: cùng file chưa đổi thì không chạy lại ffprobe. */
  private async probeCached(path: string): Promise<{ cacheKey: string; info: ProbeInfo }> {
    const s = await stat(path)
    const cacheKey = createHash('sha1')
      .update(`${pathKey(path)}|${s.size}|${Math.round(s.mtimeMs)}`)
      .digest('hex')
      .slice(0, 20)
    const cached = this.probeCache.get(pathKey(path))
    if (cached?.cacheKey === cacheKey) return cached
    const info = await probeFile(this.ffprobeExe, path)
    const entry = { cacheKey, info }
    this.probeCache.set(pathKey(path), entry)
    return entry
  }
}

/** Như Promise.all(items.map(fn)) nhưng chỉ chạy tối đa `limit` việc cùng lúc. Giữ nguyên thứ tự kết quả. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
