// Điều chỉnh màu: hàm màu (từng thanh đúng chiều), đọc file dự án, và xuất thật khớp hàm màu (bảng .cube).
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset } from '@shared/project/schema'
import {
  buildLut,
  emptyGrade,
  gradeColor,
  hasColorChanges,
  hasSpatialChanges,
  isGradeEmpty,
  lutToCube,
  parseGrade,
  prepareGrade,
  type ColorGrade
} from '@shared/render/grade'
import { createMediaClip } from '@shared/timeline/clips'
import { gradeStatements } from '../src/main/export/graphBuilder'
import { Exporter } from '../src/main/export/exporter'

const S = 1_000_000
const g = (edit: (x: ColorGrade) => void): ColorGrade => {
  const x = emptyGrade()
  edit(x)
  return x
}
const apply = (grade: ColorGrade, rgb: [number, number, number]) => gradeColor(prepareGrade(grade), ...rgb)
const luma = ([r, gg, b]: number[]): number => 0.2126 * r + 0.7152 * gg + 0.0722 * b

describe('điều chỉnh màu – hàm màu', () => {
  it('không chỉnh gì → giữ nguyên màu; LUT là bảng đồng nhất', () => {
    expect(isGradeEmpty(emptyGrade())).toBe(true)
    for (const c of [
      [0.2, 0.5, 0.8],
      [1, 0, 0.3]
    ] as [number, number, number][])
      apply(emptyGrade(), c).forEach((v, i) => expect(v).toBeCloseTo(c[i], 4))
    const lut = buildLut(emptyGrade(), 5)
    // Thứ tự .cube: r chạy nhanh nhất → phần tử thứ 2 là (r = 0.25, g = 0, b = 0)
    expect([...lut.slice(3, 6)].map((v) => +v.toFixed(3))).toEqual([0.25, 0, 0])
    expect([...lut.slice(5 * 3, 5 * 3 + 3)].map((v) => +v.toFixed(3))).toEqual([0, 0.25, 0])
  })

  it('từng thanh chỉnh đúng chiều', () => {
    const mid: [number, number, number] = [0.5, 0.45, 0.4]
    expect(
      luma(
        apply(
          g((x) => (x.basic.exposure = 60)),
          mid
        )
      )
    ).toBeGreaterThan(luma(mid) + 0.1)
    const warm = apply(
      g((x) => (x.basic.temperature = 80)),
      mid
    )
    expect(warm[0]).toBeGreaterThan(mid[0])
    expect(warm[2]).toBeLessThan(mid[2])
    const gray = apply(
      g((x) => (x.basic.saturation = -100)),
      [0.8, 0.2, 0.2]
    )
    expect(Math.max(...gray) - Math.min(...gray)).toBeLessThan(0.01)
    // Bóng +: vùng tối sáng lên nhiều, vùng sáng gần như không đổi
    const lifted = g((x) => (x.basic.shadows = 100))
    expect(luma(apply(lifted, [0.1, 0.1, 0.1])) - 0.1).toBeGreaterThan(0.1)
    expect(Math.abs(luma(apply(lifted, [0.95, 0.95, 0.95])) - 0.95)).toBeLessThan(0.01)
    // Đường cong độ sáng kéo điểm giữa lên → sáng hơn
    const curve = g(
      (x) =>
        (x.curves.luma = [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.7 },
          { x: 1, y: 1 }
        ])
    )
    expect(apply(curve, [0.5, 0.5, 0.5])[0]).toBeCloseTo(0.7, 2)
  })

  it('HSL: chỉ nhóm màu được chọn thay đổi; xám không đổi', () => {
    const redHue = g((x) => (x.hsl.red.hue = 100))
    const red = apply(redHue, [0.9, 0.15, 0.15])
    expect(red[1]).toBeGreaterThan(0.25) // đỏ ngả sang cam/vàng (thêm xanh lá)
    const blue: [number, number, number] = [0.15, 0.2, 0.9]
    apply(redHue, blue).forEach((v, i) => expect(v).toBeCloseTo(blue[i], 3))
    apply(redHue, [0.5, 0.5, 0.5]).forEach((v) => expect(v).toBeCloseTo(0.5, 3))
  })

  it('vòng tròn màu: nhuộm đỏ vùng tối không đổi vùng trắng', () => {
    const wheel = g((x) => (x.wheels.shadows = { r: 0.6, g: -0.3, b: -0.3, y: 0 }))
    const dark = apply(wheel, [0.1, 0.1, 0.1])
    expect(dark[0] - dark[2]).toBeGreaterThan(0.05)
    const white = apply(wheel, [1, 1, 1])
    expect(Math.max(...white) - Math.min(...white)).toBeLessThan(0.02)
  })

  it('bảo vệ màu da: tăng bão hòa ít ảnh hưởng tới màu da hơn', () => {
    const skin: [number, number, number] = [0.85, 0.62, 0.5]
    const spread = (c: number[]): number => Math.max(...c) - Math.min(...c)
    const plain = apply(
      g((x) => (x.basic.saturation = 80)),
      skin
    )
    const protectedSkin = apply(
      g((x) => {
        x.basic.saturation = 80
        x.skinProtect = true
      }),
      skin
    )
    expect(spread(protectedSkin)).toBeLessThan(spread(plain))
    expect(spread(protectedSkin)).toBeGreaterThan(spread(skin) - 0.01)
  })

  it('đọc file dự án: kẹp khoảng, thanh 1 chiều không âm, thiếu → null', () => {
    const p = parseGrade({ basic: { exposure: 500, blur: -20, sharpen: 30 }, wheels: { shadows: { r: 5 } } })!
    expect(p.basic.exposure).toBe(100)
    expect(p.basic.blur).toBe(0)
    expect(p.wheels.shadows.r).toBe(1)
    expect(p.wheels.intensity).toBe(100)
    expect(hasColorChanges(p)).toBe(true)
    expect(hasSpatialChanges(p)).toBe(true)
    expect(parseGrade(null)).toBeNull()
    expect(parseGrade({})).toBeNull()
  })

  it('lệnh FFmpeg: đúng thứ tự mờ → sắc nét → rõ nét → bảng màu → hạt → viền', () => {
    const grade = g((x) => {
      x.basic.blur = 50
      x.basic.sharpen = 50
      x.basic.clarity = 50
      x.basic.exposure = 20
      x.basic.grain = 30
      x.basic.vignette = 40
    })
    const { statements } = gradeStatements('0:v', ['setpts=PTS-STARTPTS'], grade, 'lut-0.cube', 1080, 'g1')
    const all = statements.join(';')
    const order = [
      'gblur=sigma=6.480',
      "blend=all_expr='clip(A+(A-B)*0.8000",
      "blend=all_expr='clip(A+(A-B)*0.3500",
      'lut3d=file=lut-0.cube',
      'noise=alls=',
      'vignette=angle='
    ]
    order.reduce((at, part) => {
      const i = all.indexOf(part, at)
      expect(i, part).toBeGreaterThan(at)
      return i
    }, -1)
  })
})

