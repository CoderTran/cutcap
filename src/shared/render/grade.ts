// Điều chỉnh màu (bảng phải → Điều chỉnh): Cơ bản, HSL, Đường cong, Vòng tròn màu – giống CapCut.
//
// Toàn bộ phần MÀU viết một lần ở đây thành hàm gradeColor(r, g, b) → từ đó tạo BẢNG TRA MÀU 3D (LUT):
//   - preview: WebGL tra bảng (renderer/src/engine/grade)
//   - xuất video: FFmpeg lut3d đọc đúng bảng đó (file .cube) → màu xuất ra khớp hệt bản xem trước.
// Phần HIỆU ỨNG theo vùng ảnh (sắc nét, rõ nét, hạt, mờ, viền tối) không tra bảng được → xem gradeSpatial.

export const HSL_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'] as const
export type HslColor = (typeof HSL_COLORS)[number]
/** Màu tâm (độ) của 8 nhóm màu HSL. */
export const HSL_HUES: Record<HslColor, number> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  cyan: 180,
  blue: 225,
  purple: 270,
  magenta: 315
}

/** Thanh của mục Cơ bản. `center` = có cả âm và dương (−100…100); còn lại 0…100. */
export const BASIC_GROUPS = [
  { group: 'color', keys: ['temperature', 'tint', 'saturation'] },
  { group: 'light', keys: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'brilliance'] },
  { group: 'effects', keys: ['sharpen', 'clarity', 'grain', 'blur', 'vignette'] }
] as const
export type BasicKey = (typeof BASIC_GROUPS)[number]['keys'][number]
export const BASIC_KEYS = BASIC_GROUPS.flatMap((g) => g.keys) as BasicKey[]
/** Thanh 0…100 (còn lại −100…100). */
export const ONE_SIDED: BasicKey[] = ['sharpen', 'clarity', 'grain', 'blur']

export interface HslAdjust {
  hue: number
  sat: number
  light: number
}

export interface CurvePoint {
  x: number
  y: number
}
export const CURVE_CHANNELS = ['luma', 'r', 'g', 'b'] as const
export type CurveChannel = (typeof CURVE_CHANNELS)[number]

/** Một vòng tròn màu: r, g, b = độ lệch màu (−1…1), y = độ sáng (thanh cong bên cạnh, −1…1). */
export interface Wheel {
  r: number
  g: number
  b: number
  y: number
}
export const WHEELS = ['shadows', 'midtones', 'highlights', 'offset'] as const
export type WheelKey = (typeof WHEELS)[number]

export interface ColorGrade {
  basic: Record<BasicKey, number>
  /** Bảo vệ màu da: các chỉnh màu (nhiệt độ, tông, bão hòa, HSL) tác động ít lên màu da. */
  skinProtect: boolean
  hsl: Record<HslColor, HslAdjust>
  curves: Record<CurveChannel, CurvePoint[]>
  wheels: Record<WheelKey, Wheel> & { intensity: number }
}

const straight = (): CurvePoint[] => [
  { x: 0, y: 0 },
  { x: 1, y: 1 }
]
const zeroWheel = (): Wheel => ({ r: 0, g: 0, b: 0, y: 0 })

export function emptyGrade(): ColorGrade {
  return {
    basic: Object.fromEntries(BASIC_KEYS.map((k) => [k, 0])) as Record<BasicKey, number>,
    skinProtect: false,
    hsl: Object.fromEntries(HSL_COLORS.map((c) => [c, { hue: 0, sat: 0, light: 0 }])) as Record<HslColor, HslAdjust>,
    curves: { luma: straight(), r: straight(), g: straight(), b: straight() },
    wheels: { shadows: zeroWheel(), midtones: zeroWheel(), highlights: zeroWheel(), offset: zeroWheel(), intensity: 100 }
  }
}

const isStraight = (pts: CurvePoint[]): boolean => pts.every((p) => Math.abs(p.x - p.y) < 1e-6)
const isZeroWheel = (w: Wheel): boolean => !w.r && !w.g && !w.b && !w.y

/** Có chỉnh MÀU gì không (phần tra bảng). */
export function hasColorChanges(g: ColorGrade | null | undefined): boolean {
  if (!g) return false
  return (
    BASIC_KEYS.some((k) => !ONE_SIDED.includes(k) && k !== 'vignette' && g.basic[k] !== 0) ||
    HSL_COLORS.some((c) => g.hsl[c].hue || g.hsl[c].sat || g.hsl[c].light) ||
    CURVE_CHANNELS.some((c) => !isStraight(g.curves[c])) ||
    (g.wheels.intensity > 0 && WHEELS.some((w) => !isZeroWheel(g.wheels[w])))
  )
}

