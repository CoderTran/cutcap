// Chỉnh màu & bộ lọc màu – một định nghĩa, hai nơi dùng (preview và xuất video) cho ra CÙNG màu.
//
// Mọi chỉnh màu được ghép từ các "phép màu" (ColorOp) của chuẩn CSS Filter Effects, mỗi phép có
// công thức toán học chính xác:
//   brightness(b):  v' = v × b                          (từng kênh)
//   contrast(c):    v' = (v − 0,5) × c + 0,5            (từng kênh)
//   saturate / grayscale / sepia / hue-rotate:  nhân ma trận màu 3×3
// Sau mỗi phép, giá trị bị kẹp trong [0, 1].
//   - Preview: chuỗi bộ lọc CSS cho canvas, ví dụ "sepia(0.3) saturate(1.2)"
//   - FFmpeg:  phép từng kênh → lutrgb (tra bảng),  phép ma trận → colorchannelmixer
import type { ColorAdjust } from '../project/schema'

export type ColorOp =
  | { type: 'brightness'; value: number }
  | { type: 'contrast'; value: number }
  | { type: 'saturate'; value: number }
  | { type: 'grayscale'; value: number }
  | { type: 'sepia'; value: number }
  | { type: 'hueRotate'; degrees: number }

/** Giá trị "không đổi gì" của từng phép (dùng để pha theo cường độ bộ lọc). */
function identityOf(op: ColorOp): number {
  return op.type === 'brightness' || op.type === 'contrast' || op.type === 'saturate' ? 1 : 0
}

function isIdentity(op: ColorOp): boolean {
  return op.type === 'hueRotate' ? op.degrees === 0 : op.value === identityOf(op)
}

/** Pha phép màu theo cường độ k (0 = không có tác dụng, 1 = đầy đủ). */
export function scaleOp(op: ColorOp, k: number): ColorOp {
  if (op.type === 'hueRotate') return { type: 'hueRotate', degrees: op.degrees * k }
  const id = identityOf(op)
  return { ...op, value: id + (op.value - id) * k }
}

/** Thanh trượt −100…100 của người dùng → các phép màu (thứ tự: sáng → tương phản → bão hòa). */
export function adjustOps(a: ColorAdjust): ColorOp[] {
  return [
    { type: 'brightness', value: 1 + a.brightness / 100 },
    { type: 'contrast', value: 1 + a.contrast / 100 },
    { type: 'saturate', value: 1 + a.saturation / 100 }
  ]
}

/** Hệ số từ giá trị thanh trượt −100…100 → 0…2 (giữ lại cho mã cũ). */
export function adjustFactors(a: ColorAdjust): { brightness: number; contrast: number; saturation: number } {
  return { brightness: 1 + a.brightness / 100, contrast: 1 + a.contrast / 100, saturation: 1 + a.saturation / 100 }
}

// ───────── Ma trận 3×3 theo chuẩn CSS (hàng = kênh ra R', G', B'; cột = kênh vào R, G, B) ─────────

export function saturateMatrix(s: number): number[][] {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]
  ]
}

export function grayscaleMatrix(amount: number): number[][] {
  const a = 1 - Math.min(1, Math.max(0, amount))
  return [
    [0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a],
    [0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a],
    [0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a]
  ]
}

export function sepiaMatrix(amount: number): number[][] {
  const a = 1 - Math.min(1, Math.max(0, amount))
  return [
    [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a],
    [0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a],
    [0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a]
  ]
}

export function hueRotateMatrix(degrees: number): number[][] {
  const r = (degrees * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]
  ]
}

function matrixOf(op: ColorOp): number[][] | null {
  switch (op.type) {
    case 'saturate':
      return saturateMatrix(op.value)
    case 'grayscale':
      return grayscaleMatrix(op.value)
    case 'sepia':
      return sepiaMatrix(op.value)
    case 'hueRotate':
      return hueRotateMatrix(op.degrees)
    default:
      return null
  }
}

const num = (n: number): string => Number(n.toFixed(5)).toString()

// ───────── Xuất ra 2 "ngôn ngữ" ─────────

/** Chuỗi bộ lọc CSS/Canvas. "none" nếu không có gì. */
export function cssFilterFromOps(ops: ColorOp[]): string {
  const parts = ops
    .filter((op) => !isIdentity(op))
    .map((op) => {
      switch (op.type) {
        case 'brightness':
          return `brightness(${num(op.value)})`
        case 'contrast':
          return `contrast(${num(op.value)})`
        case 'saturate':
          return `saturate(${num(op.value)})`
        case 'grayscale':
          return `grayscale(${num(op.value)})`
        case 'sepia':
          return `sepia(${num(op.value)})`
        case 'hueRotate':
          return `hue-rotate(${num(op.degrees)}deg)`
      }
    })
  return parts.length > 0 ? parts.join(' ') : 'none'
}

/** Bộ lọc FFmpeg tương ứng (đầu vào phải là RGB/RGBA). [] nếu không có gì. */
export function ffmpegFiltersFromOps(ops: ColorOp[]): string[] {
  const filters: string[] = []
  for (const op of ops) {
    if (isIdentity(op)) continue
    if (op.type === 'brightness' || op.type === 'contrast') {
      // val là giá trị kênh 0…255; clip() kẹp như CSS
      const expr =
        op.type === 'brightness'
          ? `clip(val*${num(op.value)},0,255)`
          : `clip((val-127.5)*${num(op.value)}+127.5,0,255)`
      filters.push(`lutrgb=r='${expr}':g='${expr}':b='${expr}'`)
      continue
    }
    const m = matrixOf(op)!
    const names = ['r', 'g', 'b']
    const parts = m.flatMap((row, i) => row.map((v, j) => `${names[i]}${names[j]}=${num(v)}`))
    filters.push(`colorchannelmixer=${parts.join(':')}`)
  }
  return filters
}

/** Bộ lọc FFmpeg cho chỉnh màu cơ bản (giữ lại cho mã cũ / test). */
export function ffmpegColorFilters(a: ColorAdjust): string[] {
  return ffmpegFiltersFromOps(adjustOps(a))
}
