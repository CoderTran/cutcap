// Hình học khi đặt một lớp hình (video/ảnh) lên khung hình.
// Dùng chung cho preview và (Bước 6) engine xuất video → hai bên đặt hình giống hệt nhau.
import type { ColorAdjust, Transform } from '../project/schema'

export interface Placement {
  /** Tâm lớp hình (pixel trên khung hình). */
  cx: number
  cy: number
  /** Kích thước sau khi co giãn (pixel). */
  width: number
  height: number
  /** Góc xoay (radian). */
  rotation: number
  opacity: number
}

/**
 * Đặt media kích thước (srcW × srcH) vào khung (frameW × frameH).
 * Mặc định "vừa khung" (contain) giống CapCut: hình nằm trọn trong khung, giữ tỉ lệ,
 * thừa thì để viền màu nền. Sau đó áp dụng transform (vị trí, phóng to, xoay, độ mờ).
 */
export function placeLayer(srcW: number, srcH: number, frameW: number, frameH: number, t: Transform): Placement {
  const fit = Math.min(frameW / srcW, frameH / srcH)
  return {
    cx: t.x * frameW,
    cy: t.y * frameH,
    width: srcW * fit * t.scale,
    height: srcH * fit * t.scale,
    rotation: (t.rotation * Math.PI) / 180,
    opacity: t.opacity
  }
}

/**
 * Chuỗi bộ lọc CSS/Canvas cho chỉnh màu cơ bản. Mỗi giá trị −100…100 → hệ số 0…2.
 * @returns "none" nếu không chỉnh gì (để không tốn công xử lý)
 */
export function colorFilter(adjust: ColorAdjust): string {
  const parts: string[] = []
  if (adjust.brightness !== 0) parts.push(`brightness(${1 + adjust.brightness / 100})`)
  if (adjust.contrast !== 0) parts.push(`contrast(${1 + adjust.contrast / 100})`)
  if (adjust.saturation !== 0) parts.push(`saturate(${1 + adjust.saturation / 100})`)
  return parts.length > 0 ? parts.join(' ') : 'none'
}
