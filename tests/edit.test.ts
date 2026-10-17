import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset, MediaClip, Project } from '@shared/project/schema'
import { createMediaClip, findClip } from '@shared/timeline/clips'
import {
  applyMoves,
  applyTrim,
  clipsToSplit,
  copyClips,
  deleteClips,
  pasteClips,
  planMove,
  splitClip,
  trimBounds
} from '@shared/timeline/edit'

const S = 1_000_000
const FRAME = Math.round(S / 30)

function asset(id: string, kind: MediaAsset['kind'], seconds: number): MediaAsset {
  return { id, kind, path: id, name: id, durationUs: seconds * S, width: 1920, height: 1080, fps: 30, hasAudio: true }
}

/**
 * Track chính: A [0–4s] (lấy giây 1–5 của file 10s), B [6–10s]
 * Track nhạc:  M [0–20s]
 */
function setup(): { p: Project; main: string; music: string } {
  const p = createEmptyProject('t')
  p.assets.v = asset('v', 'video', 10)
  p.assets.m = asset('m', 'audio', 60)
  p.assets.i = asset('i', 'image', 0)
  const main = p.tracks[0].id
  const music = ops.addTrack(p, 'audio')
  ops.addClip(p, main, { ...createMediaClip(p.assets.v, 0), id: 'A', duration: 4 * S, sourceIn: 1 * S })
  ops.addClip(p, main, { ...createMediaClip(p.assets.v, 6 * S), id: 'B', duration: 4 * S })
  ops.addClip(p, music, { ...createMediaClip(p.assets.m, 0), id: 'M', duration: 20 * S })
  return { p, main, music }
}
const clip = (p: Project, id: string) => findClip(p, id)!.clip as MediaClip

describe('di chuyển', () => {
  it('dời clip vào chỗ trống: hợp lệ; đè lên clip khác: không hợp lệ', () => {
    const { p } = setup()
    expect(planMove(p, ['A'], 1 * S).valid).toBe(true) // A: 1–5s, B bắt đầu 6s
    expect(planMove(p, ['A'], 3 * S).valid).toBe(false) // A: 3–7s đè B
    expect(planMove(p, ['A', 'B'], 3 * S).valid).toBe(true) // dời cả 2 cùng lúc
  })

  it('không cho kéo về trước giây 0', () => {
    const { p } = setup()
    expect(planMove(p, ['B'], -100 * S).moves[0].start).toBe(0)
  })

  it('chỉ đổi track khi cùng loại', () => {
    const { p, music } = setup()
    const v2 = produce(p, (d) => void ops.addTrack(d, 'video'))
    const newVideo = v2.tracks[0].id
    expect(planMove(v2, ['A'], 0, newVideo).moves[0].trackId).toBe(newVideo)
    expect(planMove(v2, ['A'], 0, music).moves[0].trackId).not.toBe(music)
  })

  it('applyMoves giữ thứ tự clip theo thời gian', () => {
    const { p, main } = setup()
    const next = produce(p, (d) => applyMoves(d, [{ clipId: 'A', trackId: main, start: 11 * S }]))
    expect(next.tracks.find((t) => t.id === main)!.clips.map((c) => c.id)).toEqual(['B', 'A'])
  })
})

