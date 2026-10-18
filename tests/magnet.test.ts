import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset, Project } from '@shared/project/schema'
import { createMediaClip, findClip } from '@shared/timeline/clips'
import { applyMoves, newTrackIndex, planMove } from '@shared/timeline/edit'
import { magnetInsert, magnetInsertStart, mainTrack, packMainTrack, planMagnetMove } from '@shared/timeline/magnet'

const S = 1_000_000

const asset = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id,
  kind,
  path: id,
  name: id,
  durationUs: 60 * S,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true
})

/** Track chính: A [0–4s], B [6–10s] (cách 2s), C [10–13s]; track lớp phủ phía trên: O [2–5s]. */
function setup(): { p: Project; main: string; overlay: string } {
  const p = createEmptyProject('t')
  p.assets.v = asset('v')
  const main = p.tracks[0].id
  ops.addClip(p, main, { ...createMediaClip(p.assets.v, 0), id: 'A', duration: 4 * S })
  ops.addClip(p, main, { ...createMediaClip(p.assets.v, 6 * S), id: 'B', duration: 4 * S })
  ops.addClip(p, main, { ...createMediaClip(p.assets.v, 10 * S), id: 'C', duration: 3 * S })
  const overlay = ops.addTrack(p, 'video')
  ops.addClip(p, overlay, { ...createMediaClip(p.assets.v, 2 * S), id: 'O', duration: 3 * S })
  return { p, main, overlay }
}
const starts = (p: Project): Record<string, number> => Object.fromEntries(mainTrack(p)!.clips.map((c) => [c.id, c.start / S]))

describe('Tự động gắn (track chính)', () => {
  it('track chính là track video dưới cùng', () => {
    const { p, main } = setup()
    expect(mainTrack(p)!.id).toBe(main)
  })

  it('dồn sát: bỏ khoảng trống, track lớp phủ giữ nguyên', () => {
    const { p } = setup()
    const next = produce(p, (d) => void packMainTrack(d))
    expect(starts(next)).toEqual({ A: 0, B: 4, C: 8 })
    expect(findClip(next, 'O')!.clip.start).toBe(2 * S)
    // Đã sát nhau thì không đổi gì
    expect(produce(next, (d) => void packMainTrack(d))).toBe(next)
  })

  it('kéo clip quá nửa clip bên cạnh → đổi chỗ, các clip khác dạt ra', () => {
    const p = produce(setup().p, (d) => void packMainTrack(d)) // A 0–4, B 4–8, C 8–12
    // Kéo A sang phải 1s: tâm 3s < giữa B (6s) → giữ nguyên chỗ
    expect(planMagnetMove(p, ['A'], 1 * S).moves.find((m) => m.clipId === 'A')!.start).toBe(0)
    // Kéo A sang phải 5s: tâm 7s > giữa B (6s) nhưng < giữa C (9.5s) → B, A, C
    const plan = planMagnetMove(p, ['A'], 5 * S)
    expect(plan.valid).toBe(true)
    const next = produce(p, (d) => applyMoves(d, plan.moves))
    expect(starts(next)).toEqual({ B: 0, A: 4, C: 8 })
    expect(mainTrack(next)!.clips.map((c) => c.id)).toEqual(['B', 'A', 'C'])
  })

  it('kéo clip từ lớp phủ xuống track chính → chèn vào mối nối gần nhất', () => {
    const { p: raw, main } = setup()
    const p = produce(raw, (d) => void packMainTrack(d)) // A 0–4, B 4–8, C 8–12
    // O (3s) kéo tới 3.5s → tâm 5s: sau A (giữa 2s), trước B (giữa 6s)
    const plan = planMagnetMove(p, ['O'], 1.5 * S, main)
    const next = produce(p, (d) => applyMoves(d, plan.moves))
    expect(starts(next)).toEqual({ A: 0, O: 4, B: 7, C: 11 })
  })

  it('kéo clip ra khỏi track chính sang chỗ bận → không cho thả', () => {
    const { p, overlay } = setup()
    expect(planMagnetMove(p, ['A'], 0, overlay).valid).toBe(false)
  })

  it('thả media vào track chính: chèn vào mối nối, clip sau dạt ra', () => {
    const p = produce(setup().p, (d) => void packMainTrack(d))
    const track = mainTrack(p)!
    // clip 2s thả ở 4.5s → tâm 5.5s < giữa B (6s) → chèn ở 4s
    expect(magnetInsertStart(track, 4.5 * S, 2 * S)).toBe(4 * S)
    const next = produce(p, (d) => magnetInsert(mainTrack(d)!, { ...createMediaClip(p.assets.v, 4.5 * S), id: 'N', duration: 2 * S }))
    expect(starts(next)).toEqual({ A: 0, N: 4, B: 6, C: 10 })
    expect(mainTrack(next)!.clips.map((c) => c.id)).toEqual(['A', 'N', 'B', 'C'])
  })
})

describe('kéo clip ra ngoài các track → track mới', () => {
  it('chỉ có 1 track: kéo lên → track lớp phủ mới ở trên, track chính giữ lại', () => {
    const p = createEmptyProject('t')
    p.assets.v = asset('v')
    const main = p.tracks[0].id
    ops.addClip(p, main, { ...createMediaClip(p.assets.v, 0), id: 'A', duration: 4 * S })
    ops.addClip(p, main, { ...createMediaClip(p.assets.v, 4 * S), id: 'B', duration: 4 * S })
    const plan = planMove(p, ['B'], 0, 'new-top')
    expect(plan.valid).toBe(true)
    expect(plan.newTrack).toEqual({ kind: 'video', index: 0 })
    const next = produce(p, (d) => applyMoves(d, plan.moves, plan.newTrack))
    expect(next.tracks.map((t) => t.clips.map((c) => c.id))).toEqual([['B'], ['A']])
    expect(findClip(next, 'B')!.clip.start).toBe(4 * S)
  })

  it('kéo xuống: video → track chính mới dưới cùng (Hút vào đoạn chính: về giây 0)', () => {
    const { p } = setup()
    const plan = planMagnetMove(p, ['O'], 0, 'new-bottom')
    expect(plan.newTrack).toEqual({ kind: 'video', index: 2 })
    const next = produce(p, (d) => applyMoves(d, plan.moves, plan.newTrack))
    expect(next.tracks.at(-1)!.clips.map((c) => [c.id, c.start])).toEqual([['O', 0]])
  })

  it('âm thanh / chữ: track mới nằm đúng nhóm', () => {
    const { p } = setup()
    ops.addTrack(p, 'audio')
    expect(newTrackIndex(p, 'audio', 'new-top')).toBe(2)
    expect(newTrackIndex(p, 'audio', 'new-bottom')).toBe(3)
    expect(newTrackIndex(p, 'text', 'new-bottom')).toBe(1) // ngay trên track video chính
  })
})
