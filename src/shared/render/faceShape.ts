// Làm đẹp → Khuôn mặt (giống CapCut): thon gọn, V-line, cằm, gò má, chân tóc…
//
// Mỗi thanh trượt "đẩy" một nhóm điểm trên khuôn mặt (478 điểm của MediaPipe) – kiểu công cụ Liquify:
// điểm ở tâm dịch đúng một đoạn, xung quanh dịch ít dần theo hình chuông (Gauss) → biến dạng mượt, không gãy.
// Độ dịch & bán kính tính theo CỠ KHUÔN MẶT (giống nhau ở mọi độ phân giải); hướng tính theo TRỤC KHUÔN MẶT
// (mặt nghiêng / cúi vẫn đúng). Shader (renderer/src/engine/beauty) cộng các lực đẩy rồi lấy mẫu ngược.

/** Thanh trượt; `bipolar` = có cả âm và dương (−100…100, giữa là 0), còn lại 0…100. */
export const FACE_SHAPE_SLIDERS = [
  { key: 'slim', bipolar: false },
  { key: 'thin', bipolar: true },
  { key: 'width', bipolar: true },
  { key: 'jaw', bipolar: false },
  { key: 'cheekbone', bipolar: false },
  { key: 'shorten', bipolar: false },
  { key: 'vline', bipolar: false },
  { key: 'chin', bipolar: true },
  { key: 'lower', bipolar: true },
  { key: 'middle', bipolar: true },
  { key: 'upper', bipolar: true },
  { key: 'hairline', bipolar: true }
] as const

export type FaceShapeKey = (typeof FACE_SHAPE_SLIDERS)[number]['key']
export type FaceShape = Record<FaceShapeKey, number>
export const FACE_SHAPE_KEYS = FACE_SHAPE_SLIDERS.map((s) => s.key) as FaceShapeKey[]

export function emptyFaceShape(): FaceShape {
  return Object.fromEntries(FACE_SHAPE_KEYS.map((k) => [k, 0])) as FaceShape
}

export function isFaceShapeEmpty(s: FaceShape | null | undefined): boolean {
  return !s || FACE_SHAPE_KEYS.every((k) => !s[k])
}

export function faceShapeMin(key: FaceShapeKey): number {
  return FACE_SHAPE_SLIDERS.find((s) => s.key === key)!.bipolar ? -100 : 0
}

/** Đọc từ file dự án: kẹp đúng khoảng; thiếu / hỏng / toàn 0 → null. */
export function parseFaceShape(v: unknown): FaceShape | null {
  if (typeof v !== 'object' || v === null) return null
  const raw = v as Record<string, unknown>
  const s = emptyFaceShape()
  for (const k of FACE_SHAPE_KEYS) {
    const n = raw[k]
    s[k] = typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(faceShapeMin(k), Math.round(n))) : 0
  }
  return isFaceShapeEmpty(s) ? null : s
}

// ───────── Lực đẩy ─────────

export interface Vec {
  x: number
  y: number
}

/** Một lực đẩy (pixel): điểm ở (x, y) dịch đi (dx, dy); ảnh hưởng giảm dần, gần như hết ở khoảng cách ~2·r. */
export interface WarpPush {
  x: number
  y: number
  r: number
  dx: number
  dy: number
  /** Trọng số khi lấy trung bình (điểm neo nặng hơn để giữ chặt miệng / mắt). Mặc định 1. */
  weight?: number
}

/** Trọng số của điểm neo so với lực đẩy thường. */
const ANCHOR_WEIGHT = 3

/** Shader nhận tối đa bấy nhiêu lực đẩy (giới hạn uniform của WebGL). */
export const MAX_PUSHES = 100

