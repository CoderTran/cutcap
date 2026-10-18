// Xuất video có Làm đẹp: FFmpeg không tự làm được (cần AI nhận diện mặt + WebGL), nên mỗi clip làm đẹp
// được "vẽ lại" trước khi xuất:
//   FFmpeg giải mã đoạn clip → từng khung RGBA → giao diện (AI + WebGL, đúng code của khung Xem trước)
//   → khung đã làm đẹp gửi về → FFmpeg ghi thành file tạm chất lượng cao → lệnh xuất dùng file này thay file gốc.
// Giao diện kéo từng khung (read) rồi đẩy lại (write) → không bao giờ giữ quá vài khung trong bộ nhớ.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { BeautyJobInfo, BeautyJobRequest } from '@shared/ipc'

interface Job {
  decoder: ChildProcessWithoutNullStreams
  encoder: ChildProcessWithoutNullStreams
  frameSize: number
  /** Khung đã giải mã, chờ giao diện lấy. */
  queue: Buffer[]
  pending: Buffer[]
  pendingBytes: number
  ended: boolean
  waiter: ((frame: Buffer | null) => void) | null
  output: string
  dir: string
  encoderDone: Promise<number | null>
  stderr: string
}

/** Giữ tối đa bấy nhiêu khung chờ – đủ để giao diện không phải đợi, không tốn bộ nhớ. */
const MAX_QUEUED = 3

export class BeautyJobs {
  private readonly jobs = new Map<string, Job>()
  private next = 1

  constructor(
    private readonly ffmpegExe: string,
    private readonly tempDir: string
  ) {}

  async open(req: BeautyJobRequest): Promise<BeautyJobInfo> {
    const id = `b${Date.now()}-${this.next++}`
    const dir = join(this.tempDir, `beauty-${id}`)
    await mkdir(dir, { recursive: true })
    const { width: w, height: h, fps } = req
    const output = join(dir, req.image ? 'frame.png' : 'clip.mp4')
    const sec = (us: number): string => (us / 1_000_000).toFixed(6)

    // Giải mã: đúng đoạn cần, đổi cỡ, nhịp khung đều (CFR) → số khung xác định
    const decoder = spawn(
      this.ffmpegExe,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        ...(req.image ? [] : ['-ss', sec(req.startUs), '-t', sec(req.durationUs)]),
        '-i',
        req.path,
        '-an',
        '-sn',
        '-vf',
        `scale=${w}:${h}:flags=bicubic,format=rgba`,
        ...(req.image ? ['-frames:v', '1'] : ['-r', String(fps)]),
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        'pipe:1'
      ],
      { windowsHide: true }
    )
    // Ghi: H.264 gần như không mất chất lượng (crf 12) – chỉ là file trung gian
    const encoder = spawn(
      this.ffmpegExe,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        '-s',
        `${w}x${h}`,
        '-r',
        String(fps),
        '-i',
        'pipe:0',
        ...(req.image
          ? ['-frames:v', '1', '-update', '1', output]
          : [
              '-c:v',
              'libx264',
              '-preset',
              'veryfast',
              '-crf',
              '12',
              '-pix_fmt',
              'yuv420p',
              '-g',
              String(Math.max(1, Math.round(fps))),
              output
            ])
      ],
      { windowsHide: true }
    )
    const job: Job = {
      decoder,
      encoder,
      frameSize: w * h * 4,
      queue: [],
      pending: [],
      pendingBytes: 0,
      ended: false,
      waiter: null,
      output,
      dir,
      encoderDone: new Promise((resolve) => encoder.on('close', resolve)),
      stderr: ''
    }
    decoder.stdout.on('data', (chunk: Buffer) => this.onData(job, chunk))
    decoder.stderr.on('data', (c: Buffer) => (job.stderr = (job.stderr + c.toString()).slice(-4000)))
    encoder.stderr.on('data', (c: Buffer) => (job.stderr = (job.stderr + c.toString()).slice(-4000)))
    encoder.stdin.on('error', () => {}) // encoder thoát sớm (lỗi / hủy) – báo lỗi ở close()
    decoder.on('close', () => {
      job.ended = true
      this.flush(job)
    })
    this.jobs.set(id, job)
    const frames = req.image ? 1 : Math.max(1, Math.round((req.durationUs / 1_000_000) * fps))
    return { id, frames }
  }

  /** Khung tiếp theo (RGBA, hàng đầu là đỉnh ảnh), null = hết. */
  read(id: string): Promise<Buffer | null> {
    const job = this.jobs.get(id)
    if (!job) return Promise.resolve(null)
    const frame = job.queue.shift()
    if (job.queue.length < MAX_QUEUED) job.decoder.stdout.resume()
    if (frame) return Promise.resolve(frame)
    if (job.ended) return Promise.resolve(null)
    return new Promise((resolve) => (job.waiter = resolve))
  }

  async write(id: string, frame: Uint8Array): Promise<void> {
    const job = this.jobs.get(id)
    if (!job || frame.byteLength !== job.frameSize) throw new Error('Khung hình làm đẹp sai kích thước')
    if (!job.encoder.stdin.write(frame)) await new Promise<void>((r) => job.encoder.stdin.once('drain', () => r()))
  }

  /**
   * Kết thúc: ok = true → chờ ghi xong, trả về đường dẫn file; false (hủy / lỗi) → dọn dẹp, trả về null.
   */
  async close(id: string, ok: boolean): Promise<string | null> {
    const job = this.jobs.get(id)
    if (!job) return null
    this.jobs.delete(id)
    job.decoder.kill()
    if (!ok) {
      job.encoder.kill()
      await job.encoderDone
      await rm(job.dir, { recursive: true, force: true })
      return null
    }
    job.encoder.stdin.end()
    const code = await job.encoderDone
    if (code !== 0) {
      await rm(job.dir, { recursive: true, force: true })
      throw new Error(`Ghi khung hình làm đẹp thất bại: ${job.stderr.trim().split('\n').slice(-3).join(' | ')}`)
    }
    return job.output
  }

  cancelAll(): void {
    for (const id of [...this.jobs.keys()]) void this.close(id, false)
  }

  /** Ghép dữ liệu từ ffmpeg thành từng khung đủ kích thước. */
  private onData(job: Job, chunk: Buffer): void {
    job.pending.push(chunk)
    job.pendingBytes += chunk.length
    // Chỉ ghép khi đã đủ ít nhất 1 khung (ghép mỗi lần nhận vài KB sẽ chép đi chép lại cả khung 8 MB)
    if (job.pendingBytes >= job.frameSize) {
      const all = Buffer.concat(job.pending, job.pendingBytes)
      let offset = 0
      while (all.length - offset >= job.frameSize) {
        job.queue.push(all.subarray(offset, offset + job.frameSize))
        offset += job.frameSize
      }
      const rest = all.subarray(offset)
      job.pending = rest.length ? [rest] : []
      job.pendingBytes = rest.length
    }
    if (job.queue.length >= MAX_QUEUED) job.decoder.stdout.pause()
    this.flush(job)
  }

  private flush(job: Job): void {
    if (!job.waiter) return
    const frame = job.queue.shift()
    if (frame) {
      const w = job.waiter
      job.waiter = null
      w(frame)
      if (job.queue.length < MAX_QUEUED) job.decoder.stdout.resume()
    } else if (job.ended) {
      const w = job.waiter
      job.waiter = null
      w(null)
    }
  }
}
