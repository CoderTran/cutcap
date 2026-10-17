// Phần tính toán (không vẽ) cho clip chữ: cỡ chữ theo khung hình, trạng thái hiệu ứng xuất hiện.
// Phần vẽ thật nằm ở renderer/src/engine/text/drawText.ts (cần canvas của trình duyệt).
import { hasKeyframes } from '../timeline/keyframes'
import type { TextClip, TextStyle } from '../project/schema'
import type { Micros } from '../project/time'

/** Khoảng cách dòng = 1.25 × cỡ chữ. */
export const LINE_HEIGHT = 1.25

/**
 * Cỡ chữ thật (pixel) trên khung W×H. style.fontSize tính theo khung có cạnh ngắn 1080px
 * → chữ chiếm cùng tỉ lệ khung hình dù xem preview nhỏ hay xuất 4K.
 */
export function fontPx(style: TextStyle, frameW: number, frameH: number): number {
  return (style.fontSize * Math.min(frameW, frameH)) / 1080
}

/** Chuỗi font cho canvas, ví dụ: 'italic bold 72px "Segoe UI"'. */
export function cssFont(style: Pick<TextStyle, 'fontFamily' | 'bold' | 'italic'>, px: number): string {
  // Bỏ dấu ngoặc kép trong tên font để không làm hỏng chuỗi
  const family = style.fontFamily.replace(/"/g, '')
  return `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${px.toFixed(2)}px "${family}", "Segoe UI", sans-serif`
}

/**
 * Tách chuỗi thành các "ký tự nhìn thấy" (grapheme). Quan trọng với tiếng Việt:
 * "ệ" có thể gồm 3 điểm mã Unicode (e + dấu mũ + dấu nặng) nhưng phải hiện ra cùng lúc.
 */
export function splitGraphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter('vi', { granularity: 'grapheme' })
  return [...segmenter.segment(text)].map((s) => s.segment)
}

const easeOutCubic = (p: number): number => 1 - (1 - p) ** 3

export interface TextAnimationState {
  /** Nhân vào độ mờ. */
  alpha: number
  /** Dịch xuống (tính theo số lần cỡ chữ) – dùng cho "trượt lên". */
  offsetY: number
  /** Nhân vào kích thước – dùng cho "phóng to". */
  scale: number
  /** Số ký tự đang hiện (hiệu ứng gõ chữ); null = hiện hết. */
  visibleGraphemes: number | null
}

/** Trạng thái hiệu ứng xuất hiện của clip chữ tại thời điểm t. */
export function textAnimationAt(clip: TextClip, t: Micros): TextAnimationState {
  const none: TextAnimationState = { alpha: 1, offsetY: 0, scale: 1, visibleGraphemes: null }
  if (clip.animationIn === 'none' || clip.animationDuration <= 0) return none
  const raw = Math.min(1, Math.max(0, (t - clip.start) / clip.animationDuration))
  const p = easeOutCubic(raw)
  switch (clip.animationIn) {
    case 'fade':
      return { ...none, alpha: p }
    case 'slide-up':
      return { ...none, alpha: p, offsetY: (1 - p) * 1.2 }
    case 'zoom':
      return { ...none, alpha: p, scale: 0.4 + 0.6 * p }
    case 'typewriter':
      // Gõ chữ đều tay (không dùng easing), làm tròn xuống để ký tự cuối hiện đúng lúc kết thúc
      return { ...none, visibleGraphemes: Math.floor(raw * splitGraphemes(clip.text).length) }
  }
}

/**
 * Số khung hình phải vẽ riêng khi xuất video (0 = chỉ cần 1 ảnh tĩnh).
 * Chữ có keyframe (vị trí, kích thước…) thay đổi suốt clip → vẽ MỌI khung hình.
 */
export function animationFrameCount(clip: TextClip, fps: number): number {
  if (hasKeyframes(clip)) return Math.floor((clip.duration / 1e6) * fps)
  if (clip.animationIn === 'none' || clip.animationDuration <= 0) return 0
  return Math.min(Math.ceil((Math.min(clip.animationDuration, clip.duration) / 1e6) * fps), Math.floor((clip.duration / 1e6) * fps))
}
