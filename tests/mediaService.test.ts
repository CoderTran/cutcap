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
    expect(proxyPath.endsWith('proxy-1080.mp4')).toBe(true) // mặc định chất lượng "Cao"
    expect(existsSync(proxyPath)).toBe(true)

    // Gọi lại: dùng proxy có sẵn, không tạo lại
    expect((await service.prepare(files.mkv)).proxy).toBe('ready')
  }, 40_000)

  it('đổi chất lượng xem trước: tạo bản mới (tạm phát bản cũ), đổi lại thì dùng ngay bản đã có; "Đầy đủ" phát file gốc', async () => {
    const lastOf = (path: string): MediaPreview => updates.filter((u) => u.path === path).at(-1)!
    const waitReady = async (path: string, suffix: string): Promise<void> => {
      const deadline = Date.now() + 30_000
      while (!(lastOf(path).proxy === 'ready' && filePathFromMediaUrl(lastOf(path).playbackUrl ?? '')?.endsWith(suffix))) {
        if (Date.now() > deadline) throw new Error(`Chờ ${suffix} quá lâu`)
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    await service.setPreviewQuality('low')
    const switching = lastOf(files.mkv)
    expect(['queued', 'running']).toContain(switching.proxy)
    expect(filePathFromMediaUrl(switching.playbackUrl!)!.endsWith('proxy-1080.mp4')).toBe(true) // tạm phát bản 1080p
    await waitReady(files.mkv, 'proxy.mp4')
    await service.setPreviewQuality('high')
    expect(lastOf(files.mkv)).toMatchObject({ proxy: 'ready' })
    expect(filePathFromMediaUrl(lastOf(files.mkv).playbackUrl!)!.endsWith('proxy-1080.mp4')).toBe(true)

    // Video máy ảnh lớn hơn Full HD (H.264 yuvj420p, .MOV): "Đầy đủ" = file gốc, "Trung bình" = proxy 720p
    const big = join(dir, 'Máy ảnh.mov')
    await runProcess(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=2400x1350:rate=30', '-t', '1',
      '-c:v', 'libx264', '-pix_fmt', 'yuvj420p', big
    ])
    await service.setPreviewQuality('full')
    const full = await service.prepare(big)
    expect(full.proxy).toBe('not-needed')
    expect(filePathFromMediaUrl(full.playbackUrl!)).toBe(big)
    await service.setPreviewQuality('medium')
    await waitReady(big, 'proxy-720.mp4')
    await service.setPreviewQuality('high')
  }, 90_000)

  it('ảnh và âm thanh', async () => {
    const png = await service.prepare(files.png)
    expect(png.thumbnailUrl).not.toBeNull()
    const wav = await service.prepare(files.wav)
    expect(wav).toMatchObject({ thumbnailUrl: null, proxy: 'not-needed' })
    expect(existsSync(filePathFromMediaUrl(wav.waveformUrl!)!)).toBe(true)
    expect(png.waveformUrl).toBeNull()
  }, 30_000)

  it('trích xuất âm thanh: ra file .m4a đúng thời lượng; lần sau dùng lại; video không tiếng thì báo lỗi', async () => {
    const out = join(dir, 'Âm thanh trích xuất')
    const first = await service.extractAudio(files.mp4, out)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.path.startsWith(out)).toBe(true)
    expect(first.path).toMatch(/Video thử \(âm thanh [0-9a-f]{6}\)\.m4a$/)
    const [audio] = await service.importFiles([first.path])
    expect(audio.ok && audio.asset).toMatchObject({ kind: 'audio', hasAudio: true })
    expect(audio.ok && Math.abs(audio.asset.durationUs - 2_000_000)).toBeLessThan(100_000)

    expect(await service.extractAudio(files.mp4, out)).toEqual(first) // không trích lại
    expect(await service.extractAudio(files.mkv, out)).toEqual({ ok: false, error: 'no-audio' })
    expect(await service.extractAudio(join(dir, 'mất.mp4'), out)).toEqual({ ok: false, error: 'missing' })
  })

  it('xóa giọng (karaoke): âm ở giữa bị triệt tiêu, âm lệch 2 bên còn lại; file mono báo lỗi', async () => {
    const out = join(dir, 'Âm thanh trích xuất')
    const q = ['-hide_banner', '-loglevel', 'error', '-y']
    // "Giọng hát" giả: cùng 1 tiếng ở 2 kênh (nằm giữa). "Nhạc cụ" giả: mỗi kênh 1 tiếng khác nhau.
    const center = join(dir, 'giữa.wav')
    const sides = join(dir, 'hai bên.wav')
    await runProcess(ffmpeg, [...q, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-ac', '2', center])
    await runProcess(ffmpeg, [
      ...q, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1',
      '-filter_complex', '[0:a][1:a]amerge=inputs=2', sides
    ])
    const peakDb = async (file: string): Promise<number> => {
      const { stderr } = await runProcess(ffmpeg, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'])
      return Number(/max_volume: (-?[\d.]+|-inf) dB/.exec(stderr)?.[1].replace('-inf', '-200'))
    }

    const a = await service.extractAudio(center, out, 'karaoke')
    const b = await service.extractAudio(sides, out, 'karaoke')
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.path).toMatch(/giữa \(bỏ giọng [0-9a-f]{6}\)\.m4a$/)
    expect(await peakDb(a.path)).toBeLessThan(-35) // giọng ở giữa gần như mất hẳn (gốc ≈ −3 dB)
    expect(await peakDb(b.path)).toBeGreaterThan((await peakDb(sides)) - 6) // nhạc lệch 2 bên vẫn rõ (giảm < 6 dB)
    // 2 kênh CÙNG PHA: trái − phải nhỏ hơn hẳn tiếng (chỉ còn chút khác biệt ở âm trầm giữ nguyên stereo).
    // Bộ lọc đầu tiên (ngược pha → nghe rất khó chịu) cho trái − phải còn TO HƠN cả tiếng.
    const diff = join(dir, 'hiệu.wav')
    await runProcess(ffmpeg, [...q, '-i', b.path, '-af', 'pan=mono|c0=c0-c1', diff])
    expect(await peakDb(diff)).toBeLessThan((await peakDb(b.path)) - 20)
    expect(await service.extractAudio(files.wav, out, 'karaoke')).toEqual({ ok: false, error: 'mono' })
  })

  it('đổi giọng: "Sóc chuột" nâng cao độ 1 quãng tám (220 Hz → 440 Hz), giữ độ dài; giọng lạ báo lỗi', async () => {
    const out = join(dir, 'Âm thanh trích xuất')
    const r = await service.extractAudio(files.wav, out, 'fx:d0e0vchipmunk')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.path).toMatch(/Nhạc nền \(xử lý [0-9a-f]{6}\)\.m4a$/)
    const band = async (f: number): Promise<number> => {
      const { stderr } = await runProcess(ffmpeg, ['-hide_banner', '-i', r.path, '-af', `bandpass=f=${f}:width_type=h:w=40,volumedetect`, '-f', 'null', '-'])
      return Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1])
    }
    expect((await band(440)) - (await band(220))).toBeGreaterThan(15)
    const [probe] = await service.importFiles([r.path])
    expect(probe.ok && Math.abs(probe.asset.durationUs - 1_500_000)).toBeLessThan(150_000) // tốc độ nói giữ nguyên
    expect(await service.extractAudio(files.wav, out, 'fx:d0e0vkhongco')).toMatchObject({ ok: false, error: 'failed' })
    expect(await service.extractAudio(files.wav, out, 'fx:linh-tinh')).toMatchObject({ ok: false, error: 'failed' })
    // Giảm ồn + rõ giọng (không đổi giọng) cũng chạy được
    expect((await service.extractAudio(files.wav, out, 'fx:d1e1v')).ok).toBe(true)
  })

  it('giảm tiếng ồn (AI RNNoise): ồn nền giảm > 20 dB, giữ đúng độ dài, không tụt tiếng giữa chừng', async () => {
    const q = ['-hide_banner', '-loglevel', 'error', '-y']
    const out = join(dir, 'Âm thanh trích xuất')
    // Ồn hồng + ồn nâu (giống tiếng ù / đường phố) suốt 8 giây, stereo
    const noisy = join(dir, 'có ồn.wav')
    await runProcess(ffmpeg, [
      ...q, '-filter_complex', 'anoisesrc=c=pink:a=0.08:d=8:r=48000[n];anoisesrc=c=brown:a=0.1:d=8:r=48000[b];[n][b]amix=inputs=2:normalize=0',
      '-ac', '2', noisy
    ])
    const r = await service.extractAudio(noisy, out, 'fx:d1e0v')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const rmsDb = async (file: string, start: number, length: number): Promise<number> => {
      const { stderr } = await runProcess(ffmpeg, ['-hide_banner', '-ss', String(start), '-t', String(length), '-i', file, '-af', 'astats=measure_perchannel=0', '-f', 'null', '-'])
      return Number(/RMS level dB: (-?[\d.]+|-inf)/.exec(stderr)?.[1].replace('-inf', '-200'))
    }
    expect((await rmsDb(noisy, 1, 6)) - (await rmsDb(r.path, 1, 6))).toBeGreaterThan(20)
    const [probe] = await service.importFiles([r.path])
    expect(probe.ok && Math.abs(probe.asset.durationUs - 8_000_000)).toBeLessThan(150_000)
  })

  it('đo độ to (Chuẩn hóa âm lượng): to gấp đôi → +6 dB; đo đúng đoạn; im lặng → null', async () => {
    const q = ['-hide_banner', '-loglevel', 'error', '-y']
    const loud = join(dir, 'to.wav')
    const quiet = join(dir, 'nhỏ.wav')
    const silent = join(dir, 'im.wav')
    await runProcess(ffmpeg, [...q, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4,volume=0.5', loud])
    await runProcess(ffmpeg, [...q, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4,volume=0.25', quiet])
    await runProcess(ffmpeg, [...q, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '2', silent])
    const a = (await service.measureLoudness(loud, 0, 4_000_000))!
    const b = (await service.measureLoudness(quiet, 1_000_000, 2_000_000))!
    expect(a - b).toBeGreaterThan(5.5)
    expect(a - b).toBeLessThan(6.5)
    expect(await service.measureLoudness(silent, 0, 2_000_000)).toBeNull()
  })

  it('chỉ cho đọc file media hoặc file trong cache', () => {
    expect(service.isAllowedPath(files.mp4)).toBe(true)
    expect(service.isAllowedPath(join(dir, 'cache', 'abc', 'thumb.jpg'))).toBe(true)
    expect(service.isAllowedPath('C:\\Windows\\win.ini')).toBe(false)
    expect(service.isAllowedPath('relative.mp4')).toBe(false)
  })
})
