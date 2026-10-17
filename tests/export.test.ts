// Test xuất video: phần dựng lệnh (hàm thuần) + xuất thật bằng ffmpeg rồi đọc lại từng điểm ảnh.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ExportProgress } from '@shared/ipc'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset, Project } from '@shared/project/schema'
import { ffmpegColorFilters, saturateMatrix } from '@shared/render/colorMath'
import { createMediaClip } from '@shared/timeline/clips'
import { Exporter } from '../src/main/export/exporter'
import { atempoChain, buildExportGraph } from '../src/main/export/graphBuilder'

const S = 1_000_000

describe('dựng lệnh xuất (hàm thuần)', () => {
  it('atempo nối nhiều lần khi tốc độ ngoài 0.5…2', () => {
    expect(atempoChain(1)).toEqual([])
    expect(atempoChain(1.5)).toEqual(['atempo=1.5'])
    expect(atempoChain(4)).toEqual(['atempo=2', 'atempo=2'])
    expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5'])
    expect(atempoChain(3)).toEqual(['atempo=2', 'atempo=1.5'])
  })

  it('bộ lọc màu: không chỉnh thì không thêm gì; ma trận bão hòa giữ nguyên màu xám', () => {
    expect(ffmpegColorFilters({ brightness: 0, contrast: 0, saturation: 0 })).toEqual([])
    expect(ffmpegColorFilters({ brightness: 20, contrast: 0, saturation: 0 })[0]).toContain('lutrgb')
    // Mỗi hàng của ma trận cộng lại = 1 → màu xám (R=G=B) không bị đổi
    for (const row of saturateMatrix(1.7)) expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })

  it('dự án trống chỉ có nền + tiếng im lặng', () => {
    const p = createEmptyProject('t')
    const g = buildExportGraph(p, { width: 1280, height: 720, fps: 30, pixelFormat: 'yuv420p' })
    expect(g.inputArgs).toEqual([])
    expect(g.filterGraph).toContain('anullsrc')
  })
})

// ───────── Xuất thật ─────────

const ffmpegDir = join(__dirname, '..', 'resources', 'ffmpeg')
const ffmpeg = join(ffmpegDir, 'ffmpeg.exe')
const ffprobe = join(ffmpegDir, 'ffprobe.exe')

/** Đọc màu 1 điểm ảnh của video tại thời điểm t (giây) → [r, g, b]. */
function pixelAt(file: string, t: number, x: number, y: number): number[] {
  const out = execFileSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file,
    '-frames:v', '1', '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
  ])
  return [...out.subarray(0, 3)]
}
/** Âm lượng trung bình (dB) của đoạn [from, from+length] giây. */
function meanVolumeDb(file: string, from: number, length: number): number {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-ss', String(from), '-t', String(length), '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
  const match = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr)
  if (!match) throw new Error(r.stderr)
  return Number(match[1])
}
const near = (actual: number[], expected: number[], tolerance = 20): boolean =>
  actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance)

