import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset, Project } from '@shared/project/schema'
import {
  DEFAULT_IMAGE_DURATION,
  canPlace,
  createMediaClip,
  findClip,
  projectDuration,
  resolveDrop
} from '@shared/timeline/clips'
import { chooseTickStep, formatRulerLabel, pxToTime, timeToPx } from '@shared/timeline/ruler'
import { collectSnapPoints, snapSpan } from '@shared/timeline/snap'

const S = 1_000_000 // 1 giây (µs)

function asset(id: string, kind: MediaAsset['kind'], seconds: number): MediaAsset {
  return { id, kind, path: `C:\\${id}`, name: id, durationUs: seconds * S, width: 1920, height: 1080, fps: 30, hasAudio: kind !== 'image' }
}

/** Dự án có: track video chính với clip 0–10s. */
function setup(): Project {
  const p = createEmptyProject('t')
  p.assets.v = asset('v', 'video', 10)
  p.assets.a = asset('a', 'audio', 30)
  p.assets.i = asset('i', 'image', 0)
  ops.addClip(p, p.tracks[0].id, { ...createMediaClip(p.assets.v, 0), id: 'c1' })
  return p
}

describe('clip & vị trí thả', () => {
  it('tạo clip: video dài đúng file, ảnh mặc định 3 giây, không âm', () => {
    const p = setup()
    expect(createMediaClip(p.assets.v, 2 * S).duration).toBe(10 * S)
    expect(createMediaClip(p.assets.i, 0).duration).toBe(DEFAULT_IMAGE_DURATION)
    expect(createMediaClip(p.assets.v, -5).start).toBe(0)
  })

  it('canPlace phát hiện chồng lấn', () => {
    const track = setup().tracks[0]
    expect(canPlace(track, 10 * S, 5 * S)).toBe(true) // ngay sau clip
    expect(canPlace(track, 9 * S, 5 * S)).toBe(false) // chồng 1 giây
    expect(canPlace(track, 9 * S, 5 * S, ['c1'])).toBe(true) // bỏ qua chính nó
  })

  it('thả vào chỗ trống đúng loại track → dùng track đó', () => {
    const p = setup()
    expect(resolveDrop(p, p.assets.v, p.tracks[0].id, 12 * S)).toEqual({ trackId: p.tracks[0].id, kind: 'video', start: 12 * S })
  })

  it('thả chồng lên clip, sai loại track, track khóa, hoặc vùng trống → tạo track mới', () => {
    const p = setup()
    const main = p.tracks[0].id
    expect(resolveDrop(p, p.assets.v, main, 5 * S).trackId).toBeNull()
    expect(resolveDrop(p, p.assets.a, main, 20 * S)).toMatchObject({ trackId: null, kind: 'audio' })
    expect(resolveDrop(p, p.assets.v, null, 0).trackId).toBeNull()
    p.tracks[0].locked = true
    expect(resolveDrop(p, p.assets.v, main, 20 * S).trackId).toBeNull()
  })

  it('addClip giữ thứ tự theo thời gian; projectDuration/findClip đúng', () => {
    const p = setup()
    ops.addClip(p, p.tracks[0].id, { ...createMediaClip(p.assets.i, 20 * S), id: 'c3' })
    ops.addClip(p, p.tracks[0].id, { ...createMediaClip(p.assets.i, 12 * S), id: 'c2' })
    expect(p.tracks[0].clips.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(projectDuration(p)).toBe(23 * S)
    expect(findClip(p, 'c2')?.track.id).toBe(p.tracks[0].id)
    expect(findClip(p, 'nope')).toBeNull()
  })

  it('track âm thanh mới nằm dưới track hình, trên track âm thanh cũ', () => {
    const p = setup()
    const a1 = ops.addTrack(p, 'audio')
    const v2 = ops.addTrack(p, 'video')
    const a2 = ops.addTrack(p, 'audio')
    expect(p.tracks.map((t) => t.id)).toEqual([v2, p.tracks[1].id, a2, a1])
  })
})

describe('hít (snap)', () => {
  it('hít mép đầu hoặc mép cuối vào mốc gần nhất trong ngưỡng', () => {
    const p = setup()
    const points = collectSnapPoints(p, 4 * S)
    expect(points).toEqual(expect.arrayContaining([0, 4 * S, 10 * S]))
    // Mép đầu ở 10.1s → hít về 10s (cuối clip c1)
    expect(snapSpan(10.1 * S, 2 * S, points, 0.2 * S)).toEqual({ start: 10 * S, snappedTo: 10 * S })
    // Mép cuối ở 3.9s → hít về đầu phát 4s
    expect(snapSpan(1.9 * S, 2 * S, points, 0.2 * S)).toEqual({ start: 2 * S, snappedTo: 4 * S })
    // Ngoài ngưỡng → giữ nguyên
    expect(snapSpan(6 * S, 1 * S, points, 0.2 * S)).toEqual({ start: 6 * S, snappedTo: null })
  })
})

describe('thước thời gian', () => {
  it('đổi thời gian ↔ pixel', () => {
    expect(timeToPx(2 * S, 50)).toBe(100)
    expect(pxToTime(100, 50)).toBe(2 * S)
  })

  it('chọn khoảng vạch để nhãn không chồng nhau', () => {
    expect(chooseTickStep(100, 30).major).toBe(1)
    expect(chooseTickStep(20, 30).major).toBe(5)
    expect(chooseTickStep(2, 30).major).toBe(60)
    // Zoom rất gần: chia theo từng frame
    expect(chooseTickStep(600, 30)).toEqual({ major: 1, subdivisions: 30 })
  })

  it('nhãn thước', () => {
    expect(formatRulerLabel(5)).toBe('0:05')
    expect(formatRulerLabel(90)).toBe('1:30')
    expect(formatRulerLabel(3600)).toBe('1:00:00')
  })
})
