// Tốc độ → Uốn cong (giống CapCut): tốc độ thay đổi trong suốt clip (Dựng phim, Anh hùng, Viên đạn…).
//
// Đường cong: các điểm (x, y) – x = vị trí trong ĐOẠN FILE GỐC của clip (0 = đầu, 1 = cuối),
// y = tốc độ (0.1× … 10×). Giữa các điểm nối bằng đường cong mượt KHÔNG vượt quá điểm (monotone cubic)
// theo thang log (giống trục 0.1× – 1× – 10× của CapCut).
//
// Thời gian trên timeline: đi qua đoạn ds của file gốc ở tốc độ v mất ds / v
//   → độ dài clip = (độ dài đoạn gốc) × F, với F = ∫₀¹ dx / v(x).
//
// Cắt / tỉa clip KHÔNG vẽ lại đường cong: mỗi clip giữ "cửa sổ" `range` trên đường cong gốc
// → cắt bao nhiêu lần cũng không lệch (chỉnh lại đường cong thì mới "nướng" cửa sổ thành điểm mới).

export interface SpeedPoint {
  x: number
  y: number
}

export const SPEED_CURVE_PRESETS = ['custom', 'montage', 'hero', 'bullet', 'jumpCut', 'flashIn', 'flashOut'] as const
export type SpeedCurvePreset = (typeof SPEED_CURVE_PRESETS)[number]

export interface SpeedCurve {
  preset: SpeedCurvePreset
  points: SpeedPoint[]
  /** Phần đường cong clip này dùng (0–1, sau khi cắt / tỉa). Mặc định [0, 1]. */
  range: [number, number]
}

export const MIN_CURVE_SPEED = 0.1
export const MAX_CURVE_SPEED = 10

/** Hình dạng các mẫu (theo ảnh CapCut). */
const PRESET_POINTS: Record<SpeedCurvePreset, [number, number][]> = {
  custom: [
    [0, 1],
    [0.25, 1],
    [0.5, 1],
    [0.75, 1],
    [1, 1]
  ],
  montage: [
    [0, 1],
    [0.12, 1],
    [0.48, 5],
    [0.68, 0.2],
    [0.85, 1],
    [1, 1]
  ],
  hero: [
    [0, 1],
    [0.33, 5],
    [0.43, 0.3],
    [0.55, 0.3],
    [0.65, 5],
    [1, 1]
  ],
  bullet: [
    [0, 5],
    [0.38, 5],
    [0.46, 0.3],
    [0.54, 0.3],
    [0.62, 5],
    [1, 5]
  ],
  jumpCut: [
    [0, 1],
    [0.38, 1],
    [0.5, 5],
    [0.62, 1],
    [1, 1]
  ],
  flashIn: [
    [0, 5],
    [0.35, 5],
    [0.65, 1],
    [1, 1]
  ],
  flashOut: [
    [0, 1],
    [0.35, 1],
    [0.65, 5],
    [1, 5]
  ]
}

export function presetCurve(preset: SpeedCurvePreset): SpeedCurve {
  return { preset, points: PRESET_POINTS[preset].map(([x, y]) => ({ x, y })), range: [0, 1] }
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))
export const clampCurveSpeed = (v: number): number => clamp(v, MIN_CURVE_SPEED, MAX_CURVE_SPEED)

/** Chuẩn hóa: sắp theo x, điểm đầu x = 0, điểm cuối x = 1, tốc độ trong khoảng cho phép, ít nhất 2 điểm. */
export function normalizePoints(points: SpeedPoint[]): SpeedPoint[] {
  const pts = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: clamp(p.x, 0, 1), y: clampCurveSpeed(p.y) }))
    .sort((a, b) => a.x - b.x)
  if (pts.length < 2)
    return [
      { x: 0, y: pts[0]?.y ?? 1 },
      { x: 1, y: pts[0]?.y ?? 1 }
    ]
  pts[0].x = 0
  pts[pts.length - 1].x = 1
  return pts
}

// ───────── Nội suy (monotone cubic Hermite – Fritsch–Carlson) trên log(tốc độ) ─────────

interface Spline {
  xs: number[]
  ys: number[]
  ms: number[]
}

const splineCache = new WeakMap<SpeedPoint[], Spline>()

function spline(points: SpeedPoint[]): Spline {
  let s = splineCache.get(points)
  if (s) return s
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => Math.log(clampCurveSpeed(p.y)))
  const n = xs.length
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push(xs[i + 1] > xs[i] ? (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) : 0)
  const ms = new Array<number>(n).fill(0)
  ms[0] = d[0] ?? 0
  ms[n - 1] = d[n - 2] ?? 0
  for (let i = 1; i < n - 1; i++) ms[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  // Giới hạn độ dốc để không vượt (không có "gợn" vượt quá điểm)
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      ms[i] = 0
      ms[i + 1] = 0
      continue
    }
    const a = ms[i] / d[i]
    const b = ms[i + 1] / d[i]
    const h = a * a + b * b
    if (h > 9) {
      const t = 3 / Math.sqrt(h)
      ms[i] = t * a * d[i]
      ms[i + 1] = t * b * d[i]
    }
  }
  s = { xs, ys, ms }
  splineCache.set(points, s)
  return s
}

