// Tốc độ → Uốn cong: toán đường cong, cắt / tỉa clip uốn cong, và xuất thật khớp với preview.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset, MediaClip } from '@shared/project/schema'
import { applySpeed, applySpeedCurve } from '@shared/timeline/clipProps'
import { rateAt, sourceSpanOf, sourceTimeAt, timelineOffsetAt } from '@shared/timeline/clipTime'
import { createMediaClip, findClip } from '@shared/timeline/clips'
import { applyTrim, splitClip } from '@shared/timeline/edit'
import {
  bakeCurve,
  curveFactor,
  curveSegments,
  curveSpeedAt,
  parseSpeedCurve,
  presetCurve,
  sourceFracAt,
  speedAtPoint,
  timeFracAt,
  type SpeedCurve
} from '@shared/timeline/speedCurve'
import { Exporter } from '../src/main/export/exporter'

const S = 1_000_000
const flat = (v: number): SpeedCurve => ({
  preset: 'custom',
  points: [
    { x: 0, y: v },
    { x: 1, y: v }
  ],
  range: [0, 1]
})

describe('uốn cong – toán', () => {
  it('tốc độ đều: F = 1/v; mẫu Tùy chỉnh = 1×', () => {
    expect(curveFactor(flat(2))).toBeCloseTo(0.5, 6)
    expect(curveFactor(flat(0.5))).toBeCloseTo(2, 6)
    expect(curveFactor(presetCurve('custom'))).toBeCloseTo(1, 6)
  })

  it('đi qua đúng các điểm, không vượt quá điểm (không gợn), luôn trong 0.1×–10×', () => {
    for (const p of ['montage', 'hero', 'bullet', 'jumpCut', 'flashIn', 'flashOut'] as const) {
      const c = presetCurve(p)
      for (const q of c.points) expect(speedAtPoint(c.points, q.x)).toBeCloseTo(q.y, 6)
      const lo = Math.min(...c.points.map((q) => q.y))
      const hi = Math.max(...c.points.map((q) => q.y))
      for (let i = 0; i <= 200; i++) {
        const v = speedAtPoint(c.points, i / 200)
        expect(v).toBeGreaterThanOrEqual(lo - 1e-9)
        expect(v).toBeLessThanOrEqual(hi + 1e-9)
      }
    }
  })

  it('thời gian ↔ vị trí là hàm ngược của nhau; khúc xuất video cộng lại đúng tổng thời gian', () => {
    const c = presetCurve('hero')
    for (const x of [0, 0.1, 0.33, 0.5, 0.77, 1]) expect(sourceFracAt(c, timeFracAt(c, x))).toBeCloseTo(x, 4)
    const segs = curveSegments(c, 48)
    const total = segs.reduce((s, g) => s + (g.x1 - g.x0) / g.speed, 0)
    expect(total).toBeCloseTo(curveFactor(c), 6)
  })

  it('đọc từ file dự án: sắp xếp, kẹp tốc độ, 2 đầu x = 0 / 1; hỏng → null', () => {
    const c = parseSpeedCurve({
      preset: 'hero',
      points: [
        { x: 0.7, y: 50 },
        { x: 0.2, y: 0.01 }
      ],
      range: [0.1, 0.9]
    })!
    expect(c.points).toEqual([
      { x: 0, y: 0.1 },
      { x: 1, y: 10 }
    ])
    expect(c.range).toEqual([0.1, 0.9])
    expect(parseSpeedCurve({ points: 'x' })).toBeNull()
    expect(parseSpeedCurve({ preset: 'lạ', points: [] })?.preset).toBe('custom')
  })
})

function setup(): { project: ReturnType<typeof createEmptyProject>; clip: MediaClip; asset: MediaAsset } {
  const project = createEmptyProject('t')
  const asset: MediaAsset = {
    id: 'v',
    kind: 'video',
    path: 'C:\\v.mp4',
    name: 'v',
    durationUs: 30 * S,
    width: 1920,
    height: 1080,
    fps: 30,
    hasAudio: true
  }
  ops.addAssets(project, [asset])
  const clip: MediaClip = { ...createMediaClip(asset, 1 * S), sourceIn: 2 * S, duration: 10 * S }
  ops.addClip(project, project.tracks[0].id, clip)
  return { project, clip, asset }
}

