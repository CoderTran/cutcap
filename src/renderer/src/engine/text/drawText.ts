// Vẽ một clip chữ lên canvas 2D. Dùng CHUNG cho:
//   - preview (canvas trên màn hình, mỗi khung hình)
//   - xuất video (OffscreenCanvas đúng độ phân giải xuất → ảnh PNG → FFmpeg chồng lên)
// Nhờ vậy chữ trong video xuất ra giống hệt preview: cùng font Windows, cùng dấu tiếng Việt.
import type { TextClip } from '@shared/project/schema'
import type { Micros } from '@shared/project/time'
import { LINE_HEIGHT, cssFont, fontPx, splitGraphemes, textAnimationAt } from '@shared/render/textLayout'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Khung bao của khối chữ (pixel canvas, chưa tính xoay) – dùng để bấm chọn / kéo trên preview. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Vẽ chữ của clip tại thời điểm t lên khung W×H.
 * @returns khung bao khối chữ, hoặc null nếu không có gì để vẽ
 */
export function drawTextClip(ctx: Ctx2D, clip: TextClip, W: number, H: number, t: Micros): Rect | null {
  const { style, transform } = clip
  const anim = textAnimationAt(clip, t)
  const unit = Math.min(W, H) / 1080 // 1 "đơn vị" theo khung 1080p
  const px = fontPx(style, W, H) * transform.scale * anim.scale
  if (px < 0.5 || clip.text.length === 0) return null

  ctx.save()
  ctx.font = cssFont(style, px)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // Bố cục tính theo TOÀN BỘ chữ – hiệu ứng gõ chữ chỉ ẩn bớt ký tự, khối chữ không bị xô lệch
  const fullLines = clip.text.split('\n')
  const widths = fullLines.map((line) => ctx.measureText(line).width)
  const blockW = Math.max(...widths, 1)
  const lineH = px * LINE_HEIGHT
  const blockH = lineH * fullLines.length
  const visibleLines =
    anim.visibleGraphemes === null
      ? fullLines
      : splitGraphemes(clip.text).slice(0, anim.visibleGraphemes).join('').split('\n')

  const cx = transform.x * W
  const cy = transform.y * H + anim.offsetY * px
  const left = -blockW / 2
  const top = -blockH / 2

  ctx.translate(cx, cy)
  ctx.rotate((transform.rotation * Math.PI) / 180)
  ctx.globalAlpha *= transform.opacity * anim.alpha

  // Nền chữ: hình chữ nhật bo góc phía sau
  if (style.backgroundColor) {
    const padX = px * 0.3
    const padY = px * 0.12
    ctx.fillStyle = style.backgroundColor
    ctx.beginPath()
    ctx.roundRect(left - padX, top - padY, blockW + padX * 2, blockH + padY * 2, px * 0.2)
    ctx.fill()
  }

  // Viền chữ: canvas vẽ viền nằm GIỮA đường bao ký tự → nhân đôi để phần lộ ra ngoài đúng bằng strokeWidth
  const stroke = style.strokeColor && style.strokeWidth > 0 ? style.strokeWidth * unit * transform.scale * anim.scale * 2 : 0
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2

  fullLines.forEach((_line, i) => {
    const visible = visibleLines[i] ?? ''
    if (!visible) return
    const x = style.align === 'left' ? left : style.align === 'right' ? left + blockW - widths[i] : -widths[i] / 2
    const y = top + lineH * (i + 0.5)
    if (stroke > 0) {
      ctx.strokeStyle = style.strokeColor!
      ctx.lineWidth = stroke
      ctx.strokeText(visible, x, y)
    }
    ctx.fillStyle = style.color
    ctx.fillText(visible, x, y)
  })
  ctx.restore()

  return { x: cx + left, y: cy + top, w: blockW, h: blockH }
}
