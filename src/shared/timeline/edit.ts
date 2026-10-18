// Các thao tác chỉnh sửa clip: di chuyển, cắt mép (trim), tách (split), xóa, dán.
//
// Có 2 loại hàm:
//   - Hàm TÍNH (planMove, trimBounds, …): chỉ đọc dự án, trả về kế hoạch/giới hạn → dùng để vẽ
//     "bóng" khi đang kéo, và để kiểm tra trước khi sửa.
//   - Hàm SỬA (applyMoves, applyTrim, splitClip, …): sửa trực tiếp bản nháp Immer – luôn gọi
//     bên trong projectStore.apply(...) để có Undo.
import { curveExtendLimits, retimeCurveEdge, sourceTimeAt } from './clipTime'
import { sourceFracAt, subCurve } from './speedCurve'
import { createId, createTrack } from '../project/factory'
import * as ops from '../project/ops'
import type { Clip, Id, Project, Track, TrackKind } from '../project/schema'
import type { Micros } from '../project/time'
import { canPlace, clipAssetId, clipEnd, findClip } from './clips'
import { clampFades } from './clipProps'
import { shiftKeyframes } from './keyframes'

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
  /** Kéo ra ngoài các track: tạo track mới loại `kind` tại vị trí `index` (các move có trackId = NEW_TRACK_ID). */
  newTrack?: { kind: TrackKind; index: number }
}

/** trackId tạm của track sẽ được tạo khi thả (kéo clip lên trên / xuống dưới mọi track). */
export const NEW_TRACK_ID = '__new-track__'
/** Đích kéo: track có sẵn, hoặc track mới phía trên cùng / dưới cùng. */
export type MoveTarget = Id | 'new-top' | 'new-bottom' | null

/**
 * Vị trí chèn track mới trong project.tracks (giữ thứ tự: track hình ở trên, track âm thanh ở dưới).
 *   - lên trên: hình → trên cùng; âm thanh → trên các track âm thanh
 *   - xuống dưới: video → dưới track hình cuối cùng (thành track chính); chữ / sticker / hiệu ứng → ngay trên
 *     track video chính (để không bị video che); âm thanh → dưới cùng
 */
export function newTrackIndex(project: Project, kind: TrackKind, where: 'new-top' | 'new-bottom'): number {
  const firstAudio = project.tracks.findIndex((t) => t.kind === 'audio')
  const audioStart = firstAudio === -1 ? project.tracks.length : firstAudio
  if (kind === 'audio') return where === 'new-top' ? audioStart : project.tracks.length
  if (where === 'new-top') return 0
  if (kind === 'video') return audioStart
  const mainVideo = project.tracks.findLastIndex((t) => t.kind === 'video')
  return mainVideo === -1 ? audioStart : mainVideo
}

/**
 * Lập kế hoạch di chuyển các clip cùng một khoảng `delta`.
 * @param targetTrackId chỉ áp dụng khi kéo đúng 1 clip: chuyển clip sang track này
 *                      (phải cùng loại và không khóa, nếu không thì giữ track cũ)
 */
export function planMove(project: Project, clipIds: Id[], delta: Micros, targetTrackId?: MoveTarget): MovePlan {
  const found = clipIds.map((id) => findClip(project, id)).filter((f) => f !== null)
  if (found.length === 0) return { moves: [], valid: false }

  // Không cho clip nào bị đẩy về trước giây 0: giới hạn delta theo clip sớm nhất
  const earliest = Math.min(...found.map((f) => f.clip.start))
  const safeDelta = Math.max(delta, -earliest)

  // Kéo 1 clip lên trên / xuống dưới mọi track → track mới cùng loại
  let newTrack: MovePlan['newTrack']
  if (found.length === 1 && (targetTrackId === 'new-top' || targetTrackId === 'new-bottom')) {
    const kind = found[0].track.kind
    newTrack = { kind, index: newTrackIndex(project, kind, targetTrackId) }
  }

  const moves = found.map(({ track, clip }) => {
    let trackId = track.id
    if (newTrack) trackId = NEW_TRACK_ID
    else if (found.length === 1 && targetTrackId) {
      const target = project.tracks.find((t) => t.id === targetTrackId)
      if (target && target.kind === track.kind && !target.locked) trackId = target.id
    }
    return { clipId: clip.id, trackId, start: clip.start + safeDelta }
  })

  // Hợp lệ khi mọi clip đều vừa chỗ ở track đích (bỏ qua chính các clip đang di chuyển),
  // và các clip đang di chuyển không đè lên nhau
  const moving = new Set(clipIds)
  const valid = moves.every((m) => {
    if (m.trackId === NEW_TRACK_ID) return true // track mới: trống
    const track = project.tracks.find((t) => t.id === m.trackId)!
    const duration = findClip(project, m.clipId)!.clip.duration
    const fitsTrack = canPlace(track, m.start, duration, [...moving])
    const clashesWithMoving = moves.some(
      (o) => o !== m && o.trackId === m.trackId && m.start < o.start + findClip(project, o.clipId)!.clip.duration && o.start < m.start + duration
    )
    return fitsTrack && !clashesWithMoving
  })
  return { moves, valid, newTrack }
}

