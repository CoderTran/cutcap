// Chuyển cảnh giữa 2 clip liền nhau trên cùng track.
//
// Chuyển cảnh nằm GIỮA mối cắt và KHÔNG làm đổi độ dài video (giống CapCut):
//   chuyển cảnh dài d ở mối cắt c  →  diễn ra trong [c − d/2, c + d/2]
//   - clip trước chiếu tiếp d/2 sau mối cắt (dùng phần thừa của file gốc; hết thì giữ khung cuối)
//   - clip sau bắt đầu sớm d/2 (tương tự; thiếu thì giữ khung đầu)
//   - âm thanh vẫn cắt gọn tại mối cắt
// Dữ liệu lưu ở clip SAU: clip.transitionIn = { kind, duration }.
// Preview và engine xuất video cùng dùng file này → hiệu ứng giống nhau.
import { sourceTimeAt } from './clipTime'
import type { Id, MediaAsset, MediaClip, Project, Track, TransitionKind } from '../project/schema'
import type { Micros } from '../project/time'
import { clipEnd, findClip } from './clips'

export const MIN_TRANSITION: Micros = 200_000
export const MAX_TRANSITION: Micros = 2_000_000
export const DEFAULT_TRANSITION: Micros = 500_000
/** 2 clip cách nhau dưới 1ms coi như liền nhau. */
const ADJACENT_TOLERANCE: Micros = 1000

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** Clip có hình (video/ảnh) – chỉ những clip này mới có chuyển cảnh. */
function isVisualMedia(project: Project, clip: unknown): clip is MediaClip {
  const c = clip as MediaClip | undefined
  return c?.type === 'media' && project.assets[c.assetId] !== undefined && project.assets[c.assetId].kind !== 'audio'
}

/** Clip thứ `index` trên track có thể có chuyển cảnh với clip ngay trước nó không. */
export function canHaveTransition(project: Project, track: Track, index: number): boolean {
  if (index <= 0 || track.kind === 'audio') return false
  const prev = track.clips[index - 1]
  const cur = track.clips[index]
  return isVisualMedia(project, prev) && isVisualMedia(project, cur) && Math.abs(cur.start - clipEnd(prev)) <= ADJACENT_TOLERANCE
}

/** Độ dài tối đa: không dài hơn clip ngắn hơn trong 2 clip. */
export function maxTransitionDuration(prev: { duration: Micros }, cur: { duration: Micros }): Micros {
  return Math.min(MAX_TRANSITION, prev.duration, cur.duration)
}

export interface ActiveTransition {
  kind: TransitionKind
  duration: Micros
  /** Mối cắt. */
  cut: Micros
  /** Bắt đầu / kết thúc chuyển cảnh. */
  from: Micros
  to: Micros
}

/** Chuyển cảnh VÀO clip thứ `index` (null nếu không có hoặc không còn hợp lệ, vd. 2 clip đã bị tách xa). */
export function transitionAt(project: Project, track: Track, index: number): ActiveTransition | null {
  const cur = track.clips[index]
  if (cur?.type !== 'media' || !cur.transitionIn || !canHaveTransition(project, track, index)) return null
  const prev = track.clips[index - 1]
  const duration = clamp(cur.transitionIn.duration, MIN_TRANSITION, maxTransitionDuration(prev, cur))
  const cut = cur.start
  return { kind: cur.transitionIn.kind, duration, cut, from: cut - duration / 2, to: cut + duration / 2 }
}

/** Khoảng thời gian clip thứ `index` hiện trên màn hình (dài hơn clip nếu có chuyển cảnh ở 2 đầu). */
export function visibleSpan(project: Project, track: Track, index: number): { from: Micros; to: Micros } {
  const clip = track.clips[index]
  const tin = transitionAt(project, track, index)
  const tout = transitionAt(project, track, index + 1)
  return { from: tin ? tin.from : clip.start, to: tout ? tout.to : clipEnd(clip) }
}

