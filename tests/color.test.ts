// Kiểm chứng bộ lọc màu: công thức chuẩn CSS (preview) = bộ lọc FFmpeg (xuất video).
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
  cssFilterFromOps,
  ffmpegFiltersFromOps,
  grayscaleMatrix,
  hueRotateMatrix,
  saturateMatrix,
  scaleOp,
  sepiaMatrix,
  type ColorOp
} from '@shared/render/colorMath'
import { FILTER_PRESETS, clipColorOps } from '@shared/render/filters'
import { createMediaClip } from '@shared/timeline/clips'
import { Exporter } from '../src/main/export/exporter'

/** Cài đặt tham chiếu các phép màu theo đúng định nghĩa CSS (0…255, kẹp sau mỗi phép). */
function applyOps(rgb: number[], list: ColorOp[]): number[] {
  const clamp = (v: number): number => Math.min(255, Math.max(0, v))
  let c = [...rgb]
  for (const op of list) {
    if (op.type === 'brightness') c = c.map((v) => clamp(v * op.value))
    else if (op.type === 'contrast') c = c.map((v) => clamp((v - 127.5) * op.value + 127.5))
    else {
      const m =
        op.type === 'saturate' ? saturateMatrix(op.value)
        : op.type === 'grayscale' ? grayscaleMatrix(op.value)
        : op.type === 'sepia' ? sepiaMatrix(op.value)
        : hueRotateMatrix(op.degrees)
      c = m.map((row) => clamp(row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))
    }
  }
  return c.map(Math.round)
}

describe('phép màu', () => {
  it('ma trận trắng đen và xoay màu giữ nguyên màu xám', () => {
    for (const m of [grayscaleMatrix(1), hueRotateMatrix(73), saturateMatrix(0.3)]) {
      for (const row of m) expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3)
    }
    expect(applyOps([255, 0, 0], [{ type: 'grayscale', value: 1 }])).toEqual([54, 54, 54])
  })

  it('cường độ 0 = không có tác dụng; CSS và FFmpeg có cùng số phép', () => {
    for (const preset of FILTER_PRESETS) {
      expect(cssFilterFromOps(preset.ops.map((op) => scaleOp(op, 0)))).toBe('none')
      expect(cssFilterFromOps(preset.ops).split(' ')).toHaveLength(ffmpegFiltersFromOps(preset.ops).length)
    }
    expect(cssFilterFromOps([{ type: 'sepia', value: 0.5 }, { type: 'hueRotate', degrees: -15 }])).toBe('sepia(0.5) hue-rotate(-15deg)')
  })

  it('bộ lọc trước, chỉnh tay sau', () => {
    const clip = { ...createMediaClip({ id: 'a', kind: 'video', path: '', name: '', durationUs: 1, width: 1, height: 1, fps: 30, hasAudio: false }, 0), filter: 'bw' }
    clip.adjust.brightness = 20
    expect(clipColorOps(clip).map((o) => o.type)).toEqual(['grayscale', 'contrast', 'brightness', 'contrast', 'saturate'])
  })
})

const ffmpeg = join(__dirname, '..', 'resources', 'ffmpeg', 'ffmpeg.exe')

describe.skipIf(!existsSync(ffmpeg))('FFmpeg cho ra đúng màu theo công thức', () => {
  it('mọi bộ lọc có sẵn (cường độ 100% và 50%)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-color-'))
    try {
      // Ảnh màu đồng nhất (xanh pha cam) – PNG để không bị sai số nén khi làm nguồn
      const BASE = [200, 120, 60]
      const src = join(dir, 'màu.png')
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x${BASE.map((v) => v.toString(16).padStart(2, '0')).join('')}:s=320x180`,
        '-frames:v', '1', '-update', '1', src])

      // Mỗi bộ lọc một clip ảnh dài 0.5s nối tiếp nhau; nửa sau dùng cường độ 50%
      const project = createEmptyProject('Màu')
      project.settings.resolution = '720p'
      const asset: MediaAsset = { id: 'img', kind: 'image', path: src, name: 'img', durationUs: 0, width: 320, height: 180, fps: null, hasAudio: false }
      project.assets.img = asset
      const cases = [...FILTER_PRESETS.map((f) => ({ id: f.id, k: 1 })), ...FILTER_PRESETS.map((f) => ({ id: f.id, k: 0.5 }))]
      cases.forEach(({ id, k }, i) => {
        ops.addClip(project, project.tracks[0].id, { ...createMediaClip(asset, i * 500_000), duration: 500_000, filter: id, filterIntensity: k })
      })

      const out = join(dir, 'out.mp4')
      const result = await new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => {} }).run({
        project,
        // Chất lượng cao để sai số nén nhỏ
        settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'high', encoder: 'libx264' },
        textFrames: []
      })
      expect(result.status).toBe('done')

      const failures: string[] = []
      cases.forEach(({ id, k }, i) => {
        const t = i * 0.5 + 0.25
        const got = [...execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', out, '-frames:v', '1',
          '-vf', 'format=rgb24,crop=1:1:640:360', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).subarray(0, 3)]
        const clip = project.tracks[0].clips[i]
        if (clip.type !== 'media') return
        const expected = applyOps(BASE, clipColorOps(clip))
        // Sai số cho phép: chuyển RGB ↔ YUV 4:2:0 của video và làm tròn
        if (!got.every((v, c) => Math.abs(v - expected[c]) <= 8)) failures.push(`${id}@${k}: got ${got} expected ${expected}`)
      })
      expect(failures).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