describe('uốn cong – clip trên timeline', () => {
  it('đặt đường cong: giữ nguyên đoạn gốc, độ dài đổi theo; bỏ đường cong → về tốc độ đều', () => {
    const { project, clip } = setup()
    applySpeedCurve(project, clip.id, presetCurve('bullet'), 33_333)
    const c = findClip(project, clip.id)!.clip as MediaClip
    expect(sourceSpanOf(c)).toBeCloseTo(10 * S, -3)
    expect(c.duration).toBeCloseTo(10 * S * curveFactor(presetCurve('bullet')), -3)
    expect(c.duration).toBeLessThan(7 * S) // Viên đạn: phần lớn 5× (có đoạn chậm 0.3× ở giữa) → ngắn đi nhiều
    // Đầu & cuối clip vẫn đúng điểm cắt trong file gốc
    expect(sourceTimeAt(c, c.start)).toBe(2 * S)
    expect(Math.abs(sourceTimeAt(c, c.start + c.duration) - 12 * S)).toBeLessThan(2000)
    expect(Math.abs(timelineOffsetAt(c, sourceTimeAt(c, c.start + 1.234 * S) - c.sourceIn) - 1.234 * S)).toBeLessThan(2000)
    applySpeedCurve(project, clip.id, null, 33_333)
    expect(findClip(project, clip.id)!.clip).toMatchObject({ speedCurve: null, duration: 10 * S })
  })

  it('tốc độ phát của preview = độ dốc thật của vị trí trong file gốc theo thời gian (đoạn nhanh / chậm đúng chỗ)', () => {
    const { project, clip } = setup()
    applySpeedCurve(project, clip.id, presetCurve('bullet'), 33_333)
    const c = findClip(project, clip.id)!.clip as MediaClip
    for (const f of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
      const t = c.start + c.duration * f
      const h = 2000
      const slope = (sourceTimeAt(c, t + h) - sourceTimeAt(c, t - h)) / (2 * h)
      expect(Math.abs(rateAt(c, t) - slope) / slope).toBeLessThan(0.05)
    }
  })

  it('chọn tốc độ Tiêu chuẩn → bỏ uốn cong, tính theo đoạn gốc thật', () => {
    const { project, clip } = setup()
    applySpeedCurve(project, clip.id, presetCurve('hero'), 33_333)
    applySpeed(project, clip.id, 2, 33_333)
    expect(findClip(project, clip.id)!.clip).toMatchObject({ speedCurve: null, speed: 2 })
    expect((findClip(project, clip.id)!.clip as MediaClip).duration).toBeCloseTo(5 * S, -3)
  })

  it('tách clip uốn cong: 2 nửa nối liền nội dung, mỗi nửa giữ đúng phần đường cong', () => {
    const { project, clip } = setup()
    applySpeedCurve(project, clip.id, presetCurve('montage'), 33_333)
    const whole = structuredClone(findClip(project, clip.id)!.clip as MediaClip)
    const at = whole.start + whole.duration * 0.6
    const rightId = splitClip(project, clip.id, at, 33_333)!
    const left = findClip(project, clip.id)!.clip as MediaClip
    const right = findClip(project, rightId)!.clip as MediaClip
    // Nội dung tại mọi thời điểm không đổi sau khi tách
    for (const t of [whole.start + 0.3 * S, at - 1, at + 1, whole.start + whole.duration - 0.2 * S]) {
      const part = t < at ? left : right
      expect(Math.abs(sourceTimeAt(part, t) - sourceTimeAt(whole, t))).toBeLessThan(3000)
    }
    expect(sourceSpanOf(left) + sourceSpanOf(right)).toBeCloseTo(sourceSpanOf(whole), -4)
    // Tốc độ ở 2 bên chỗ tách liền mạch
    expect(curveSpeedAt(left.speedCurve!, 1)).toBeCloseTo(curveSpeedAt(right.speedCurve!, 0), 6)
    // Chỉnh lại đường cong của nửa sau: "nướng" đúng phần của nó
    expect(bakeCurve(right.speedCurve!).points[0].y).toBeCloseTo(curveSpeedAt(right.speedCurve!, 0), 6)
  })

  it('tỉa mép clip uốn cong: mép kia giữ nguyên nội dung; không kéo dài quá đường cong gốc', () => {
    const { project, clip } = setup()
    applySpeedCurve(project, clip.id, presetCurve('hero'), 33_333)
    const before = structuredClone(findClip(project, clip.id)!.clip as MediaClip)
    const end = before.start + before.duration
    applyTrim(project, clip.id, 'start', before.start + 1 * S, 33_333)
    let c = findClip(project, clip.id)!.clip as MediaClip
    expect(Math.abs(sourceTimeAt(c, end) - sourceTimeAt(before, end))).toBeLessThan(3000)
    expect(Math.abs(sourceTimeAt(c, c.start) - sourceTimeAt(before, before.start + 1 * S))).toBeLessThan(3000)
    // Kéo dài lại mép đầu xa quá → dừng ở đầu đường cong gốc (khớp lại clip ban đầu)
    applyTrim(project, clip.id, 'start', 0, 33_333)
    c = findClip(project, clip.id)!.clip as MediaClip
    expect(c.start).toBeCloseTo(before.start, -3)
    expect(c.sourceIn).toBeCloseTo(before.sourceIn, -3)
    // Mép cuối: ngắn lại 0.5s, mép đầu không đổi
    applyTrim(project, clip.id, 'end', c.start + c.duration - 0.5 * S, 33_333)
    const d = findClip(project, clip.id)!.clip as MediaClip
    expect(Math.abs(sourceTimeAt(d, d.start + 0.7 * S) - sourceTimeAt(before, before.start + 0.7 * S))).toBeLessThan(3000)
  })
})

