// Thước thời gian: chọn khoảng cách vạch phù hợp mức zoom, và đổi giữa thời gian ↔ pixel.
import { MICROS_PER_SECOND, type Micros } from '../project/time'

/** Giới hạn zoom: số pixel cho 1 giây. */
export const MIN_PX_PER_SECOND = 2
export const MAX_PX_PER_SECOND = 600
export const DEFAULT_PX_PER_SECOND = 60

export function timeToPx(t: Micros, pxPerSecond: number): number {
  return (t / MICROS_PER_SECOND) * pxPerSecond
}

export function pxToTime(px: number, pxPerSecond: number): Micros {
  return Math.round((px / pxPerSecond) * MICROS_PER_SECOND)
}

export function clampZoom(pxPerSecond: number): number {
  return Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, pxPerSecond))
}

/** Các bước vạch "đẹp" (giây). Vạch nhỏ hơn 1 giây sẽ tính theo frame. */
const NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600]

export interface TickStep {
  /** Khoảng cách vạch lớn (có nhãn), tính bằng giây. */
  major: number
  /** Số vạch nhỏ chia giữa 2 vạch lớn. */
  subdivisions: number
}

/**
 * Chọn khoảng vạch lớn sao cho 2 nhãn cách nhau ít nhất `minLabelPx` pixel.
 * Khi zoom rất gần (> 1 giây quá rộng), chia theo frame: vạch lớn = 1 giây, vạch nhỏ = mỗi frame.
 */
export function chooseTickStep(pxPerSecond: number, fps: number, minLabelPx = 90): TickStep {
  const major = NICE_STEPS.find((s) => s * pxPerSecond >= minLabelPx) ?? NICE_STEPS.at(-1)!
  if (major === 1) {
    // Zoom đủ gần thì chia từng frame; nếu không thì chia 2/4 cho gọn
    const framePx = pxPerSecond / fps
    const subdivisions = framePx >= 6 ? fps : pxPerSecond >= 200 ? 10 : pxPerSecond >= 120 ? 4 : 2
    return { major, subdivisions }
  }
  const subdivisions = major % 5 === 0 ? 5 : major % 2 === 0 ? 2 : major % 3 === 0 ? 3 : 1
  return { major, subdivisions }
}

/** Nhãn thước: "0:05", "1:30", "1:00:00". */
export function formatRulerLabel(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor(s / 60) % 60
  const ss = (s % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
