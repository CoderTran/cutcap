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
import { isAbsolute, join, relative } from 'node:path'
import type { ImportMediaResult, MediaPreview } from '@shared/ipc'
import { fileNameOf, mediaKindFromPath } from '@shared/media/formats'
import { createId } from '@shared/project/factory'
import { ProbeError, probeFile, type ProbeInfo } from './probe'
import { parseProgressLine, runProcess } from './processRunner'
import { proxyArgs, proxyFileName, proxyNeeded, thumbnailArgs, type ProxyKind } from './transcode'
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

  constructor(private readonly options: MediaServiceOptions) {}

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

    // Bản phát: file gốc, proxy đã có sẵn, hoặc xếp hàng tạo proxy
    const kind = proxyNeeded(info, path)
    if (!kind) {
      const { mtimeMs } = await stat(path)
      return this.store({ ...base, thumbnailUrl, playbackUrl: mediaUrl(path, Math.round(mtimeMs)) })
    }
    const proxyPath = join(dir, proxyFileName(kind))
    if (existsSync(proxyPath)) {
      return this.store({ ...base, thumbnailUrl, playbackUrl: mediaUrl(proxyPath), proxy: 'ready', proxyProgress: 1 })
    }

    const preview = this.store({ ...base, thumbnailUrl, proxy: 'queued' })
    this.enqueue({ path, kind, info, dest: proxyPath, controller: new AbortController() })
    return preview
  }

  // ───────── Hàng đợi proxy ─────────

  private enqueue(job: ProxyJob): void {
    const key = pathKey(job.path)
    const duplicate = this.running?.path === job.path || this.queue.some((j) => pathKey(j.path) === key)
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
      await runProcess(this.ffmpegExe, proxyArgs(job.kind, job.path, partial), {
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
      update({ proxy: 'ready', proxyProgress: 1, playbackUrl: mediaUrl(job.dest) })
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
