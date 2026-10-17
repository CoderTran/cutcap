// Các thao tác chỉnh sửa clip: di chuyển, cắt mép (trim), tách (split), xóa, dán.
//
// Có 2 loại hàm:
//   - Hàm TÍNH (planMove, trimBounds, …): chỉ đọc dự án, trả về kế hoạch/giới hạn → dùng để vẽ
//     "bóng" khi đang kéo, và để kiểm tra trước khi sửa.
//   - Hàm SỬA (applyMoves, applyTrim, splitClip, …): sửa trực tiếp bản nháp Immer – luôn gọi
//     bên trong projectStore.apply(...) để có Undo.
import { createId } from '../project/factory'
import * as ops from '../project/ops'
import type { Clip, Id, Project, Track, TrackKind } from '../project/schema'
import type { Micros } from '../project/time'
import { canPlace, clipEnd, findClip } from './clips'
import { clampFades } from './clipProps'

// ───────────────────────── Tiện ích ─────────────────────────

/** Clip có lấy hình/tiếng từ file gốc có độ dài giới hạn không (video, âm thanh – không phải ảnh/chữ). */
function sourceLimited(project: Project, clip: Clip): boolean {
  return clip.type === 'media' && project.assets[clip.assetId]?.kind !== 'image'
}

/** Các clip có thể chỉnh sửa (bỏ qua clip trên track đang khóa). */
export function editableClipIds(project: Project, clipIds: Id[]): Id[] {
  return clipIds.filter((id) => {
    const found = findClip(project, id)
    return found !== null && !found.track.locked
  })
}

// ───────────────────────── Di chuyển ─────────────────────────

export interface ClipMove {
  clipId: Id
  /** Track đích. */
  trackId: Id
  start: Micros
}

export interface MovePlan {
  moves: ClipMove[]
  /** false = vị trí mới chồng lên clip khác → không cho thả. */
  valid: boolean
}

/**
 * Lập kế hoạch di chuyển các clip cùng một khoảng `delta`.
 * @param targetTrackId chỉ áp dụng khi kéo đúng 1 clip: chuyển clip sang track này
 *                      (phải cùng loại và không khóa, nếu không thì giữ track cũ)
 */
export function planMove(project: Project, clipIds: Id[], delta: Micros, targetTrackId?: Id | null): MovePlan {
  const found = clipIds.map((id) => findClip(project, id)).filter((f) => f !== null)
  if (found.length === 0) return { moves: [], valid: false }

  // Không cho clip nào bị đẩy về trước giây 0: giới hạn delta theo clip sớm nhất
  const earliest = Math.min(...found.map((f) => f.clip.start))
  const safeDelta = Math.max(delta, -earliest)

  const moves = found.map(({ track, clip }) => {
    let trackId = track.id
    if (found.length === 1 && targetTrackId) {
      const target = project.tracks.find((t) => t.id === targetTrackId)
      if (target && target.kind === track.kind && !target.locked) trackId = target.id
    }
    return { clipId: clip.id, trackId, start: clip.start + safeDelta }
  })

  // Hợp lệ khi mọi clip đều vừa chỗ ở track đích (bỏ qua chính các clip đang di chuyển),
  // và các clip đang di chuyển không đè lên nhau
  const moving = new Set(clipIds)
  const valid = moves.every((m) => {
    const track = project.tracks.find((t) => t.id === m.trackId)!
    const duration = findClip(project, m.clipId)!.clip.duration
    const fitsTrack = canPlace(track, m.start, duration, [...moving])
    const clashesWithMoving = moves.some(
      (o) => o !== m && o.trackId === m.trackId && m.start < o.start + findClip(project, o.clipId)!.clip.duration && o.start < m.start + duration
    )
    return fitsTrack && !clashesWithMoving
  })
  return { moves, valid }
}