describe('cắt mép (trim)', () => {
  it('giới hạn theo clip bên cạnh và độ dài file gốc', () => {
    const { p } = setup()
    // Đầu A: file còn 1s phía trước → không kéo được trước 0 (cũng là giới hạn timeline)
    expect(trimBounds(p, 'A', 'start', FRAME)).toEqual({ min: 0, max: 4 * S - FRAME })
    // Cuối A: file cho phép tới 0 + (10 − 1) = 9s, nhưng B bắt đầu ở 6s → tối đa 6s
    expect(trimBounds(p, 'A', 'end', FRAME)!.max).toBe(6 * S)
    // Cuối B: lấy từ giây 0 của file 10s → tối đa 6 + 10 = 16s
    expect(trimBounds(p, 'B', 'end', FRAME)!.max).toBe(16 * S)
    // Đầu B: không lùi trước cuối A (4s), và sourceIn 0 → không lùi trước 6s
    expect(trimBounds(p, 'B', 'start', FRAME)!.min).toBe(6 * S)
  })

  it('cắt đầu clip dịch cả điểm lấy trong file gốc', () => {
    const { p } = setup()
    const next = produce(p, (d) => applyTrim(d, 'A', 'start', 1 * S, FRAME))
    expect(clip(next, 'A')).toMatchObject({ start: 1 * S, duration: 3 * S, sourceIn: 2 * S })
  })

  it('kéo quá giới hạn thì bị kẹp lại', () => {
    const { p } = setup()
    const next = produce(p, (d) => applyTrim(d, 'B', 'end', 100 * S, FRAME))
    expect(clip(next, 'B').duration).toBe(10 * S)
    const tiny = produce(p, (d) => applyTrim(d, 'B', 'end', 0, FRAME))
    expect(clip(tiny, 'B').duration).toBe(FRAME)
  })

  it('ảnh tĩnh kéo dài thoải mái (không giới hạn file gốc)', () => {
    const { p, main } = setup()
    const withImage = produce(p, (d) => ops.addClip(d, main, { ...createMediaClip(d.assets.i, 20 * S), id: 'I' }))
    expect(trimBounds(withImage, 'I', 'end', FRAME)!.max).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('tách, xóa, sao chép', () => {
  it('tách clip: 2 nửa nối tiếp, nửa sau lấy đúng đoạn trong file gốc', () => {
    const { p, main } = setup()
    let rightId: string | null = null
    const next = produce(p, (d) => {
      clip(d, 'A').fadeIn = 500_000
      clip(d, 'A').fadeOut = 500_000
      rightId = splitClip(d, 'A', 1.5 * S, FRAME)
    })
    const left = clip(next, 'A')
    const right = clip(next, rightId!)
    expect(left).toMatchObject({ start: 0, duration: 1.5 * S, sourceIn: 1 * S, fadeIn: 500_000, fadeOut: 0 })
    expect(right).toMatchObject({ start: 1.5 * S, duration: 2.5 * S, sourceIn: 2.5 * S, fadeIn: 0, fadeOut: 500_000 })
    expect(next.tracks.find((t) => t.id === main)!.clips.map((c) => c.id)).toEqual(['A', rightId, 'B'])
  })

  it('không tách sát mép clip', () => {
    const { p } = setup()
    produce(p, (d) => {
      expect(splitClip(d, 'A', FRAME / 2, FRAME)).toBeNull()
    })
  })

  it('Ctrl+B: ưu tiên clip đang chọn, không chọn thì tách mọi clip dưới đầu phát', () => {
    const { p } = setup()
    expect(clipsToSplit(p, ['M'], 2 * S, FRAME)).toEqual(['M'])
    expect(clipsToSplit(p, [], 2 * S, FRAME).sort()).toEqual(['A', 'M'])
    expect(clipsToSplit(p, ['B'], 2 * S, FRAME).sort()).toEqual(['A', 'M']) // B không nằm dưới đầu phát
  })

  it('xóa bỏ qua track bị khóa', () => {
    const { p, music } = setup()
    const next = produce(p, (d) => {
      d.tracks.find((t) => t.id === music)!.locked = true
      deleteClips(d, ['A', 'M'])
    })
    expect(findClip(next, 'A')).toBeNull()
    expect(findClip(next, 'M')).not.toBeNull()
  })

  it('dán: vào track gốc nếu còn chỗ, không thì tạo track mới; giữ khoảng cách giữa các clip', () => {
    const { p, main } = setup()
    const board = copyClips(p, ['A', 'B'])
    // Dán ở 20s: track chính còn trống → dán vào đó, A' ở 20s, B' ở 26s
    let ids: string[] = []
    const next = produce(p, (d) => void (ids = pasteClips(d, board, 20 * S)))
    expect(ids.map((id) => [findClip(next, id)!.track.id, findClip(next, id)!.clip.start])).toEqual([
      [main, 20 * S],
      [main, 26 * S]
    ])
    // Dán ở 1s: đè lên A/B → tạo track video mới
    const clash = produce(p, (d) => void (ids = pasteClips(d, board, 1 * S)))
    expect(clash.tracks).toHaveLength(p.tracks.length + 1)
    expect(findClip(clash, ids[0])!.track.kind).toBe('video')
  })
})