/** Tốc độ tại vị trí x (0–1) của đường cong GỐC (bỏ qua range). */
export function speedAtPoint(points: SpeedPoint[], x: number): number {
  const { xs, ys, ms } = spline(points)
  const n = xs.length
  if (x <= xs[0]) return Math.exp(ys[0])
  if (x >= xs[n - 1]) return Math.exp(ys[n - 1])
  let i = 0
  while (i < n - 2 && x > xs[i + 1]) i++
  const h = xs[i + 1] - xs[i]
  if (h <= 0) return Math.exp(ys[i + 1])
  const t = (x - xs[i]) / h
  const t2 = t * t
  const t3 = t2 * t
  const y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * ms[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * ms[i + 1]
  return clampCurveSpeed(Math.exp(y))
}

/** Tốc độ tại vị trí cục bộ x (0–1) trong CỬA SỔ của clip. */
export function curveSpeedAt(curve: SpeedCurve, x: number): number {
  const [a, b] = curve.range
  return speedAtPoint(curve.points, a + clamp(x, 0, 1) * (b - a))
}

// ───────── Bảng tích lũy thời gian ─────────

const SAMPLES = 512

interface Table {
  /** c[i] = ∫₀^(i/N) dx / v  (x cục bộ trong cửa sổ) */
  c: Float64Array
}

const tableCache = new WeakMap<SpeedCurve, Table>()

function table(curve: SpeedCurve): Table {
  let t = tableCache.get(curve)
  if (t) return t
  const c = new Float64Array(SAMPLES + 1)
  const inv = (i: number): number => 1 / curveSpeedAt(curve, i / SAMPLES)
  for (let i = 1; i <= SAMPLES; i++) {
    // Simpson trên từng ô nhỏ (điểm giữa) → sai số rất nhỏ
    const mid = 1 / curveSpeedAt(curve, (i - 0.5) / SAMPLES)
    c[i] = c[i - 1] + (inv(i - 1) + 4 * mid + inv(i)) / (6 * SAMPLES)
  }
  t = { c }
  tableCache.set(curve, t)
  return t
}

/** F = (độ dài trên timeline) / (độ dài đoạn file gốc). Tốc độ 1× khắp nơi → 1; nhanh gấp đôi → 0.5. */
export function curveFactor(curve: SpeedCurve): number {
  return table(curve).c[SAMPLES]
}

/** Vị trí trong đoạn gốc x (0–1) → tỉ lệ thời gian timeline đã trôi (0–1). */
export function timeFracAt(curve: SpeedCurve, x: number): number {
  const { c } = table(curve)
  const f = clamp(x, 0, 1) * SAMPLES
  const i = Math.min(SAMPLES - 1, Math.floor(f))
  return (c[i] + (c[i + 1] - c[i]) * (f - i)) / c[SAMPLES]
}

/** Tỉ lệ thời gian timeline (0–1) → vị trí trong đoạn gốc (0–1). */
export function sourceFracAt(curve: SpeedCurve, u: number): number {
  const { c } = table(curve)
  const target = clamp(u, 0, 1) * c[SAMPLES]
  let lo = 0
  let hi = SAMPLES
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (c[m] <= target) lo = m
    else hi = m
  }
  const span = c[hi] - c[lo]
  return (lo + (span > 0 ? (target - c[lo]) / span : 0)) / SAMPLES
}

/** Chia đoạn gốc thành `count` khúc, mỗi khúc một tốc độ trung bình (để xuất bằng FFmpeg). */
export function curveSegments(curve: SpeedCurve, count: number): { x0: number; x1: number; speed: number }[] {
  const out: { x0: number; x1: number; speed: number }[] = []
  for (let k = 0; k < count; k++) {
    const x0 = k / count
    const x1 = (k + 1) / count
    const dt = (timeFracAt(curve, x1) - timeFracAt(curve, x0)) * curveFactor(curve)
    out.push({ x0, x1, speed: dt > 0 ? (x1 - x0) / dt : 1 })
  }
  return out
}

/** Phần [a, b] (cục bộ) của đường cong – cắt / tỉa clip. */
export function subCurve(curve: SpeedCurve, a: number, b: number): SpeedCurve {
  const [r0, r1] = curve.range
  const w = r1 - r0
  return { ...curve, range: [r0 + clamp(a, 0, 1) * w, r0 + clamp(b, 0, 1) * w] }
}

/**
 * "Nướng" cửa sổ thành đường cong đầy đủ (khi người dùng chỉnh điểm trên clip đã cắt):
 * lấy các điểm nằm trong cửa sổ + 2 đầu mút, đổi x về 0–1.
 */
export function bakeCurve(curve: SpeedCurve): SpeedCurve {
  const [a, b] = curve.range
  if (a === 0 && b === 1) return curve
  const inside = curve.points.filter((p) => p.x > a && p.x < b).map((p) => ({ x: (p.x - a) / (b - a), y: p.y }))
  const points = [{ x: 0, y: speedAtPoint(curve.points, a) }, ...inside, { x: 1, y: speedAtPoint(curve.points, b) }]
  return { preset: 'custom', points, range: [0, 1] }
}

/** Đọc từ file dự án: hỏng → null. */
export function parseSpeedCurve(v: unknown): SpeedCurve | null {
  if (typeof v !== 'object' || v === null) return null
  const raw = v as Record<string, unknown>
  if (!Array.isArray(raw.points)) return null
  const points = normalizePoints(
    raw.points.filter((p): p is SpeedPoint => typeof p === 'object' && p !== null && typeof p.x === 'number' && typeof p.y === 'number')
  )
  const preset = (SPEED_CURVE_PRESETS as readonly string[]).includes(raw.preset as string) ? (raw.preset as SpeedCurvePreset) : 'custom'
  let range: [number, number] = [0, 1]
  if (Array.isArray(raw.range) && raw.range.length === 2 && raw.range.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    const a = clamp(raw.range[0] as number, 0, 1)
    const b = clamp(raw.range[1] as number, 0, 1)
    if (b - a > 1e-6) range = [a, b]
  }
  return { preset, points, range }
}