// ───────── Xuất thật ─────────
const ffmpegDir = join(__dirname, '..', 'resources', 'ffmpeg')
const ffmpeg = join(ffmpegDir, 'ffmpeg.exe')

/** Độ sáng (0–255) tại giữa khung hình ở giây t. */
function grayAt(file: string, t: number): number {
  const buf = execFileSync(ffmpeg, [
    '-v',
    'error',
    '-ss',
    t.toFixed(3),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    'crop=8:8:(iw-8)/2:(ih-8)/2,scale=1:1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'gray',
    '-'
  ])
  return buf[0]
}

describe.skipIf(!existsSync(ffmpeg))('uốn cong – xuất thật', () => {
  it('khung hình xuất ra ở mọi thời điểm đúng nội dung mà preview tính; độ dài hình & tiếng đúng', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-curve-'))
    try {
      // File gốc 8s: độ sáng tăng đều theo số khung (khung N sáng 0.8·N) → đọc độ sáng là biết đang ở giây nào
      const src = join(dir, 'nguồn.mp4')
      execFileSync(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x180:r=30:d=8',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=330:d=8',
        '-vf',
        "format=gray,geq=lum='16+N*0.7'",
        '-c:v',
        'libx264',
        '-qp',
        '0',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        src
      ])
      const project = createEmptyProject('t')
      project.settings.resolution = '720p'
      const asset: MediaAsset = {
        id: 'v',
        kind: 'video',
        path: src,
        name: 'v',
        durationUs: 8 * S,
        width: 320,
        height: 180,
        fps: 30,
        hasAudio: true
      }
      ops.addAssets(project, [asset])
      const clip: MediaClip = { ...createMediaClip(asset, 0), sourceIn: 1 * S, duration: 6 * S }
      ops.addClip(project, project.tracks[0].id, clip)
      applySpeedCurve(project, clip.id, presetCurve('montage'), 33_333)
      const c = findClip(project, clip.id)!.clip as MediaClip

      const out = join(dir, 'kết quả.mp4')
      const result = await new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => {} }).run({
        project,
        settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'high', encoder: 'libx264' },
        textFrames: []
      })
      expect(result.status).toBe('done')
      const probe = (stream: string): number =>
        Number(
          execFileSync(
            join(ffmpegDir, 'ffprobe.exe'),
            ['-v', 'error', '-select_streams', stream, '-show_entries', 'stream=duration', '-of', 'csv=p=0', out],
            { encoding: 'utf8' }
          )
        )
      expect(Math.abs(probe('v:0') - c.duration / S)).toBeLessThan(0.1)
      expect(Math.abs(probe('a:0') - c.duration / S)).toBeLessThan(0.15)

      // So độ sáng: khung xuất ra ở t ↔ khung gốc ở sourceTimeAt(t) (cùng hàm preview dùng)
      for (const f of [0.1, 0.3, 0.45, 0.6, 0.75, 0.9]) {
        const t = c.duration * f
        const expected = grayAt(src, sourceTimeAt(c, t) / S)
        expect(Math.abs(grayAt(out, t / S) - expected)).toBeLessThanOrEqual(6) // ≤ ~4 khung lệch
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
