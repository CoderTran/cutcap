// "Tại thời điểm t, khung hình gồm những gì và đang phát tiếng gì?"
// Hàm thuần – preview (Bước 5) và engine xuất video (Bước 6) cùng dùng, để hai bên luôn khớp nhau.
import type { Clip, MediaAsset, MediaClip, Project, Track } from '../project/schema'
import type { Micros } from '../project/time'
import { clipEnd } from './clips'
import {
  NO_EFFECT,
  clampedSourceTime,
  transitionAt,
  transitionEffect,
  transitionProgress,
  visibleSpan,
  type TransitionEffect
} from './transitions'

/** Clip có đang hiện tại thời điểm t không (tính cả đầu, không tính cuối). */
export function isActiveAt(clip: Clip, t: Micros): boolean {
  return t >= clip.start && t < clipEnd(clip)
}

/** Vị trí trong file gốc tương ứng thời điểm t trên timeline (đã tính tốc độ, chưa kẹp). */
export function sourceTimeAt(clip: MediaClip, t: Micros): Micros {
  return Math.round(clip.sourceIn + (t - clip.start) * clip.speed)
}

export interface VisualLayer {
  clip: Clip
  track: Track
  /** Có với clip media/sticker; không có với clip chữ. */
  asset: MediaAsset | undefined
  /** Vị trí trong file gốc (chỉ có nghĩa với video), đã kẹp trong độ dài file. */
  sourceTime: Micros
  /** Hiệu ứng chuyển cảnh đang áp lên lớp này (NO_EFFECT nếu không có). */
  effect: TransitionEffect
}

/** Gộp 2 hiệu ứng (clip vừa đang vào vừa đang ra – khi clip rất ngắn). */
function combine(a: TransitionEffect, b: TransitionEffect): TransitionEffect {
  return { alpha: a.alpha * b.alpha, offsetX: a.offsetX + b.offsetX, frameZoom: a.frameZoom * b.frameZoom }
}

/**
 * Các lớp hình tại thời điểm t, xếp từ DƯỚI lên TRÊN (vẽ theo đúng thứ tự này).
 * Track đầu danh sách nằm trên cùng, nên duyệt ngược. Bỏ qua track bị ẩn và track âm thanh.
 * Trong lúc chuyển cảnh, một track có 2 lớp: clip trước (dưới) và clip sau (trên).
 */
export function visualLayersAt(project: Project, t: Micros): VisualLayer[] {
  const layers: VisualLayer[] = []
  for (let ti = project.tracks.length - 1; ti >= 0; ti--) {
    const track = project.tracks[ti]
    if (track.hidden || track.kind === 'audio') continue
    track.clips.forEach((clip, i) => {
      const span = visibleSpan(project, track, i)
      if (t < span.from || t >= span.to) return
      const asset = clip.type === 'text' ? undefined : project.assets[clip.assetId]
      if (clip.type !== 'text' && !asset) return

      let effect = NO_EFFECT
      const tin = transitionAt(project, track, i)
      if (tin && t < tin.to) effect = combine(effect, transitionEffect(tin.kind, 'in', transitionProgress(tin, t)))
      const tout = transitionAt(project, track, i + 1)
      if (tout && t >= tout.from) effect = combine(effect, transitionEffect(tout.kind, 'out', transitionProgress(tout, t)))

      const sourceTime = clip.type === 'media' && asset ? clampedSourceTime(clip, asset, t).time : 0
      layers.push({ clip, track, asset, sourceTime, effect })
    })
  }
  return layers
}

/** Clip media có "chạy theo thời gian" (video/âm thanh) – khác với ảnh tĩnh. */
export function isTimedMedia(project: Project, clip: Clip): clip is MediaClip {
  return clip.type === 'media' && project.assets[clip.assetId]?.kind !== 'image'
}

export interface TimedClip {
  clip: MediaClip
  track: Track
  asset: MediaAsset
}

/**
 * Các clip video/âm thanh cần chạy trong khoảng [from, to) – kể cả phần kéo dài do chuyển cảnh.
 * Dùng để biết cần chuẩn bị (tải trước) những file nào. Với from === to: các clip đang chạy tại t.
 */
export function timedClipsBetween(project: Project, from: Micros, to: Micros): TimedClip[] {
  const result: TimedClip[] = []
  for (const track of project.tracks) {
    track.clips.forEach((clip, i) => {
      if (!isTimedMedia(project, clip)) return
      const span = visibleSpan(project, track, i)
      const overlaps = from === to ? from >= span.from && from < span.to : span.from < to && span.to > from
      if (overlaps) result.push({ clip, track, asset: project.assets[clip.assetId] })
    })
  }
  return result
}
