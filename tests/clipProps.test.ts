import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset, MediaClip, Project } from '@shared/project/schema'
import { createMediaClip, findClip } from '@shared/timeline/clips'
import { applyFades, applySpeed, applyVolume, clipGainAt, planSpeed } from '@shared/timeline/clipProps'
import { applyTrim } from '@shared/timeline/edit'

const S = 1_000_000
const FRAME = Math.round(S / 30)
const asset: MediaAsset = { id: 'v', kind: 'video', path: 'v', name: 'v', durationUs: 60 * S, width: 1920, height: 1080, fps: 30, hasAudio: true }

/** A [0–10s], B [15–20s] trên cùng track. */
function setup(): Project {
  const p = createEmptyProject('t')
  p.assets.v = asset
  ops.addClip(p, p.tracks[0].id, { ...createMediaClip(asset, 0), id: 'A', duration: 10 * S })
  ops.addClip(p, p.tracks[0].id, { ...createMediaClip(asset, 15 * S), id: 'B', duration: 5 * S })
  return p
}
const clip = (p: Project, id: string) => findClip(p, id)!.clip as MediaClip

describe('tốc độ', () => {
  it('nhanh lên thì ngắn lại, giữ nguyên đoạn trong file gốc', () => {
    const p = produce(setup(), (d) => applySpeed(d, 'A', 2, FRAME))
    expect(clip(p, 'A')).toMatchObject({ speed: 2, duration: 5 * S })
    // Đổi lại 1× → về đúng 10s như cũ
    expect(clip(produce(p, (d) => applySpeed(d, 'A', 1, FRAME)), 'A').duration).toBe(10 * S)
  })

  it('chậm lại mà chạm clip phía sau → cắt bớt cho vừa', () => {
    const p = setup()
    expect(planSpeed(p, 'A', 0.5, FRAME)).toEqual({ speed: 0.5, duration: 15 * S, truncated: true })
    expect(planSpeed(p, 'B', 0.5, FRAME)).toEqual({ speed: 0.5, duration: 10 * S, truncated: false }) // B là clip cuối
  })

  it('kẹp trong khoảng 0.25× – 4×', () => {
    expect(planSpeed(setup(), 'B', 10, FRAME)!.speed).toBe(4)
    expect(planSpeed(setup(), 'B', 0.01, FRAME)!.speed).toBe(0.25)
  })
})

describe('âm lượng & fade', () => {
  it('âm lượng kẹp 0 – 200%', () => {
    expect(clip(produce(setup(), (d) => applyVolume(d, 'A', 3)), 'A').volume).toBe(2)
    expect(clip(produce(setup(), (d) => applyVolume(d, 'A', -1)), 'A').volume).toBe(0)
  })

  it('fade in + fade out không vượt độ dài clip; cắt clip ngắn lại thì fade co theo', () => {
    let p = produce(setup(), (d) => applyFades(d, 'B', 4 * S, 4 * S))
    expect(clip(p, 'B')).toMatchObject({ fadeIn: 4 * S, fadeOut: 1 * S })
    p = produce(p, (d) => applyTrim(d, 'B', 'end', 17 * S, FRAME)) // B còn 2s
    expect(clip(p, 'B')).toMatchObject({ duration: 2 * S, fadeIn: 2 * S, fadeOut: 0 })
  })

  it('âm lượng theo thời gian: tuyến tính, nhân với volume', () => {
    const p = produce(setup(), (d) => {
      applyFades(d, 'A', 2 * S, 4 * S)
      applyVolume(d, 'A', 1.5)
    })
    const a = clip(p, 'A')
    expect(clipGainAt(a, 0)).toBe(0)
    expect(clipGainAt(a, 1 * S)).toBeCloseTo(0.75) // nửa fade in × 1.5
    expect(clipGainAt(a, 5 * S)).toBeCloseTo(1.5)
    expect(clipGainAt(a, 8 * S)).toBeCloseTo(0.75) // còn 2s trong fade out 4s
  })
})