/** Tiến độ chuyển cảnh tại t: 0 → 1. */
export function transitionProgress(tr: ActiveTransition, t: Micros): number {
  return clamp((t - tr.from) / tr.duration, 0, 1)
}

export interface TransitionEffect {
  /** Nhân vào độ mờ. */
  alpha: number
  /** Dịch ngang, tính theo bề rộng khung hình (1 = cả khung). */
  offsetX: number
  /** Phóng cả lớp hình quanh TÂM KHUNG HÌNH (1 = giữ nguyên). */
  frameZoom: number
}

export const NO_EFFECT: TransitionEffect = { alpha: 1, offsetX: 0, frameZoom: 1 }

/**
 * Hiệu ứng lên một clip trong chuyển cảnh.
 * @param role 'in' = clip sau (đang vào), 'out' = clip trước (đang ra)
 * @param p    tiến độ 0 → 1 (tuyến tính – FFmpeg dùng đúng công thức này khi xuất)
 */
export function transitionEffect(kind: TransitionKind, role: 'in' | 'out', p: number): TransitionEffect {
  switch (kind) {
    case 'fade':
      return role === 'in' ? { ...NO_EFFECT, alpha: p } : NO_EFFECT
    case 'slide-left':
      return { ...NO_EFFECT, offsetX: role === 'in' ? 1 - p : -p }
    case 'slide-right':
      return { ...NO_EFFECT, offsetX: role === 'in' ? -(1 - p) : p }
    case 'zoom':
      return role === 'in' ? { alpha: p, offsetX: 0, frameZoom: 1.2 - 0.2 * p } : NO_EFFECT
  }
}

/**
 * Vị trí trong file gốc tại t, KẸP trong độ dài file: ngoài phạm vi thì giữ khung đầu/cuối.
 * Cần khi chuyển cảnh kéo clip ra ngoài đoạn đã cắt.
 */
export function clampedSourceTime(clip: MediaClip, asset: MediaAsset, t: Micros): { time: Micros; frozen: boolean } {
  const raw = sourceTimeAt(clip, t)
  // Khung cuối: lùi 40ms khỏi điểm kết thúc để trình phát/FFmpeg chắc chắn có hình
  const max = Math.max(0, asset.durationUs - 40_000)
  const time = clamp(raw, 0, max)
  return { time, frozen: time !== raw }
}

/** Đặt / xóa chuyển cảnh vào clip (kind null = xóa). */
export function applyTransition(draft: Project, clipId: Id, kind: TransitionKind | null, duration: Micros): void {
  const found = findClip(draft, clipId)
  if (!found || found.clip.type !== 'media') return
  if (kind === null) {
    found.clip.transitionIn = null
    return
  }
  const index = found.track.clips.indexOf(found.clip)
  if (!canHaveTransition(draft, found.track, index)) return
  const prev = found.track.clips[index - 1]
  found.clip.transitionIn = {
    kind,
    duration: Math.round(clamp(duration, MIN_TRANSITION, maxTransitionDuration(prev, found.clip)))
  }
}

/**
 * Mối cắt (giữa 2 clip hình liền nhau) gần thời điểm t nhất – dùng cho nút "+" ở tab Chuyển tiếp.
 * @param preferTrackId ưu tiên track này (track của clip đang chọn) nếu có mối cắt
 * @returns id clip phía SAU mối cắt (nơi lưu chuyển cảnh), hoặc null nếu dự án chưa có mối cắt nào
 */
export function findCutNear(project: Project, t: Micros, preferTrackId?: Id | null): Id | null {
  let best: { id: Id; distance: number } | null = null
  const consider = (track: Track): void => {
    track.clips.forEach((clip, i) => {
      if (!canHaveTransition(project, track, i)) return
      const distance = Math.abs(clip.start - t)
      if (!best || distance < best.distance) best = { id: clip.id, distance }
    })
  }
  const preferred = project.tracks.find((tr) => tr.id === preferTrackId)
  if (preferred) consider(preferred)
  if (!best) project.tracks.forEach(consider)
  return (best as { id: Id } | null)?.id ?? null
}
