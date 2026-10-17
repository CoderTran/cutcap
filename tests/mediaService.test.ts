// Test tích hợp: chạy ffmpeg/ffprobe THẬT trên file media tạo tạm.
// Tự bỏ qua nếu chưa có FFmpeg (chạy "npm run setup:ffmpeg" trước).
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { MediaPreview } from '@shared/ipc'
import { MediaService } from '../src/main/media/mediaService'
import { filePathFromMediaUrl } from '../src/main/media/mediaUrl'
import { runProcess } from '../src/main/media/processRunner'

const ffmpegDir = join(__dirname, '..', 'resources', 'ffmpeg')
const hasFfmpeg = existsSync(join(ffmpegDir, 'ffmpeg.exe'))
const ffmpeg = join(ffmpegDir, 'ffmpeg.exe')

describe.skipIf(!hasFfmpeg)('MediaService với ffmpeg thật', () => {
  let dir: string
  let updates: MediaPreview[]
  let service: MediaService
  const files = {} as Record<'mp4' | 'mkv' | 'png' | 'wav' | 'txt', string>

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cutcap-media-'))
    // Đường dẫn có dấu tiếng Việt + khoảng trắng để chắc chắn không lỗi mã hóa ký tự
    files.mp4 = join(dir, 'Video thử.mp4')
    files.mkv = join(dir, 'Phim dọc.mkv')
    files.png = join(dir, 'Ảnh.png')
    files.wav = join(dir, 'Nhạc nền.wav')
    files.txt = join(dir, 'ghi chú.txt')

    const src = ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440']
    const q = ['-hide_banner', '-loglevel', 'error', '-y']
    await runProcess(ffmpeg, [...q, ...src, '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', files.mp4])
    // MKV + HEVC + khung dọc → chắc chắn cần proxy
    await runProcess(ffmpeg, [
      ...q, '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30', '-t', '3', '-c:v', 'libx265', '-x265-params', 'log-level=error', files.mkv
    ])
    await runProcess(ffmpeg, [...q, '-f', 'lavfi', '-i', 'testsrc2=size=800x600', '-frames:v', '1', '-update', '1', files.png])
    await runProcess(ffmpeg, [...q, '-f', 'lavfi', '-i', 'sine=frequency=220', '-t', '1.5', files.wav])
    await writeFile(files.txt, 'không phải media')

    updates = []
    service = new MediaService({ ffmpegDir, cacheRoot: join(dir, 'cache'), onUpdate: (p) => updates.push(p) })
  }, 60_000)

  afterAll(async () => {
    service?.cancelAll()
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('nhập file: đúng loại, thời lượng, kích thước; báo lỗi file không hỗ trợ / không tồn tại', async () => {
    const results = await service.importFiles([files.mp4, files.mkv, files.png, files.wav, files.txt, join(dir, 'mất.mp4')])
    const [mp4, mkv, png, wav, txt, missing] = results

    expect(mp4.ok && mp4.asset).toMatchObject({ kind: 'video', width: 640, height: 360, hasAudio: true, name: 'Video thử.mp4' })
    expect(mp4.ok && Math.abs(mp4.asset.durationUs - 2_000_000)).toBeLessThan(100_000)
    expect(mkv.ok && mkv.asset).toMatchObject({ kind: 'video', width: 360, height: 640, hasAudio: false })
    expect(png.ok && png.asset).toMatchObject({ kind: 'image', durationUs: 0, width: 800 })
    expect(wav.ok && wav.asset).toMatchObject({ kind: 'audio', hasAudio: true })
    expect(txt).toMatchObject({ ok: false, error: 'unsupported' })
    expect(missing).toMatchObject({ ok: false, error: 'missing' })
  }, 30_000)

  it('MP4 H.264: có thumbnail, phát trực tiếp file gốc', async () => {
    const p = await service.prepare(files.mp4)
    expect(p).toMatchObject({ status: 'ready', proxy: 'not-needed' })
    expect(existsSync(filePathFromMediaUrl(p.thumbnailUrl!)!)).toBe(true)
    expect(filePathFromMediaUrl(p.playbackUrl!)).toBe(files.mp4)
  }, 30_000)

  it('MKV/HEVC: xếp hàng tạo proxy, báo tiến trình, xong thì có URL proxy', async () => {
    const first = await service.prepare(files.mkv)
    expect(first.proxy).toBe('queued')
    expect(first.playbackUrl).toBeNull()

    // Chờ tới khi proxy xong
    const deadline = Date.now() + 30_000
    while (!updates.some((u) => u.path === files.mkv && u.proxy === 'ready')) {
      if (Date.now() > deadline) throw new Error('Tạo proxy quá lâu')
      await new Promise((r) => setTimeout(r, 100))
    }
    const done = updates.filter((u) => u.path === files.mkv).at(-1)!
    const proxyPath = filePathFromMediaUrl(done.playbackUrl!)!
    expect(proxyPath.endsWith('proxy.mp4')).toBe(true)
    expect(existsSync(proxyPath)).toBe(true)

    // Gọi lại: dùng proxy có sẵn, không tạo lại
    expect((await service.prepare(files.mkv)).proxy).toBe('ready')
  }, 40_000)

  it('ảnh và âm thanh', async () => {
    const png = await service.prepare(files.png)
    expect(png.thumbnailUrl).not.toBeNull()
    const wav = await service.prepare(files.wav)
    expect(wav).toMatchObject({ thumbnailUrl: null, proxy: 'not-needed' })
  }, 30_000)

  it('chỉ cho đọc file media hoặc file trong cache', () => {
    expect(service.isAllowedPath(files.mp4)).toBe(true)
    expect(service.isAllowedPath(join(dir, 'cache', 'abc', 'thumb.jpg'))).toBe(true)
    expect(service.isAllowedPath('C:\\Windows\\win.ini')).toBe(false)
    expect(service.isAllowedPath('relative.mp4')).toBe(false)
  })
})