const ffmpegDir = join(__dirname, '..', 'resources', 'ffmpeg')
const ffmpeg = join(ffmpegDir, 'ffmpeg.exe')

function rgbAt(file: string, t: number, x: number, y: number): number[] {
  const buf = execFileSync(ffmpeg, [
    '-v',
    'error',
    '-ss',
    String(t),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    `crop=4:4:${x}:${y},scale=1:1`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-'
  ])
  return [buf[0], buf[1], buf[2]]
}

describe.skipIf(!existsSync(ffmpeg))('điều chỉnh màu – xuất thật', () => {
  it('màu xuất ra = hàm màu chung (bảng .cube đúng thứ tự trục)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-grade-'))
    try {
      // Ảnh 4 ô màu phẳng: đỏ, xanh lá, xanh dương, xám
      const src = join(dir, 'ô màu.png')
      execFileSync(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0xd02020:s=320x180',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x20b040:s=320x180',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x2040d0:s=320x180',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x808080:s=320x180',
        '-filter_complex',
        '[0][1]hstack[top];[2][3]hstack[bot];[top][bot]vstack',
        '-frames:v',
        '1',
        '-update',
        '1',
        src
      ])
      const project = createEmptyProject('t')
      project.settings.resolution = '720p'
      const asset: MediaAsset = {
        id: 'a',
        kind: 'image',
        path: src,
        name: 'a',
        durationUs: 0,
        width: 640,
        height: 360,
        fps: null,
        hasAudio: false
      }
      ops.addAssets(project, [asset])
      const grade = g((x) => {
        x.basic.temperature = 60
        x.basic.exposure = 25
        x.hsl.green.hue = 80
        x.wheels.shadows = { r: 0, g: 0, b: 0.5, y: 0 }
        x.curves.r = [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.6 },
          { x: 1, y: 1 }
        ]
      })
      ops.addClip(project, project.tracks[0].id, { ...createMediaClip(asset, 0), duration: 1 * S, grade })
      const out = join(dir, 'kết quả.mp4')
      const result = await new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => {} }).run({
        project,
        settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'high', encoder: 'libx264' },
        textFrames: []
      })
      expect(result.status).toBe('done')
      // Ô màu ở 720p: mỗi ô 640×360
      const cells: [string, number, number][] = [
        ['đỏ', 320, 180],
        ['xanh lá', 960, 180],
        ['xanh dương', 320, 540],
        ['xám', 960, 540]
      ]
      for (const [name, x, y] of cells) {
        const orig = rgbAt(src, 0, x / 2, y / 2).map((v) => v / 255) as [number, number, number]
        const expected = apply(grade, orig).map((v) => Math.round(v * 255))
        const got = rgbAt(out, 0.5, x, y)
        got.forEach((v, i) => expect(Math.abs(v - expected[i]), `${name}[${i}] ${got} vs ${expected}`).toBeLessThanOrEqual(10))
      }
      expect(lutToCube(buildLut(grade)).startsWith('TITLE')).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