// Chỉ số điểm MediaPipe (bên phải ẢNH = bên trái người trong ảnh)
const JAW_L = [93, 132, 58, 172, 136, 150, 149, 176] // từ ngang tai xuống gần cằm (bên trái ảnh)
const JAW_R = [323, 361, 288, 397, 365, 379, 378, 400]
const TEMPLE_L = [127, 162, 21, 54]
const TEMPLE_R = [356, 389, 251, 284]
const CHIN = [152, 148, 377, 176, 400]
const FOREHEAD = [10, 109, 338, 67, 297]
const CHEEKBONE = [116, 345, 234, 454]
/** Điểm neo (lực = 0): giữ nguyên miệng, mũi, mắt khi kéo hàm / má bên cạnh. */
const ANCHORS = [61, 291, 0, 17, 13, 14, 1, 33, 133, 263, 362]

/**
 * Các lực đẩy cho một khuôn mặt.
 * @param face 478 điểm, toạ độ PIXEL
 */
export function faceWarpPushes(face: Vec[], shape: FaceShape): WarpPush[] {
  const p = (i: number): Vec => face[i]
  // Trục khuôn mặt: ngang = từ má trái sang má phải, dọc = vuông góc, hướng xuống cằm
  const left = p(234)
  const right = p(454)
  const W = Math.hypot(right.x - left.x, right.y - left.y)
  if (!(W > 4)) return []
  const u = { x: (right.x - left.x) / W, y: (right.y - left.y) / W }
  let v = { x: -u.y, y: u.x }
  if ((p(152).x - p(10).x) * v.x + (p(152).y - p(10).y) * v.y < 0) v = { x: -v.x, y: -v.y }
  const H = Math.abs((p(152).x - p(10).x) * v.x + (p(152).y - p(10).y) * v.y) || W * 1.3
  // Đường giữa mặt: qua sống mũi (168) theo trục dọc
  const mid = p(168)
  /** Hướng từ điểm vào đường giữa (theo trục ngang). */
  const inward = (q: Vec): Vec => {
    const side = (q.x - mid.x) * u.x + (q.y - mid.y) * u.y
    return side >= 0 ? { x: -u.x, y: -u.y } : { x: u.x, y: u.y }
  }
  // Gộp các lực trên cùng một điểm (nhiều thanh trượt cùng đẩy hàm…): cộng độ dịch, bán kính lấy trung bình
  // theo độ mạnh → mỗi mặt ~40 lực, vừa giới hạn của shader
  const byPoint = new Map<number, { dx: number; dy: number; rw: number; w: number }>()
  const push = (i: number, dir: Vec, amount: number, radius: number): void => {
    if (!amount) return
    const m = Math.abs(amount)
    const e = byPoint.get(i) ?? { dx: 0, dy: 0, rw: 0, w: 0 }
    e.dx += dir.x * amount * W
    e.dy += dir.y * amount * W
    e.rw += radius * W * m
    e.w += m
    byPoint.set(i, e)
  }
  const a = (k: FaceShapeKey): number => shape[k] / 100
  const down = v
  const up = { x: -v.x, y: -v.y }
  const hv = H / W // độ dịch dọc tính theo chiều cao mặt

  // Làm thon gọn mặt: hai bên má dưới & hàm vào trong (mạnh dần về phía hàm)
  ;[...JAW_L, ...JAW_R].forEach((i, n) => {
    const k = n % JAW_L.length
    push(i, inward(p(i)), a('slim') * 0.05 * (0.6 + 0.5 * Math.sin((k / (JAW_L.length - 1)) * Math.PI)), 0.15)
  })
  // Thon thả: cả khuôn mặt (thái dương → hàm) hẹp lại / rộng ra
  ;[...TEMPLE_L, ...TEMPLE_R, ...JAW_L, ...JAW_R].forEach((i) => push(i, inward(p(i)), a('thin') * 0.035, 0.2))
  // Chiều rộng: ngang tầm má
  ;[234, 454, 93, 323, 127, 356].forEach((i) => push(i, inward(p(i)), a('width') * 0.05, 0.2))
  // Hàm: góc hàm vào trong, hơi nâng lên
  ;[172, 136, 397, 365].forEach((i) => {
    const d = inward(p(i))
    push(i, { x: d.x * 0.9 + up.x * 0.3, y: d.y * 0.9 + up.y * 0.3 }, a('jaw') * 0.06, 0.14)
  })
  // Xương gò má: thu gò má vào
  CHEEKBONE.forEach((i) => push(i, inward(p(i)), a('cheekbone') * 0.045, 0.14))
  // Rút ngắn: cằm & hàm dưới kéo lên
  CHIN.forEach((i) => push(i, up, a('shorten') * 0.06 * hv, 0.22))
  // Mặt V-line: hàm dưới thu vào, mạnh nhất gần cằm → hình chữ V
  const vWeights = [0, 0, 0.3, 0.6, 0.9, 1, 0.9, 0.6]
  ;[...JAW_L, ...JAW_R].forEach((i, n) => push(i, inward(p(i)), a('vline') * 0.06 * vWeights[n % JAW_L.length], 0.13))
  // Cằm: dài ra (dương) / ngắn lại (âm)
  CHIN.forEach((i) => push(i, down, a('chin') * 0.045 * hv, 0.12))
  // Phần dưới (miệng → cằm): kéo dài / thu ngắn cả vùng dưới
  ;[17, ...CHIN].forEach((i) => push(i, down, a('lower') * 0.04 * hv, 0.24))
  // Phần giữa (mũi → miệng): miệng và phần dưới dịch xuống / lên
  ;[0, 13, 14, 17, 61, 291].forEach((i) => push(i, down, a('middle') * 0.035 * hv, 0.22))
  // Phần trên (lông mày → trán): trán cao lên / thấp xuống
  FOREHEAD.forEach((i) => push(i, up, a('upper') * 0.045 * hv, 0.26))
  // Chân tóc: chỉ mép trán trên
  FOREHEAD.forEach((i) => push(i, up, a('hairline') * 0.04 * hv, 0.18))

  const out: WarpPush[] = []
  for (const [i, e] of byPoint) {
    if (Math.hypot(e.dx, e.dy) < 0.01) continue // các thanh triệt tiêu nhau
    out.push({ x: p(i).x, y: p(i).y, r: e.rw / e.w, dx: e.dx, dy: e.dy })
  }
  if (out.length === 0) return out
  // Neo những bộ phận không bị đẩy (lực trung bình quanh đó kéo về 0 → miệng / mắt không bị bóp méo)
  for (const i of ANCHORS) if (!byPoint.has(i)) out.push({ x: p(i).x, y: p(i).y, r: 0.07 * W, dx: 0, dy: 0, weight: ANCHOR_WEIGHT })
  return out
}

