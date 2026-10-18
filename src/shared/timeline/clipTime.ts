// Thời gian trên timeline ↔ thời gian trong file gốc của clip – dùng CHUNG cho preview, xuất video, cắt / tỉa.
// Tốc độ thường: tuyến tính (nhanh gấp đôi = đi hết đoạn gốc trong nửa thời gian).
// Uốn cong (speedCurve): theo bảng tích lũy của đường cong (xem speedCurve.ts).
// Ngoài phạm vi clip (phần kéo dài cho chuyển cảnh): ngoại suy theo tốc độ ở 2 đầu.
import type { MediaClip } from '../project/schema'
import type { Micros } from '../project/time'
import { curveFactor, curveSpeedAt, sourceFracAt, timeFracAt } from './speedCurve'

/** Độ dài đoạn file gốc mà clip dùng (µs). */
export function sourceSpanOf(clip: Pick<MediaClip, 'duration' | 'speed' | 'speedCurve'>): Micros {
  return clip.speedCurve ? Math.round(clip.duration / curveFactor(clip.speedCurve)) : Math.round(clip.duration * clip.speed)
}

/** Tốc độ ở đầu và cuối clip. */
export function edgeSpeeds(clip: Pick<MediaClip, 'speed' | 'speedCurve'>): { start: number; end: number } {
  if (!clip.speedCurve) return { start: clip.speed, end: clip.speed }
  return { start: curveSpeedAt(clip.speedCurve, 0), end: curveSpeedAt(clip.speedCurve, 1) }
}

/** Thời điểm t trên timeline → vị trí trong file gốc (µs, chưa kẹp theo độ dài file). */
export function sourceTimeAt(clip: MediaClip, t: Micros): Micros {
  const dt = t - clip.start
  if (!clip.speedCurve) return Math.round(clip.sourceIn + dt * clip.speed)
  const span = sourceSpanOf(clip)
  if (dt <= 0) return Math.round(clip.sourceIn + dt * curveSpeedAt(clip.speedCurve, 0))
  if (dt >= clip.duration) return Math.round(clip.sourceIn + span + (dt - clip.duration) * curveSpeedAt(clip.speedCurve, 1))
  return Math.round(clip.sourceIn + span * sourceFracAt(clip.speedCurve, dt / clip.duration))
}

/** Ngược lại: vị trí trong đoạn gốc (tính từ sourceIn, µs) → thời gian từ đầu clip trên timeline (µs). */
export function timelineOffsetAt(clip: MediaClip, sourceOffset: Micros): Micros {
  if (!clip.speedCurve) return Math.round(sourceOffset / clip.speed)
  const span = sourceSpanOf(clip)
  if (sourceOffset <= 0) return Math.round(sourceOffset / curveSpeedAt(clip.speedCurve, 0))
  if (sourceOffset >= span) return Math.round(clip.duration + (sourceOffset - span) / curveSpeedAt(clip.speedCurve, 1))
  return Math.round(clip.duration * timeFracAt(clip.speedCurve, sourceOffset / span))
}

/**
 * Tốc độ phát tại thời điểm t (cho thẻ <video> của preview).
 * Trục ngang của đường cong là VỊ TRÍ TRONG ĐOẠN GỐC, không phải thời gian trên timeline
 * → đổi thời gian ra vị trí trước rồi mới tra tốc độ.
 */
export function rateAt(clip: MediaClip, t: Micros): number {
  if (!clip.speedCurve) return clip.speed
  const u = Math.min(1, Math.max(0, (t - clip.start) / Math.max(1, clip.duration)))
  return curveSpeedAt(clip.speedCurve, sourceFracAt(clip.speedCurve, u))
}

// ───────── Cắt / tỉa clip uốn cong: dời "cửa sổ" trên đường cong gốc ─────────

/** Độ dài đoạn gốc ứng với TOÀN BỘ đường cong (0–1), suy từ cửa sổ hiện tại. */
function fullSpan(clip: MediaClip): number {
  const [a, b] = clip.speedCurve!.range
  return sourceSpanOf(clip) / (b - a)
}

/** Độ dài trên timeline nếu clip dùng cửa sổ [a, b] của đường cong (đoạn gốc tương ứng thay đổi theo). */
export function windowDuration(clip: MediaClip, a: number, b: number): Micros {
  if (b - a <= 1e-9) return 0
  return fullSpan(clip) * (b - a) * curveFactor({ ...clip.speedCurve!, range: [a, b] })
}

/** Tìm x trong [lo, hi] để f(x) = target (f đơn điệu). */
function solve(f: (x: number) => number, lo: number, hi: number, target: number): number {
  const increasing = f(hi) >= f(lo)
  for (let i = 0; i < 48; i++) {
    const m = (lo + hi) / 2
    if (f(m) < target === increasing) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

/**
 * Giới hạn kéo dài clip uốn cong: chỉ dài ra trong phạm vi đường cong gốc (0–1) và trong file gốc.
 * @returns số µs tối đa có thể kéo thêm về bên trái / phải
 */
export function curveExtendLimits(clip: MediaClip, assetDurationUs: number | null): { left: Micros; right: Micros } {
  const [a, b] = clip.speedCurve!.range
  const full = fullSpan(clip)
  const minA = Math.max(0, a - clip.sourceIn / full)
  const maxB = assetDurationUs === null ? 1 : Math.min(1, b + (assetDurationUs - clip.sourceIn - sourceSpanOf(clip)) / full)
  return {
    left: Math.max(0, Math.floor(windowDuration(clip, minA, b) - clip.duration)),
    right: Math.max(0, Math.floor(windowDuration(clip, a, maxB) - clip.duration))
  }
}

/**
 * Đổi độ dài clip uốn cong bằng cách dời mép `edge` (giữ nguyên mép kia và nội dung tại đó).
 * Cập nhật speedCurve.range, sourceIn (mép đầu) và duration.
 */
export function retimeCurveEdge(clip: MediaClip, edge: 'start' | 'end', newDuration: Micros): void {
  const curve = clip.speedCurve!
  const [a, b] = curve.range
  const full = fullSpan(clip)
  if (edge === 'start') {
    const na = solve((x) => windowDuration(clip, x, b), 0, b - 1e-6, newDuration)
    clip.sourceIn = Math.max(0, Math.round(clip.sourceIn + (na - a) * full))
    clip.speedCurve = { ...curve, range: [na, b] }
  } else {
    const nb = solve((x) => windowDuration(clip, a, x), a + 1e-6, 1, newDuration)
    clip.speedCurve = { ...curve, range: [a, nb] }
  }
  clip.duration = Math.round(newDuration)
}