/** Thực hiện kế hoạch di chuyển (giả định đã kiểm tra valid). */
export function applyMoves(draft: Project, moves: ClipMove[]): void {
  // Gỡ tất cả clip ra trước, rồi mới gắn vào vị trí mới – tránh lỗi khi 2 clip đổi chỗ cho nhau
  const taken: { clip: Clip; move: ClipMove }[] = []
  for (const move of moves) {
    for (const track of draft.tracks) {
      const index = track.clips.findIndex((c) => c.id === move.clipId)
      if (index >= 0) {
        taken.push({ clip: track.clips.splice(index, 1)[0], move })
        break
      }
    }
  }
  for (const { clip, move } of taken) {
    clip.start = Math.max(0, Math.round(move.start))
    ops.addClip(draft, move.trackId, clip)
  }
}

// ───────────────────────── Cắt mép (trim) ─────────────────────────

export type TrimEdge = 'start' | 'end'

/**
 * Giới hạn khi kéo mép clip:
 *  - không đè lên clip bên cạnh trên cùng track
 *  - không dài quá phần còn lại của file gốc (video/âm thanh)
 *  - không ngắn hơn `minDuration` (thường là 1 frame)
 * @returns khoảng [min, max] mà mép đó được phép tới
 */
export function trimBounds(
  project: Project,
  clipId: Id,
  edge: TrimEdge,
  minDuration: Micros
): { min: Micros; max: Micros } | null {
  const found = findClip(project, clipId)
  if (!found) return null
  const { track, clip } = found
  const index = track.clips.indexOf(clip)
  const prev = track.clips[index - 1]
  const next = track.clips[index + 1]
  const limited = sourceLimited(project, clip)

  if (edge === 'start') {
    let min = prev ? clipEnd(prev) : 0
    if (limited && clip.type === 'media') min = Math.max(min, Math.ceil(clip.start - clip.sourceIn / clip.speed))
    return { min, max: clipEnd(clip) - minDuration }
  }
  let max = next ? next.start : Number.MAX_SAFE_INTEGER
  if (limited && clip.type === 'media') {
    const asset = project.assets[clip.assetId]
    max = Math.min(max, Math.floor(clip.start + (asset.durationUs - clip.sourceIn) / clip.speed))
  }
  return { min: clip.start + minDuration, max }
}

/** Kéo mép clip tới thời điểm `time` (tự kẹp trong giới hạn). */
export function applyTrim(draft: Project, clipId: Id, edge: TrimEdge, time: Micros, minDuration: Micros): void {
  const bounds = trimBounds(draft, clipId, edge, minDuration)
  const found = findClip(draft, clipId)
  if (!bounds || !found) return
  const { clip } = found
  const t = Math.round(Math.min(bounds.max, Math.max(bounds.min, time)))

  if (edge === 'start') {
    const shift = t - clip.start
    // Cắt đầu clip video: điểm lấy trong file gốc cũng dịch theo (nhân tốc độ)
    if (clip.type === 'media') clip.sourceIn = Math.max(0, Math.round(clip.sourceIn + shift * clip.speed))
    clip.start = t
    clip.duration -= shift
  } else {
    clip.duration = t - clip.start
  }
  clampFades(clip)
}

// ───────────────────────── Tách (split) ─────────────────────────

/** Có tách được clip tại thời điểm `at` không (phải cách 2 đầu ít nhất `minDuration`). */
export function canSplit(clip: Clip, at: Micros, minDuration: Micros): boolean {
  return at >= clip.start + minDuration && at <= clipEnd(clip) - minDuration
}

/**
 * Tách clip thành 2 tại thời điểm `at`.
 * @returns id của nửa sau, hoặc null nếu không tách được
 */
