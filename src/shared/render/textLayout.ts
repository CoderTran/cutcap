// Phần tính toán (không vẽ) cho clip chữ: cỡ chữ theo khung hình, số khung hiệu ứng khi xuất.
// Hiệu ứng động (Vào / Ra / Vòng lặp): shared/render/textAnims.ts.
// Phần vẽ thật nằm ở renderer/src/engine/text/drawText.ts (cần canvas của trình duyệt).
import { hasKeyframes } from '../timeline/keyframes'
import { textAnimSpans } from './textAnims'
import type { TextClip, TextStyle } from '../project/schema'

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

/**
 * Số khung hình phải vẽ riêng khi xuất video (0 = chỉ cần 1 ảnh tĩnh).
 * Chữ có keyframe (vị trí, kích thước…) thay đổi suốt clip → vẽ MỌI khung hình.
 */
export function animationFrameCount(clip: TextClip, fps: number): number {
  const all = Math.floor((clip.duration / 1e6) * fps)
  // Có keyframe / hiệu ứng Ra / Vòng lặp → thay đổi suốt clip (hoặc ở cuối) → vẽ MỌI khung hình
  if (hasKeyframes(clip) || clip.textOut || clip.textLoop) return all
  const { inUs } = textAnimSpans(clip)
  if (inUs <= 0) return 0
  return Math.min(Math.ceil((inUs / 1e6) * fps), all)
}
