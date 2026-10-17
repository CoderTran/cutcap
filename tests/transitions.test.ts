import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { produce } from 'immer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset, Project, TransitionKind } from '@shared/project/schema'
import { createMediaClip } from '@shared/timeline/clips'
import { clipGainAt } from '@shared/timeline/clipProps'
import { timedClipsBetween, visualLayersAt } from '@shared/timeline/evaluate'
import { applyTransition, canHaveTransition, clampedSourceTime, transitionAt, transitionEffect } from '@shared/timeline/transitions'
import { Exporter } from '../src/main/export/exporter'

const S = 1_000_000
const asset = (id: string, path = id): MediaAsset => ({
  id, kind: 'video', path, name: id, durationUs: 4 * S, width: 1280, height: 720, fps: 30, hasAudio: true
})

/** A [0–2s] rồi B [2–4s] liền nhau trên track chính, chuyển cảnh 1s vào B. */
function setup(kind: TransitionKind, paths = { a: 'a', b: 'b' }): Project {
  const p = createEmptyProject('t')
  p.settings.resolution = '720p'
  p.assets.a = asset('a', paths.a)
  p.assets.b = asset('b', paths.b)
  const main = p.tracks[0].id
  ops.addClip(p, main, { ...createMediaClip(p.assets.a, 0), id: 'A', duration: 2 * S })
  ops.addClip(p, main, { ...createMediaClip(p.assets.b, 2 * S), id: 'B', duration: 2 * S })
  return produce(p, (d) => applyTransition(d, 'B', kind, 1 * S))
}

describe('chuyển cảnh (logic)', () => {
  it('chỉ có giữa 2 clip hình liền nhau; tự hết hiệu lực khi tách xa', () => {
    const p = setup('fade')
    const track = p.tracks[0]
    expect(canHaveTransition(p, track, 0)).toBe(false) // clip đầu tiên
    expect(transitionAt(p, track, 1)).toMatchObject({ cut: 2 * S, from: 1.5 * S, to: 2.5 * S })
    const apart = produce(p, (d) => void (d.tracks[0].clips[1].start = 3 * S))
    expect(transitionAt(apart, apart.tracks[0], 1)).toBeNull()
  })

  it('độ dài bị giới hạn bởi clip ngắn hơn', () => {
    const p = produce(setup('fade'), (d) => {
      d.tracks[0].clips[0].duration = 0.6 * S
      d.tracks[0].clips[1].start = 0.6 * S
    })
    expect(transitionAt(p, p.tracks[0], 1)!.duration).toBe(0.6 * S)
  })

  it('trong lúc chuyển cảnh có 2 lớp: clip trước ở dưới, clip sau ở trên', () => {
    const p = setup('fade')
    expect(visualLayersAt(p, 1.4 * S).map((l) => l.clip.id)).toEqual(['A'])
    const mid = visualLayersAt(p, 2 * S)
    expect(mid.map((l) => l.clip.id)).toEqual(['A', 'B'])
    expect(mid[1].effect.alpha).toBeCloseTo(0.5)
    expect(visualLayersAt(p, 2.6 * S).map((l) => l.clip.id)).toEqual(['B'])
  })

  it('hiệu ứng trượt và phóng to', () => {
    expect(transitionEffect('slide-left', 'in', 0.25).offsetX).toBeCloseTo(0.75)
    expect(transitionEffect('slide-left', 'out', 0.25).offsetX).toBeCloseTo(-0.25)
    expect(transitionEffect('slide-right', 'in', 0.25).offsetX).toBeCloseTo(-0.75)
    expect(transitionEffect('zoom', 'in', 0).frameZoom).toBeCloseTo(1.2)
    expect(transitionEffect('zoom', 'in', 1).frameZoom).toBeCloseTo(1)
  })

  it('phần kéo dài: hình giữ khung đầu khi file không đủ; tiếng im lặng ngoài clip', () => {
    const p = setup('fade')
    const b = p.tracks[0].clips[1]
    if (b.type !== 'media') throw new Error()
    // B lấy từ giây 0 của file → trước mối cắt không còn hình: giữ khung đầu
    expect(clampedSourceTime(b, p.assets.b, 1.6 * S)).toEqual({ time: 0, frozen: true })
    expect(clipGainAt(b, 1.6 * S)).toBe(0)
    expect(timedClipsBetween(p, 1.6 * S, 1.6 * S).map((c) => c.clip.id).sort()).toEqual(['A', 'B'])
  })
})

// ───────── Xuất thật: đỏ → xanh dương, mối cắt ở giây 2, chuyển cảnh 1s ─────────

const ffmpeg = join(__dirname, '..', 'resources', 'ffmpeg', 'ffmpeg.exe')

describe.skipIf(!existsSync(ffmpeg))('xuất video có chuyển cảnh', () => {
  let dir: string
  const paths = { a: '', b: '' }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cutcap-tr-'))
    paths.a = join(dir, 'đỏ.mp4')
    paths.b = join(dir, 'xanh.mp4')
    const q = ['-hide_banner', '-loglevel', 'error', '-y']
    for (const [file, color] of [[paths.a, 'red'], [paths.b, 'blue']]) {
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', `color=c=${color}:s=1280x720:r=30`, '-f', 'lavfi', '-i', 'sine=frequency=440',
        '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file])
    }
  }, 60_000)
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  const pixel = (file: string, t: number, x: number, y = 360): number[] => [
    ...execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1',
      '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).subarray(0, 3)
  ]
  const near = (a: number[], b: number[], tol = 35): boolean => a.every((v, i) => Math.abs(v - b[i]) <= tol)
  const RED = [255, 0, 0]
  const BLUE = [0, 0, 255]

  async function exportWith(kind: TransitionKind): Promise<string> {
    const out = join(dir, `${kind}.mp4`)
    const result = await new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => {} }).run({
      project: setup(kind, paths),
      settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'standard', encoder: 'libx264' },
      textFrames: []
    })
    if (result.status !== 'done') throw new Error(JSON.stringify(result))
    return out
  }

  it.each(['fade', 'slide-left', 'slide-right', 'zoom'] as const)('%s', async (kind) => {
    const out = await exportWith(kind)
    // Trước và sau chuyển cảnh: màu thuần
    expect(near(pixel(out, 1.3, 640), RED)).toBe(true)
    expect(near(pixel(out, 2.7, 640), BLUE)).toBe(true)
    // Giữa chuyển cảnh (p = 0.5)
    if (kind === 'fade' || kind === 'zoom') {
      expect(near(pixel(out, 2.0, 640), [128, 0, 128], 40)).toBe(true) // trộn đỏ + xanh 50%
    } else {
      const [leftExpect, rightExpect] = kind === 'slide-left' ? [RED, BLUE] : [BLUE, RED]
      expect(near(pixel(out, 2.0, 320), leftExpect)).toBe(true)
      expect(near(pixel(out, 2.0, 960), rightExpect)).toBe(true)
    }
    // Độ dài video không đổi
    const duration = Number(execFileSync(join(dirname(ffmpeg), 'ffprobe.exe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }))
    expect(Math.abs(duration - 4)).toBeLessThan(0.1)
  }, 60_000)
})
