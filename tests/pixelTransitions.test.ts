// Chuyển cảnh làm méo điểm ảnh: biểu thức FFmpeg sinh ra phải chạy được, và cho kết quả đúng ở đầu / cuối.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { geqExprs, glslBody, PIXEL_TRANSITIONS, pixelRecipe } from '@shared/render/pixelTransitions'
import { TRANSITION_KINDS, type MediaAsset, type TransitionKind } from '@shared/project/schema'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import { createMediaClip } from '@shared/timeline/clips'
import { Exporter } from '../src/main/export/exporter'

const ffmpeg = join(__dirname, '..', 'resources', 'ffmpeg', 'ffmpeg.exe')

/** Chạy geq trên ảnh thử 64×36 trong 1 giây, lấy khung tại `at` giây → mảng RGBA. */
function run(kind: string, role: 'in' | 'out', at: number): Buffer {
  const e = geqExprs(pixelRecipe(kind, role)!, 0, 1)
  const q = (s: string): string => `'${s}'`
  const vf = `format=gbrap,geq=r=${q(e.r)}:g=${q(e.g)}:b=${q(e.b)}:a=${q(e.a)},format=rgba`
  return execFileSync(ffmpeg, [
    '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=64x36:r=10:d=1', '-vf', `${vf},trim=start=${at},setpts=PTS-STARTPTS`,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'
  ])
}
const alphaAvg = (buf: Buffer): number => {
  let s = 0
  for (let i = 3; i < buf.length; i += 4) s += buf[i]
  return s / (buf.length / 4)
}

describe('chuyển cảnh làm méo điểm ảnh', () => {
  it('mọi chuyển cảnh mới đều có trong danh sách chuyển cảnh, sinh được GLSL', () => {
    for (const k of PIXEL_TRANSITIONS) {
      expect(TRANSITION_KINDS as readonly string[]).toContain(k)
      for (const role of ['in', 'out'] as const) expect(glslBody(pixelRecipe(k, role)!)).toContain('o = vec4')
    }
  })

  it.skipIf(!existsSync(ffmpeg))('biểu thức FFmpeg chạy được; clip vào: đầu ẩn, cuối hiện đủ', () => {
    for (const k of PIXEL_TRANSITIONS) {
      // Clip ra ở đầu chuyển cảnh: còn nguyên (đủ độ mờ)
      expect(alphaAvg(run(k, 'out', 0)), `${k} out@0`).toBeGreaterThan(250)
      // Clip vào ở cuối: hiện đủ
      expect(alphaAvg(run(k, 'in', 0.9)), `${k} in@0.9`).toBeGreaterThan(240)
      // Clip vào ở đầu: (gần như) chưa hiện
      expect(alphaAvg(run(k, 'in', 0)), `${k} in@0`).toBeLessThan(20)
    }
  }, 120_000)

  it.skipIf(!existsSync(ffmpeg))('xuất thật: đỏ → (chuyển cảnh) → xanh, ở giữa đang chuyển', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-pxtr-'))
    try {
      const q = ['-v', 'error', '-y']
      const red = join(dir, 'đỏ.png')
      const blue = join(dir, 'xanh.png')
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=red:s=320x180', '-frames:v', '1', '-update', '1', red])
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=blue:s=320x180', '-frames:v', '1', '-update', '1', blue])
      const S = 1_000_000
      for (const kind of PIXEL_TRANSITIONS) {
        const project = createEmptyProject('t')
        const asset = (id: string, path: string): MediaAsset => ({ id, kind: 'image', path, name: id, durationUs: 0, width: 320, height: 180, fps: null, hasAudio: false })
        ops.addAssets(project, [asset('r', red), asset('b', blue)])
        const main = project.tracks[0].id
        ops.addClip(project, main, { ...createMediaClip(project.assets.r, 0), duration: 2 * S })
        ops.addClip(project, main, { ...createMediaClip(project.assets.b, 2 * S), duration: 2 * S, transitionIn: { kind: kind as TransitionKind, duration: S } })
        const out = join(dir, `${kind}.mp4`)
        const result = await new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => {} }).run({
          project,
          settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'high', encoder: 'libx264' },
          textFrames: []
        })
        expect(result.status, kind).toBe('done')
        const avg = (t: number): number[] => {
          const buf = execFileSync(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
          return [buf[0], buf[1], buf[2]]
        }
        const before = avg(0.8)
        const after = avg(3.3)
        const mid = avg(2.3) // 80% chuyển cảnh (ảnh một màu: sóng sọc không thấy, nhưng vệt quét đang chạy)
        expect(before[0] > 200 && before[2] < 60, `${kind} trước: ${before}`).toBe(true)
        expect(after[2] > 200 && after[0] < 60, `${kind} sau: ${after}`).toBe(true)
        // Giữa chuyển cảnh: không còn là đỏ thuần
        expect(mid[0] < 235 || mid[2] > 20 || mid[1] > 20, `${kind} giữa: ${mid}`).toBe(true)
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 240_000)
})