/** Có hiệu ứng theo vùng ảnh không (sắc nét, rõ nét, hạt, mờ, viền mờ dần). */
export function hasSpatialChanges(g: ColorGrade | null | undefined): boolean {
  return !!g && (['sharpen', 'clarity', 'grain', 'blur', 'vignette'] as BasicKey[]).some((k) => g.basic[k] !== 0)
}

export function isGradeEmpty(g: ColorGrade | null | undefined): boolean {
  return !hasColorChanges(g) && !hasSpatialChanges(g)
}

// ───────── Đọc từ file dự án ─────────

const num = (v: unknown, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})

export function parseCurve(v: unknown): CurvePoint[] {
  if (!Array.isArray(v)) return straight()
  const pts = v
    .map((p) => obj(p))
    .filter((p) => typeof p.x === 'number' && typeof p.y === 'number')
    .map((p) => ({ x: num(p.x, 0, 1), y: num(p.y, 0, 1) }))
    .sort((a, b) => a.x - b.x)
  if (pts.length < 2) return straight()
  return pts
}

export function parseGrade(v: unknown): ColorGrade | null {
  if (typeof v !== 'object' || v === null) return null
  const raw = obj(v)
  const g = emptyGrade()
  const basic = obj(raw.basic)
  for (const k of BASIC_KEYS) g.basic[k] = Math.round(num(basic[k], ONE_SIDED.includes(k) ? 0 : -100, 100))
  g.skinProtect = raw.skinProtect === true
  const hsl = obj(raw.hsl)
  for (const c of HSL_COLORS) {
    const h = obj(hsl[c])
    g.hsl[c] = {
      hue: Math.round(num(h.hue, -100, 100)),
      sat: Math.round(num(h.sat, -100, 100)),
      light: Math.round(num(h.light, -100, 100))
    }
  }
  const curves = obj(raw.curves)
  for (const c of CURVE_CHANNELS) g.curves[c] = parseCurve(curves[c])
  const wheels = obj(raw.wheels)
  for (const w of WHEELS) {
    const x = obj(wheels[w])
    g.wheels[w] = { r: num(x.r, -1, 1), g: num(x.g, -1, 1), b: num(x.b, -1, 1), y: num(x.y, -1, 1) }
  }
  g.wheels.intensity = typeof wheels.intensity === 'number' ? Math.round(num(wheels.intensity, 0, 100)) : 100
  return isGradeEmpty(g) && !g.skinProtect ? null : g
}

// ───────── Đường cong (monotone cubic qua các điểm, 0–1) ─────────

/** Bảng 256 giá trị của đường cong (nhanh khi tạo LUT). */
export function curveTable(points: CurvePoint[]): Float32Array {
  const pts = points.length >= 2 ? points : straight()
  const n = pts.length
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push(xs[i + 1] > xs[i] ? (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) : 0)
  const m = new Array<number>(n).fill(0)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const h = a * a + b * b
    if (h > 9) {
      m[i] = (3 / Math.sqrt(h)) * a * d[i]
      m[i + 1] = (3 / Math.sqrt(h)) * b * d[i]
    }
  }
  const out = new Float32Array(256)
  for (let k = 0; k < 256; k++) {
    const x = k / 255
    let y: number
    if (x <= xs[0]) y = ys[0]
    else if (x >= xs[n - 1]) y = ys[n - 1]
    else {
      let i = 0
      while (i < n - 2 && x > xs[i + 1]) i++
      const h = xs[i + 1] - xs[i]
      const t = h > 0 ? (x - xs[i]) / h : 0
      const t2 = t * t
      const t3 = t2 * t
      y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
    }
    out[k] = Math.min(1, Math.max(0, y))
  }
  return out
}

const lookup = (table: Float32Array, v: number): number => {
  const f = Math.min(1, Math.max(0, v)) * 255
  const i = Math.min(254, Math.floor(f))
  return table[i] + (table[i + 1] - table[i]) * (f - i)
}

// ───────── Hàm màu ─────────

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number): number => {
    t = ((t % 1) + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const hh = h / 360
  return [hue(hh + 1 / 3), hue(hh), hue(hh - 1 / 3)]
}

/** Khả năng là màu da (theo sắc độ + độ bão hòa) – cho "Bảo vệ màu da". */
function skinWeight(r: number, g: number, b: number): number {
  const [h, s, l] = rgbToHsl(r, g, b)
  const hueW = smooth(-5, 12, h > 300 ? h - 360 : h) * (1 - smooth(40, 55, h > 300 ? h - 360 : h))
  return hueW * smooth(0.12, 0.25, s) * (1 - smooth(0.75, 0.9, s)) * smooth(0.15, 0.3, l) * (1 - smooth(0.9, 0.98, l))
}

/** Khoảng cách góc màu (độ, 0–180). */
const hueDist = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 360) + 360) % 360
  return d > 180 ? 360 - d : d
}

