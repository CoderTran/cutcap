// Điều chỉnh → Mặt nạ (giống CapCut): chỉ giữ một vùng của clip, phần còn lại trong suốt (lộ track bên dưới).
// Toạ độ tính theo KHUNG HÌNH CỦA CLIP (0–1) → mặt nạ đi theo clip khi di chuyển / thu phóng / xoay.
// Vẽ mặt nạ: renderer/src/engine/mask/drawMask.ts – dùng chung cho preview và ảnh mặt nạ lúc xuất.

export const MASK_SHAPES = ['linear', 'mirror', 'circle', 'rect'] as const
export type MaskShape = (typeof MASK_SHAPES)[number]
/** Có trong CapCut nhưng chưa làm (hiện mờ). */
export const MASK_SHAPES_SOON = ['text', 'brush', 'pen'] as const

export interface ClipMask {
  shape: MaskShape
  /** Tâm (0–1 theo khung hình của clip). */
  x: number
  y: number
  /** Góc xoay (độ). */
  rotation: number
  /** Kích thước (tỉ lệ theo cạnh NGẮN của khung): hình tròn / chữ nhật = rộng & cao; cuộn phim = bề dày dải. */
  width: number
  height: number
  /** Lông vũ: độ mờ mép (0–100). */
  feather: number
  /** Bo góc của hình chữ nhật (0–100). */
  roundness: number
  /** Đảo ngược: giữ phần BÊN NGOÀI. */
  invert: boolean
}

export function defaultMask(shape: MaskShape): ClipMask {
  return {
    shape,
    x: 0.5,
    y: 0.5,
    rotation: 0,
    width: shape === 'mirror' ? 0.4 : 0.6,
    height: 0.6,
    feather: shape === 'linear' || shape === 'mirror' ? 10 : 0,
    roundness: 0,
    invert: false
  }
}

const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

export function parseMask(v: unknown): ClipMask | null {
  if (typeof v !== 'object' || v === null) return null
  const r = v as Record<string, unknown>
  if (!(MASK_SHAPES as readonly string[]).includes(r.shape as string)) return null
  const d = defaultMask(r.shape as MaskShape)
  return {
    shape: d.shape,
    x: num(r.x, -0.5, 1.5, d.x),
    y: num(r.y, -0.5, 1.5, d.y),
    rotation: num(r.rotation, -360, 360, 0),
    width: num(r.width, 0.01, 3, d.width),
    height: num(r.height, 0.01, 3, d.height),
    feather: num(r.feather, 0, 100, d.feather),
    roundness: num(r.roundness, 0, 100, 0),
    invert: r.invert === true
  }
}

/** Độ mờ mép (pixel) cho khung w×h. */
export function featherPx(mask: ClipMask, w: number, h: number): number {
  return (mask.feather / 100) * 0.15 * Math.min(w, h)
}