/** Thực hiện kế hoạch di chuyển (giả định đã kiểm tra valid). Có newTrack → tạo track mới trước. */
export function applyMoves(draft: Project, moves: ClipMove[], newTrack?: MovePlan['newTrack']): void {
  if (newTrack) {
    const track = createTrack(newTrack.kind)
    draft.tracks.splice(newTrack.index, 0, track)
    moves = moves.map((m) => (m.trackId === NEW_TRACK_ID ? { ...m, trackId: track.id } : m))
  }
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

  // Uốn cong: chỉ kéo dài được trong phạm vi đường cong gốc và file gốc
  const curve = clip.type === 'media' && clip.speedCurve ? curveExtendLimits(clip, limited ? project.assets[clip.assetId].durationUs : null) : null
  if (edge === 'start') {
    let min = prev ? clipEnd(prev) : 0
    if (curve) min = Math.max(min, clip.start - curve.left)
    else if (limited && clip.type === 'media') min = Math.max(min, Math.ceil(clip.start - clip.sourceIn / clip.speed))
    return { min, max: clipEnd(clip) - minDuration }
  }
  let max = next ? next.start : Number.MAX_SAFE_INTEGER
  if (curve) max = Math.min(max, clipEnd(clip) + curve.right)
  else if (limited && clip.type === 'media') {
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
    // Uốn cong: dời cửa sổ trên đường cong (tự cập nhật sourceIn và độ dài)
    if (clip.type === 'media' && clip.speedCurve) retimeCurveEdge(clip, 'start', clip.duration - shift)
    else {
      // Cắt đầu clip video: điểm lấy trong file gốc cũng dịch theo (nhân tốc độ)
      if (clip.type === 'media') clip.sourceIn = Math.max(0, Math.round(clip.sourceIn + shift * clip.speed))
      clip.duration -= shift
    }
    clip.start = t
    shiftKeyframes(clip, -shift) // keyframe tính từ đầu clip → dời theo để vẫn bám đúng nội dung
  } else if (clip.type === 'media' && clip.speedCurve) {
    retimeCurveEdge(clip, 'end', t - clip.start)
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
    right.sourceIn = sourceTimeAt(left, left.start + cut)
    // Uốn cong: mỗi nửa giữ phần đường cong của mình (cửa sổ trên đường cong gốc → không lệch)
    if (left.speedCurve) {
      const x = sourceFracAt(left.speedCurve, cut / left.duration)
      right.speedCurve = subCurve(left.speedCurve, x, 1)
      left.speedCurve = subCurve(left.speedCurve, 0, x)
    }
    right.fadeIn = 0 // hiệu ứng mờ dần vào chỉ giữ ở đầu clip gốc
    right.transitionIn = null
    left.fadeOut = 0 // hiệu ứng mờ dần ra chuyển sang nửa sau
    // Hiệu ứng động: Vào ở đầu clip gốc (nửa trước), Ra ở cuối (nửa sau), Kết hợp giữ cả hai
    right.animIn = null
    left.animOut = null
  }
  if (right.type === 'text' && left.type === 'text') {
    // Chữ: Vào ở nửa trước, Ra ở nửa sau; Vòng lặp giữ cả hai
    right.animationIn = 'none'
    right.textIn = null
    left.textOut = null
  }
  // Cả 2 nửa giữ mọi keyframe (nửa sau dời theo điểm cắt) → chuyển động liền mạch qua chỗ tách
  shiftKeyframes(right, -cut)

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
  // Clip lấy từ media: chỉ dán được nếu media còn trong thư viện (chữ, hiệu ứng: luôn dán được)
  const usable = items.filter((i) => {
    const id = clipAssetId(i.clip)
    return id === null || !!draft.assets[id]
  })
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