export interface PreparedGrade {
  grade: ColorGrade
  curves: Record<CurveChannel, Float32Array>
}

export function prepareGrade(grade: ColorGrade): PreparedGrade {
  return {
    grade,
    curves: {
      luma: curveTable(grade.curves.luma),
      r: curveTable(grade.curves.r),
      g: curveTable(grade.curves.g),
      b: curveTable(grade.curves.b)
    }
  }
}

/**
 * Màu sau khi chỉnh (0–1). Thứ tự: phơi sáng → cân bằng trắng → tương phản → vùng sáng/tối → vòng tròn màu
 * → đường cong → HSL → bão hòa. "Bảo vệ màu da": phần chỉnh MÀU giảm 70% trên vùng màu da.
 */
export function gradeColor(p: PreparedGrade, r0: number, g0: number, b0: number): [number, number, number] {
  const { grade } = p
  const B = grade.basic
  const s = (k: BasicKey): number => B[k] / 100
  let r = r0
  let g = g0
  let b = b0

  // Phơi sáng (±1.2 stop)
  if (B.exposure) {
    const k = 2 ** (s('exposure') * 1.2)
    r *= k
    g *= k
    b *= k
  }
  const beforeColor: [number, number, number] = [r, g, b]
  // Nhiệt độ màu (ấm: thêm đỏ/vàng, bớt xanh dương) & tông màu (dương: hồng tím, âm: xanh lá)
  if (B.temperature) {
    const t = s('temperature')
    r *= 1 + 0.16 * t
    g *= 1 + 0.04 * t
    b *= 1 - 0.18 * t
  }
  if (B.tint) {
    const t = s('tint')
    r *= 1 + 0.06 * t
    g *= 1 - 0.14 * t
    b *= 1 + 0.06 * t
  }
  const afterWb: [number, number, number] = [r, g, b]
  // Tương phản quanh mức xám giữa
  if (B.contrast) {
    const k = B.contrast > 0 ? 1 + s('contrast') * 0.9 : 1 + s('contrast') * 0.6
    r = 0.5 + (r - 0.5) * k
    g = 0.5 + (g - 0.5) * k
    b = 0.5 + (b - 0.5) * k
  }
  // Vùng sáng / bóng / sáng nhất / tối nhất / độ chói: cộng độ sáng theo vùng (giữ màu)
  const L = clamp01(luma(r, g, b))
  let dl = 0
  if (B.highlights) dl += s('highlights') * 0.22 * smooth(0.45, 1, L)
  if (B.shadows) dl += s('shadows') * 0.22 * (1 - smooth(0, 0.55, L))
  if (B.whites) dl += s('whites') * 0.15 * smooth(0.7, 1, L)
  if (B.blacks) dl += s('blacks') * 0.15 * (1 - smooth(0, 0.3, L))
  if (B.brilliance) dl += s('brilliance') * 0.35 * L * (1 - L)
  r += dl
  g += dl
  b += dl

  // Vòng tròn màu: tối (lift) / trung bình (gamma) / sáng (gain) / offset; mỗi vòng: màu + độ sáng
  const w = grade.wheels
  if (w.intensity > 0 && WHEELS.some((k) => !isZeroWheel(w[k]))) {
    const k = w.intensity / 100
    const ch = (c: number, key: 'r' | 'g' | 'b'): number => {
      const lift = (w.shadows[key] * 0.6 + w.shadows.y) * 0.25 * k
      const gain = (w.highlights[key] * 0.6 + w.highlights.y) * 0.35 * k
      const gamma = (w.midtones[key] * 0.6 + w.midtones.y) * 0.5 * k
      const offset = (w.offset[key] * 0.6 + w.offset.y) * 0.2 * k
      let v = clamp01(c)
      v = v + lift * (1 - v)
      v = v * (1 + gain)
      v = Math.pow(clamp01(v), 1 / Math.max(0.2, 1 + gamma))
      return v + offset
    }
    r = ch(r, 'r')
    g = ch(g, 'g')
    b = ch(b, 'b')
  }

  // Đường cong: Độ sáng (áp cho cả 3 kênh) rồi từng kênh R, G, B
  r = lookup(p.curves.r, lookup(p.curves.luma, r))
  g = lookup(p.curves.g, lookup(p.curves.luma, g))
  b = lookup(p.curves.b, lookup(p.curves.luma, b))

  // HSL: mỗi nhóm màu đổi sắc độ / bão hòa / độ sáng; ảnh hưởng giảm dần theo khoảng cách sắc độ, xám không đổi
  const hsl = grade.hsl
  if (HSL_COLORS.some((c) => hsl[c].hue || hsl[c].sat || hsl[c].light)) {
    let [h, sat, l] = rgbToHsl(clamp01(r), clamp01(g), clamp01(b))
    let dh = 0
    let ds = 0
    let dL = 0
    for (const c of HSL_COLORS) {
      const a = hsl[c]
      if (!a.hue && !a.sat && !a.light) continue
      const wgt = 1 - smooth(0, 40, hueDist(h, HSL_HUES[c]))
      dh += a.hue * 0.3 * wgt
      ds += (a.sat / 100) * wgt
      dL += (a.light / 100) * wgt
    }
    const satW = smooth(0.02, 0.15, sat)
    h = (h + dh * satW + 360) % 360
    sat = clamp01(sat * (1 + ds * satW))
    l = clamp01(l + dL * 0.25 * satW * (1 - Math.abs(2 * l - 1)))
    ;[r, g, b] = hslToRgb(h, sat, l)
  }

  // Bão hòa
  if (B.saturation) {
    const y = luma(r, g, b)
    const k = 1 + s('saturation')
    r = y + (r - y) * k
    g = y + (g - y) * k
    b = y + (b - y) * k
  }

  // Bảo vệ màu da: kéo phần đổi MÀU (cân bằng trắng, HSL, bão hòa) về lại 70% trên vùng da
  if (grade.skinProtect) {
    const skin = skinWeight(clamp01(beforeColor[0]), clamp01(beforeColor[1]), clamp01(beforeColor[2])) * 0.7
    if (skin > 0) {
      // Giữ độ sáng đã chỉnh, chỉ trả lại tỉ lệ màu gốc
      const y = luma(r, g, b)
      const y0 = Math.max(1e-4, luma(...beforeColor))
      const wbOnly = afterWb.map((c, i) => c - beforeColor[i])
      const base = beforeColor.map((c, i) => (c / y0) * y + wbOnly[i] * 0.3) as [number, number, number]
      r += (base[0] - r) * skin
      g += (base[1] - g) * skin
      b += (base[2] - b) * skin
    }
  }
  return [clamp01(r), clamp01(g), clamp01(b)]
}