export function splitClip(draft: Project, clipId: Id, at: Micros, minDuration: Micros): Id | null {
  const found = findClip(draft, clipId)
  if (!found || !canSplit(found.clip, at, minDuration)) return null
  const left = found.clip
  const cut = Math.round(at - left.start)

  // Nửa sau: bản sao sâu của clip gốc (JSON đủ dùng vì clip chỉ chứa dữ liệu thuần)
  const right: Clip = { ...JSON.parse(JSON.stringify(left)), id: createId(), start: left.start + cut, duration: left.duration - cut }
  if (right.type === 'media' && left.type === 'media') {
    right.sourceIn = Math.round(left.sourceIn + cut * left.speed)
    right.fadeIn = 0 // hiệu ứng mờ dần vào chỉ giữ ở đầu clip gốc
    right.transitionIn = null
    left.fadeOut = 0 // hiệu ứng mờ dần ra chuyển sang nửa sau
  }
  if (right.type === 'text') right.animationIn = 'none'

  left.duration = cut
  clampFades(left)
  clampFades(right)
  ops.addClip(draft, found.track.id, right)
  return right.id
}

/**
 * Chọn clip để tách khi bấm Ctrl+B:
 *  - có clip đang chọn nằm dưới đầu phát → tách các clip đó
 *  - không có → tách mọi clip dưới đầu phát trên các track không khóa
 */
export function clipsToSplit(project: Project, selected: Id[], at: Micros, minDuration: Micros): Id[] {
  const under = project.tracks
    .filter((t) => !t.locked)
    .flatMap((t) => t.clips)
    .filter((c) => canSplit(c, at, minDuration))
    .map((c) => c.id)
  const selectedUnder = under.filter((id) => selected.includes(id))
  return selectedUnder.length > 0 ? selectedUnder : under
}

// ───────────────────────── Xóa ─────────────────────────

export function deleteClips(draft: Project, clipIds: Id[]): void {
  const ids = new Set(clipIds)
  for (const track of draft.tracks) {
    if (track.locked) continue
    track.clips = track.clips.filter((c) => !ids.has(c.id))
  }
}

// ───────────────────────── Sao chép / dán ─────────────────────────

export interface ClipboardItem {
  clip: Clip
  trackId: Id
  trackKind: TrackKind
}

/** Chụp lại các clip để dán sau (bản sao sâu, không phụ thuộc dự án hiện tại). */
export function copyClips(project: Project, clipIds: Id[]): ClipboardItem[] {
  return clipIds
    .map((id) => findClip(project, id))
    .filter((f) => f !== null)
    .map(({ track, clip }) => ({ clip: JSON.parse(JSON.stringify(clip)) as Clip, trackId: track.id, trackKind: track.kind }))
}

/**
 * Dán clip tại thời điểm `at` (giữ nguyên khoảng cách giữa các clip).
 * Mỗi nhóm clip từ cùng một track gốc: dán lại vào track đó nếu còn trống, không thì tạo track mới.
 * Clip dán phải tham chiếu media còn trong dự án.
 * @returns id các clip mới
 */
export function pasteClips(draft: Project, items: ClipboardItem[], at: Micros): Id[] {
  const usable = items.filter((i) => i.clip.type === 'text' || draft.assets[i.clip.assetId])
  if (usable.length === 0) return []
  const base = Math.min(...usable.map((i) => i.clip.start))
  const newIds: Id[] = []

  const groups = new Map<Id, ClipboardItem[]>()
  for (const item of usable) groups.set(item.trackId, [...(groups.get(item.trackId) ?? []), item])

  for (const [trackId, group] of groups) {
    const placed = group.map((i) => ({ ...i.clip, id: createId(), start: Math.round(at + i.clip.start - base) }) as Clip)
    const original = draft.tracks.find((t) => t.id === trackId)
    const fits = (track: Track | undefined): track is Track =>
      !!track && !track.locked && track.kind === group[0].trackKind && placed.every((c) => canPlace(track, c.start, c.duration))
    const targetId = fits(original) ? original.id : ops.addTrack(draft, group[0].trackKind)
    for (const clip of placed) {
      ops.addClip(draft, targetId, clip)
      newIds.push(clip.id)
    }
  }
  return newIds
}
