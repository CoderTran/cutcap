// "Hút vào đoạn chính" (nam châm track chính, giống CapCut): clip trên track chính luôn nằm sát nhau từ giây 0,
// không có khoảng trống. Kéo clip trong track chính = đổi thứ tự (các clip khác dạt ra nhường chỗ),
// xóa / cắt ngắn clip → các clip phía sau tự dồn lên. Các track khác (lớp phủ, chữ, âm thanh) giữ nguyên.
import type { Clip, Id, Project, Track } from '../project/schema'
import type { Micros } from '../project/time'
import { canPlace, clipEnd, findClip, mainTrackFor } from './clips'
import { NEW_TRACK_ID, planMove, type ClipMove, type MovePlan, type MoveTarget } from './edit'

/** Track chính của dự án (track video dưới cùng, không khóa). */
export function mainTrack(project: Project): Track | undefined {
  return mainTrackFor(project, 'video')
}

/** Dồn các clip của track sát nhau từ giây 0 (giữ thứ tự theo thời điểm bắt đầu). @returns có thay đổi không */
export function packTrack(track: Track): boolean {
  const sorted = [...track.clips].sort((a, b) => a.start - b.start)
  let changed = sorted.some((c, i) => c !== track.clips[i])
  let t: Micros = 0
  for (const clip of sorted) {
    if (clip.start !== t) {
      clip.start = t
      changed = true
    }
    t = clipEnd(clip)
  }
  if (changed) track.clips.splice(0, track.clips.length, ...sorted)
  return changed
}

/** Dồn track chính (nếu có). */
export function packMainTrack(project: Project): boolean {
  const track = mainTrack(project)
  return track ? packTrack(track) : false
}

/**
 * Chỗ chèn trên track chính: đứng sau mọi clip có điểm giữa nằm trước `center` (tâm của clip đang kéo / thả).
 * @param clips các clip còn lại trên track (theo thứ tự)
 * @returns vị trí trong danh sách + thời điểm bắt đầu khi đã dồn sát
 */
export function insertionPoint(clips: Pick<Clip, 'start' | 'duration'>[], center: Micros): { index: number; start: Micros } {
  let index = 0
  let start: Micros = 0
  for (const c of clips) {
    if (c.start + c.duration / 2 >= center) break
    start += c.duration
    index++
  }
  return { index, start }
}

/**
 * Kế hoạch kéo clip khi bật Hút vào đoạn chính. Clip thả vào track chính được CHÈN vào mối nối gần nhất,
 * các clip khác của track chính dạt ra (có trong `moves` để vẽ bóng). Clip sang track khác: như bình thường.
 */
export function planMagnetMove(project: Project, clipIds: Id[], delta: Micros, targetTrackId?: MoveTarget): MovePlan {
  const base = planMove(project, clipIds, delta, targetTrackId)
  const main = mainTrack(project)
  if (!main || base.moves.length === 0) return base

  const moving = new Set(clipIds)
  const toMain = base.moves.filter((m) => m.trackId === main.id).sort((a, b) => a.start - b.start)
  const elsewhere = base.moves.filter((m) => m.trackId !== main.id)
  const duration = (id: Id): Micros => findClip(project, id)!.clip.duration

  // Clip sang track khác: phải vừa chỗ và không đè lên nhau
  const valid = elsewhere.every((m) => {
    if (m.trackId === NEW_TRACK_ID) return true
    const track = project.tracks.find((t) => t.id === m.trackId)!
    const d = duration(m.clipId)
    const clash = elsewhere.some(
      (o) => o !== m && o.trackId === m.trackId && m.start < o.start + duration(o.clipId) && o.start < m.start + d
    )
    return canPlace(track, m.start, d, [...moving]) && !clash
  })

  // Track chính sau khi gỡ clip đang kéo, dồn sát
  const rest = main.clips.filter((c) => !moving.has(c.id))
  const order: { clipId: Id; duration: Micros }[] = rest.map((c) => ({ clipId: c.id, duration: c.duration }))
  if (toMain.length > 0) {
    // So tâm khối đang kéo với điểm giữa các clip ở vị trí hiện tại → kéo quá nửa clip bên cạnh mới đổi chỗ
    const total = toMain.reduce((sum, m) => sum + duration(m.clipId), 0)
    const { index } = insertionPoint(rest, toMain[0].start + total / 2)
    order.splice(index, 0, ...toMain.map((m) => ({ clipId: m.clipId, duration: duration(m.clipId) })))
  }
  const mainMoves: ClipMove[] = []
  let t: Micros = 0
  for (const o of order) {
    const clip = findClip(project, o.clipId)!.clip
    if (moving.has(o.clipId) || clip.start !== t) mainMoves.push({ clipId: o.clipId, trackId: main.id, start: t })
    t += o.duration
  }
  // Track hình mới nằm dưới cùng = track chính mới → clip về giây 0
  const becomesMain = base.newTrack?.kind === 'video' && !project.tracks.slice(base.newTrack.index).some((t) => t.kind === 'video')
  const placed = becomesMain ? elsewhere.map((m) => (m.trackId === NEW_TRACK_ID ? { ...m, start: 0 } : m)) : elsewhere
  return { moves: [...placed, ...mainMoves], valid, newTrack: base.newTrack }
}

/**
 * Thêm clip vào track chính khi bật Hút vào đoạn chính: dồn sát track, chèn vào mối nối gần tâm clip nhất,
 * các clip phía sau dạt ra nhường chỗ. Sửa trực tiếp bản nháp.
 */
export function magnetInsert(track: Track, clip: Clip): void {
  packTrack(track)
  const { index, start } = insertionPoint(track.clips, clip.start + clip.duration / 2)
  for (const c of track.clips.slice(index)) c.start += clip.duration
  clip.start = start
  track.clips.splice(index, 0, clip)
}

/** Thời điểm bắt đầu clip mới sẽ có nếu chèn vào track chính (để vẽ bóng khi kéo media vào). */
export function magnetInsertStart(track: Track, start: Micros, duration: Micros): Micros {
  const sorted = [...track.clips].sort((a, b) => a.start - b.start)
  return insertionPoint(sorted, start + duration / 2).start
}