/** Lực đẩy cho mọi khuôn mặt (mặt lớn trước), tối đa MAX_PUSHES – không cắt nửa chừng một khuôn mặt. */
export function warpPushes(faces: Vec[][], shape: FaceShape): WarpPush[] {
  const size = (f: Vec[]): number => Math.hypot(f[454].x - f[234].x, f[454].y - f[234].y)
  const out: WarpPush[] = []
  for (const f of [...faces].sort((a, b) => size(b) - size(a))) {
    const pushes = faceWarpPushes(f, shape)
    if (out.length + pushes.length > MAX_PUSHES) break
    out.push(...pushes)
  }
  return out
}

/**
 * Điểm ảnh ĐẦU RA tại p lấy màu từ điểm nào của ảnh gốc (lấy mẫu ngược – cùng công thức với shader).
 * Các lực chồng nhau được lấy TRUNG BÌNH có trọng số (không cộng dồn – đường hàm có 8 điểm cùng đẩy
 * mà cộng dồn sẽ méo gấp nhiều lần); xa mọi lực thì độ dịch giảm dần về 0.
 */
export function warpSource(p: Vec, pushes: WarpPush[]): Vec {
  let sx = 0
  let sy = 0
  let weight = 0
  for (const q of pushes) {
    const d2 = (p.x - q.x) ** 2 + (p.y - q.y) ** 2
    const w = (q.weight ?? 1) * Math.exp(-d2 / (q.r * q.r))
    sx += q.dx * w
    sy += q.dy * w
    weight += w
  }
  const k = Math.max(1, weight)
  return { x: p.x - sx / k, y: p.y - sy / k }
}
