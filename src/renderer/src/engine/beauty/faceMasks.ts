// Vẽ "mặt nạ" (vùng áp hiệu ứng) từ 478 điểm khuôn mặt của MediaPipe:
//   skin  – da mặt: trong viền mặt, trừ mắt, lông mày, môi
//   under – quầng dưới mắt
//   teeth – miệng (phần trong môi) – shader chỉ làm trắng điểm sáng, ít màu (răng) trong vùng này
// Mỗi mặt nạ là một canvas xám (trắng = áp đủ), mép làm mờ dần để không thấy đường ranh.
import type { Face, Point } from './faceDetector'

// Chỉ số điểm (bản đồ chuẩn của MediaPipe Face Mesh)
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
  234, 127, 162, 21, 54, 103, 67, 109
]
const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
const BROW_R = [46, 53, 52, 65, 55, 107, 66, 105, 63, 70]
const BROW_L = [276, 283, 282, 295, 285, 336, 296, 334, 293, 300]
/** Mí dưới, từ đuôi mắt vào khóe trong. */
const LOWER_LID_R = [33, 7, 163, 144, 145, 153, 154, 155, 133]
const LOWER_LID_L = [263, 249, 390, 373, 374, 380, 381, 382, 362]

export interface FaceMasks {
  skin: HTMLCanvasElement
  under: HTMLCanvasElement
  teeth: HTMLCanvasElement
}

/** Kích thước khuôn mặt lớn nhất (pixel) – để bán kính làm mịn… tính theo mặt, giống nhau ở mọi độ phân giải. */
export function faceSizePx(faces: Face[], width: number, height: number): number {
  let best = 0
  for (const f of faces) {
    const w = Math.hypot((f[454].x - f[234].x) * width, (f[454].y - f[234].y) * height)
    best = Math.max(best, w)
  }
  return best
}

/** Khoảng cách từ mắt xuống má (tỉ lệ khung hình theo chiều dọc) – shader lấy màu da má làm chuẩn cho quầng thâm. */
export function eyeToCheekOffset(faces: Face[]): number {
  const f = faces[0]
  if (!f) return 0.03
  const eyeW = Math.hypot(f[133].x - f[33].x, f[133].y - f[33].y)
  return eyeW * 0.9
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export class FaceMaskPainter {
  private readonly masks: FaceMasks = { skin: makeCanvas(1, 1), under: makeCanvas(1, 1), teeth: makeCanvas(1, 1) }

  /** Vẽ mặt nạ cỡ w×h (thường bằng nửa khung hình – đủ mịn vì mép đã làm mờ). */
  paint(faces: Face[], w: number, h: number): FaceMasks {
    for (const c of Object.values(this.masks)) {
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
    }
    const skin = this.masks.skin.getContext('2d')!
    const under = this.masks.under.getContext('2d')!
    const teeth = this.masks.teeth.getContext('2d')!
    for (const ctx of [skin, under, teeth]) {
      ctx.globalCompositeOperation = 'source-over'
      ctx.filter = 'none'
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
    }

    for (const f of faces) {
      const px = (i: number): Point => ({ x: f[i].x * w, y: f[i].y * h })
      const faceW = Math.hypot(px(454).x - px(234).x, px(454).y - px(234).y)
      const eyeW = Math.hypot(px(133).x - px(33).x, px(133).y - px(33).y)

      // Da mặt: viền mặt thu vào chút (tránh lấn ra tóc / nền), trừ mắt, lông mày, môi
      skin.filter = `blur(${Math.max(1, faceW * 0.03)}px)`
      fillPolygon(skin, FACE_OVAL.map(px), '#fff', 0.92)
      skin.globalCompositeOperation = 'destination-out'
      skin.filter = `blur(${Math.max(1, faceW * 0.012)}px)`
      for (const part of [EYE_R, EYE_L]) fillPolygon(skin, part.map(px), '#000', 1.75)
      for (const part of [BROW_R, BROW_L]) fillPolygon(skin, part.map(px), '#000', 1.4)
      fillPolygon(skin, LIPS_OUTER.map(px), '#000', 1.08)
      skin.globalCompositeOperation = 'source-over'

      // Quầng dưới mắt: dải từ mí dưới kéo xuống ~0.45 bề rộng mắt
      under.filter = `blur(${Math.max(1, eyeW * 0.18)}px)`
      for (const lid of [LOWER_LID_R, LOWER_LID_L]) {
        const top = lid.map(px).map((p) => ({ x: p.x, y: p.y + eyeW * 0.08 }))
        const bottom = top.map((p) => ({ x: p.x, y: p.y + eyeW * 0.42 })).reverse()
        fillPolygon(under, [...top, ...bottom], '#fff', 1)
      }

      // Răng: phần trong môi
      teeth.filter = `blur(${Math.max(1, eyeW * 0.04)}px)`
      fillPolygon(teeth, LIPS_INNER.map(px), '#fff', 1)
    }
    return this.masks
  }
}

/** Tô đa giác, phóng to/thu nhỏ quanh tâm theo `scale`. */
function fillPolygon(ctx: CanvasRenderingContext2D, pts: Point[], color: string, scale: number): void {
  if (pts.length < 3) return
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  ctx.beginPath()
  pts.forEach((p, i) => {
    const x = cx + (p.x - cx) * scale
    const y = cy + (p.y - cy) * scale
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}