describe.skipIf(!existsSync(ffmpeg))('xuất video thật bằng ffmpeg', () => {
  let dir: string
  let project: Project
  const files = { red: '', blue: '', wav: '', out: '' }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cutcap-export-'))
    files.red = join(dir, 'Đỏ có tiếng.mp4')
    files.blue = join(dir, 'Xanh.png')
    files.wav = join(dir, 'Nhạc.wav')
    files.out = join(dir, 'Kết quả.mp4')
    const q = ['-hide_banner', '-loglevel', 'error', '-y']
    execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30', '-f', 'lavfi', '-i', 'sine=frequency=440',
      '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', files.red])
    execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=blue:s=200x200', '-frames:v', '1', '-update', '1', files.blue])
    execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'sine=frequency=220', '-t', '3', files.wav])

    const asset = (id: string, kind: MediaAsset['kind'], path: string, sec: number, w: number | null, h: number | null): MediaAsset =>
      ({ id, kind, path, name: id, durationUs: sec * S, width: w, height: h, fps: 30, hasAudio: kind !== 'image' })

    // Video chính: đỏ [0–2s] (lấy từ giây 1 của file) + đỏ tốc độ 2× tối đi 50% [2–3s]
    // Lớp phủ: ảnh xanh [0.5–1.5s] thu nhỏ 50%. Nhạc nền [0–3s].
    project = createEmptyProject('Xuất thử')
    project.settings.resolution = '720p'
    project.assets.red = asset('red', 'video', files.red, 4, 640, 360)
    project.assets.blue = asset('blue', 'image', files.blue, 0, 200, 200)
    project.assets.wav = asset('wav', 'audio', files.wav, 3, null, null)
    const main = project.tracks[0].id
    const overlay = ops.addTrack(project, 'video')
    const music = ops.addTrack(project, 'audio')
    // Tiếng của video đỏ tắt (volume 0) để đo riêng được tiếng nhạc nền có fade
    ops.addClip(project, main, { ...createMediaClip(project.assets.red, 0), duration: 2 * S, sourceIn: 1 * S, volume: 0 })
    ops.addClip(project, main, {
      ...createMediaClip(project.assets.red, 2 * S),
      duration: 1 * S,
      speed: 2,
      volume: 0,
      adjust: { brightness: -50, contrast: 0, saturation: 0 }
    })
    ops.addClip(project, overlay, {
      ...createMediaClip(project.assets.blue, 0.5 * S),
      duration: 1 * S,
      transform: { x: 0.5, y: 0.5, scale: 0.5, rotation: 0, opacity: 1 }
    })
    // Nhạc nền: fade in 1s, fade out 1s
    ops.addClip(project, music, { ...createMediaClip(project.assets.wav, 0), duration: 3 * S, fadeIn: 1 * S, fadeOut: 1 * S })
  }, 60_000)

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('xuất MP4 đúng thời lượng, kích thước, có tiếng; màu từng thời điểm đúng như preview', async () => {
    const progress: ExportProgress[] = []
    const exporter = new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: (p) => progress.push(p) })
    const result = await exporter.run({
      project,
      settings: { outputPath: files.out, resolution: '720p', fps: 30, quality: 'standard', encoder: 'libx264' },
      textFrames: []
    })
    expect(result).toMatchObject({ status: 'done', encoder: 'libx264' })
    expect(existsSync(`${files.out}.part`)).toBe(false)

    const info = JSON.parse(
      execFileSync(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', files.out], { encoding: 'utf8' })
    )
    const video = info.streams.find((s: { codec_type: string }) => s.codec_type === 'video')
    const audio = info.streams.find((s: { codec_type: string }) => s.codec_type === 'audio')
    expect([video.width, video.height, video.codec_name, video.r_frame_rate]).toEqual([1280, 720, 'h264', '30/1'])
    expect(audio.codec_name).toBe('aac')
    expect(Math.abs(Number(info.format.duration) - 3)).toBeLessThan(0.1)

    // Giữa khung hình: đỏ → xanh (lớp phủ) → đỏ → đỏ tối (chỉnh sáng −50%)
    expect(near(pixelAt(files.out, 0.2, 640, 360), [255, 0, 0])).toBe(true)
    expect(near(pixelAt(files.out, 1.0, 640, 360), [0, 0, 255])).toBe(true)
    // Ảnh 200×200 vừa khung 720 → 720×720, ×0.5 → 360×360 → mép ở x = 460…820: ngoài mép vẫn là đỏ
    expect(near(pixelAt(files.out, 1.0, 400, 360), [255, 0, 0])).toBe(true)
    expect(near(pixelAt(files.out, 1.7, 640, 360), [255, 0, 0])).toBe(true)
    expect(near(pixelAt(files.out, 2.5, 640, 360), [128, 0, 0], 25)).toBe(true)

    // Tiếng: giữa fade in (0.5s) âm lượng = 1/2 → thấp hơn đoạn đủ âm lượng (1.5s) khoảng 6 dB;
    // đầu và cuối gần như im lặng. Đúng như công thức clipGainAt mà preview dùng.
    const full = meanVolumeDb(files.out, 1.4, 0.2)
    const halfIn = meanVolumeDb(files.out, 0.45, 0.1)
    const halfOut = meanVolumeDb(files.out, 2.45, 0.1)
    expect(full - halfIn).toBeGreaterThan(4.5)
    expect(full - halfIn).toBeLessThan(7.5)
    expect(full - halfOut).toBeGreaterThan(4.5)
    expect(full - halfOut).toBeLessThan(7.5)
    expect(full - meanVolumeDb(files.out, 0, 0.05)).toBeGreaterThan(20)
  }, 120_000)

  it('hủy giữa chừng: không để lại file dở dang', async () => {
    // Video dài 40s để kịp hủy
    const long = structuredClone(project)
    const main = long.tracks.find((t) => t.clips.some((c) => c.type === 'media' && c.assetId === 'red'))!
    main.clips[1].start = 40 * S
    const out = join(dir, 'Hủy.mp4')
    const exporter = new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => exporter.cancel() })
    const result = await exporter.run({
      project: long,
      settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'standard', encoder: 'libx264' },
      textFrames: []
    })
    expect(result.status).toBe('cancelled')
    expect(existsSync(out)).toBe(false)
    expect(existsSync(`${out}.part`)).toBe(false)
  }, 60_000)
})