// ───────── Bảng tra màu 3D ─────────

export const LUT_SIZE = 33

/** LUT N×N×N (r chạy nhanh nhất, rồi g, rồi b) – thứ tự đúng chuẩn .cube. Giá trị 0–1. */
export function buildLut(grade: ColorGrade, size = LUT_SIZE): Float32Array {
  const p = prepareGrade(grade)
  const out = new Float32Array(size * size * size * 3)
  let i = 0
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const [r, g, b] = gradeColor(p, ri / (size - 1), gi / (size - 1), bi / (size - 1))
        out[i++] = r
        out[i++] = g
        out[i++] = b
      }
    }
  }
  return out
}

/** Nội dung file .cube cho FFmpeg lut3d. */
export function lutToCube(lut: Float32Array, size = LUT_SIZE): string {
  const lines = ['TITLE "Cutcap"', `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1']
  for (let i = 0; i < lut.length; i += 3) lines.push(`${lut[i].toFixed(6)} ${lut[i + 1].toFixed(6)} ${lut[i + 2].toFixed(6)}`)
  return lines.join('\n') + '\n'
}

// ───────── Hiệu ứng theo vùng ảnh (thông số dùng chung cho preview và FFmpeg) ─────────

export interface SpatialParams {
  /** Làm mờ: sigma tính theo chiều cao ảnh (tỉ lệ). */
  blurSigma: number
  /** Làm sắc nét: lượng & bán kính (tỉ lệ chiều cao). */
  sharpenAmount: number
  sharpenSigma: number
  /** Độ rõ nét: tương phản vùng lớn. */
  clarityAmount: number
  claritySigma: number
  /** Hạt nhỏ: độ mạnh nhiễu (0–1 của biên độ). */
  grain: number
  /** Viền mờ dần: góc (rad) của bộ lọc vignette; dương = tối viền, âm = sáng viền. */
  vignette: number
}

export function spatialParams(g: ColorGrade): SpatialParams {
  const B = g.basic
  return {
    blurSigma: (B.blur / 100) * 0.012,
    sharpenAmount: (B.sharpen / 100) * 1.6,
    sharpenSigma: 0.0016,
    clarityAmount: (B.clarity / 100) * 0.7,
    claritySigma: 0.02,
    grain: (B.grain / 100) * 0.12,
    vignette: (B.vignette / 100) * (Math.PI / 3)
  }
}
