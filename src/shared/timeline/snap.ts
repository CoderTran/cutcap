// "Hít" (snap): khi kéo/thả gần đầu phát hoặc mép clip khác, tự dính vào cho thẳng hàng.
import type { Id, Project } from '../project/schema'
import type { Micros } from '../project/time'
import { clipEnd } from './clips'

/** Các mốc có thể hít vào: 0, đầu phát, đầu và cuối mọi clip (trừ các clip đang kéo). */
export function collectSnapPoints(project: Project, playhead: Micros, excludeClipIds: Id[] = []): Micros[] {
  const points = new Set<Micros>([0, playhead])
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (excludeClipIds.includes(clip.id)) continue
      points.add(clip.start)
      points.add(clipEnd(clip))
    }
  }
  return [...points]
}

/**
 * Hít một đoạn [start, start+duration): thử khớp cả mép đầu lẫn mép cuối, lấy mốc gần nhất.
 * @param threshold khoảng cách tối đa để hít (µs) – thường tính từ ~8 pixel theo mức zoom
 * @returns start mới và mốc đã hít (null nếu không hít)
 */
export function snapSpan(
  start: Micros,
  duration: Micros,
  points: Micros[],
  threshold: Micros
): { start: Micros; snappedTo: Micros | null } {
  let best: { delta: number; point: Micros } | null = null
  for (const point of points) {
    for (const edge of [start, start + duration]) {
      const delta = point - edge
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, point }
      }
    }
  }
  if (!best) return { start, snappedTo: null }
  return { start: Math.max(0, start + best.delta), snappedTo: best.point }
}
