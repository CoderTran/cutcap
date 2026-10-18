// Chuyển cảnh "làm méo điểm ảnh" (gợn sóng, sóng sọc, khảm ô, xoáy, xé…): mỗi clip trong chuyển cảnh được
// biến đổi từng điểm ảnh theo tiến độ p (0 → 1, mối cắt ở p = 0.5).
//
// Công thức viết MỘT lần bằng bộ dựng biểu thức bên dưới, rồi sinh ra:
//   - mã GLSL cho khung Xem trước (WebGL – renderer/engine/transition/PixelTransitionRenderer.ts)
//   - biểu thức FFmpeg `geq` cho lúc xuất video (main/export/graphBuilder.ts)
// → khung Xem trước và video xuất ra luôn giống nhau.
//
// Toạ độ chuẩn hoá: u (trái → phải), v (trên → dưới) trong [0, 1]; aspect = rộng / cao.

/** Một biểu thức, mang sẵn 2 cách viết: GLSL (g) và FFmpeg (f). */
export class Ex {
  constructor(
    readonly g: string,
    readonly f: string
  ) {}
}
type In = Ex | number
const fmt = (n: number): string => {
  const s = Number.isInteger(n) ? `${n}.0` : String(n)
  return n < 0 ? `(${s})` : s
}
const ex = (v: In): Ex => (v instanceof Ex ? v : new Ex(fmt(v), n2f(v)))
const n2f = (n: number): string => (n < 0 ? `(${n})` : String(n))
const bin = (op: string) => (a: In, b: In): Ex => new Ex(`(${ex(a).g}${op}${ex(b).g})`, `(${ex(a).f}${op}${ex(b).f})`)
export const add = bin('+')
export const sub = bin('-')
export const mul = bin('*')
export const div = bin('/')
const fn1 = (g: string, f: string) => (a: In): Ex => new Ex(`${g}(${ex(a).g})`, `${f}(${ex(a).f})`)
export const sin = fn1('sin', 'sin')
export const cos = fn1('cos', 'cos')
export const abs = fn1('abs', 'abs')
export const sqrt = fn1('sqrt', 'sqrt')
export const floor = fn1('floor', 'floor')
export const max = (a: In, b: In): Ex => new Ex(`max(${ex(a).g},${ex(b).g})`, `max(${ex(a).f},${ex(b).f})`)
export const min = (a: In, b: In): Ex => new Ex(`min(${ex(a).g},${ex(b).g})`, `min(${ex(a).f},${ex(b).f})`)
export const clamp01 = (a: In): Ex => new Ex(`clamp(${ex(a).g},0.0,1.0)`, `clip(${ex(a).f},0,1)`)
/** smoothstep(a, b, x) – viết tay (FFmpeg không có sẵn). */
export const sstep = (a: number, b: number, x: In): Ex => {
  const t = clamp01(div(sub(x, a), b - a))
  return mul(mul(t, t), sub(3, mul(2, t)))
}
export const fract = (a: In): Ex => sub(a, floor(a))

/** Biến dùng trong công thức. */
export const U = new Ex('uv.x', 'ld(7)')
export const V = new Ex('uv.y', 'ld(8)')
export const P = new Ex('uP', 'ld(9)')
export const ASPECT = new Ex('uAspect', '(W/H)')

/**
 * Biến tạm: tính 1 lần, dùng nhiều lần (GLSL: biến float; FFmpeg: ô nhớ st()/ld() 0–6).
 * Trả về Ex trỏ tới biến đó.
 */
export class Lets {
  readonly list: { name: string; slot: number; value: Ex }[] = []
  let(value: Ex): Ex {
    const slot = this.list.length
    if (slot > 6) throw new Error('quá nhiều biến tạm')
    const name = `t${slot}`
    this.list.push({ name, slot, value })
    return new Ex(name, `ld(${slot})`)
  }
}

export type PxRole = 'in' | 'out'

/** Kết quả một công thức: toạ độ lấy mẫu + các chỉnh màu / độ mờ. */
export interface PxRecipe {
  lets: Lets
  /** Toạ độ lấy mẫu (chuẩn hoá). Ngoài [0, 1] → trong suốt. */
  qu: Ex
  qv: Ex
  /** Lệch màu: kênh đỏ lấy mẫu tại qu + chroma, kênh xanh dương tại qu − chroma. */
  chroma?: Ex
  /** Nhân độ sáng. */
  gain?: Ex
  /** Cộng màu (0–1) cho từng kênh. */
  tint?: [Ex, Ex, Ex]
  /** Nhân độ mờ. */
  alpha?: Ex
}

type Def = (role: PxRole) => PxRecipe

/** Mạnh dần tới mối cắt (clip ra) / yếu dần sau mối cắt (clip vào). */
const peak = (role: PxRole, l: Lets, a = 0, b = 0.4, c = 0.6, d = 1): Ex =>
  l.let(role === 'out' ? sstep(a, b, P) : sub(1, sstep(c, d, P)))
/** Clip vào hiện dần quanh mối cắt. */
const crossIn = (role: PxRole, a: number, b: number): Ex | undefined => (role === 'in' ? sstep(a, b, P) : undefined)

const DEFS: Record<string, Def> = {
  /** Lệch màu đỏ–xanh + gợn sóng tròn lan từ tâm, hơi phóng to; clip sau hiện dần ở mối cắt. */
  rippleChroma: (role) => {
    const l = new Lets()
    const s = peak(role, l)
    const dx = l.let(mul(sub(U, 0.5), ASPECT))
    const dy = l.let(sub(V, 0.5))
    const d = l.let(add(sqrt(add(mul(dx, dx), mul(dy, dy))), 0.0001))
    const zoom = add(1, mul(0.12, s))
    const wave = l.let(mul(mul(mul(0.025, s), s), sin(sub(mul(d, 45), mul(P, 25)))))
    return {
      lets: l,
      qu: add(0.5, add(div(div(dx, ASPECT), zoom), div(mul(div(dx, d), wave), ASPECT))),
      qv: add(0.5, add(div(dy, zoom), mul(div(dy, d), wave))),
      chroma: mul(0.016, s),
      alpha: crossIn(role, 0.35, 0.65)
    }
  },
  /** Clip trước bị xé thành sọc ngang uốn sóng + vệt sáng xanh lướt qua; clip sau lộ dần từ trái sang phải. */
  waveWipe: (role) => {
    const l = new Lets()
    if (role === 'in') {
      const w = l.let(add(-0.06, mul(1.12, sstep(0.3, 1, P))))
      return { lets: l, qu: U, qv: V, alpha: sub(1, sstep(0, 0.06, add(sub(U, w), 0.03))) }
    }
    const s = l.let(sstep(0, 0.55, P))
    const pos = l.let(add(-0.2, mul(1.4, sstep(0.1, 0.6, P))))
    const streak = l.let(mul(mul(s, 0.85), max(0, sub(1, div(abs(sub(U, pos)), 0.05)))))
    return {
      lets: l,
      qu: add(U, mul(s, add(mul(0.05, sin(add(mul(V, 150), mul(P, 12)))), mul(0.025, sin(add(mul(V, 37), mul(U, 9))))))),
      qv: V,
      chroma: mul(0.01, s),
      tint: [mul(streak, 0.1), mul(streak, 0.9), streak]
    }
  },
  /** Lóe sáng: sáng rực lên ở mối cắt kèm phóng nhẹ, rồi dịu lại. */
  flashGlow: (role) => {
    const l = new Lets()
    const s = peak(role, l, 0.05, 0.4, 0.6, 0.95)
    const zoom = add(1, mul(0.06, s))
    return {
      lets: l,
      qu: add(0.5, div(sub(U, 0.5), zoom)),
      qv: add(0.5, div(sub(V, 0.5), zoom)),
      gain: add(1, mul(1.6, s)),
      chroma: mul(0.006, s),
      alpha: crossIn(role, 0.35, 0.65)
    }
  },
  /** Khảm ô vuông: vỡ thành ô to dần tới mối cắt, rồi mịn lại. */
  mosaic: (role) => {
    const l = new Lets()
    const s = peak(role, l)
    const n = l.let(sub(300, mul(285, s)))
    const nv = l.let(div(n, ASPECT))
    return {
      lets: l,
      qu: div(add(floor(mul(U, n)), 0.5), n),
      qv: div(add(floor(mul(V, nv)), 0.5), nv),
      alpha: crossIn(role, 0.4, 0.6)
    }
  },
  /** Xoáy nước: xoắn quanh tâm mạnh dần tới mối cắt, rồi tháo xoắn. */
  swirl: (role) => {
    const l = new Lets()
    const s = peak(role, l)
    const dx = l.let(mul(sub(U, 0.5), ASPECT))
    const dy = l.let(sub(V, 0.5))
    const d = sqrt(add(mul(dx, dx), mul(dy, dy)))
    const a = l.let(mul(mul(6, s), max(0, sub(1, div(d, 0.75)))))
    return {
      lets: l,
      qu: add(0.5, div(sub(mul(dx, cos(a)), mul(dy, sin(a))), ASPECT)),
      qv: add(0.5, add(mul(dx, sin(a)), mul(dy, cos(a)))),
      alpha: crossIn(role, 0.35, 0.65)
    }
  },
  /** Xé lên: clip trước bị đẩy lên trên, clip sau trồi lên từ dưới với mép trên răng cưa như giấy xé. */
  tearUp: (role) => {
    const l = new Lets()
    const k = l.let(sstep(0, 0.9, P))
    if (role === 'out') return { lets: l, qu: U, qv: add(V, k) }
    const qv = l.let(sub(V, sub(1, k)))
    const jag = add(mul(0.03, abs(sin(mul(U, 55)))), mul(0.02, abs(sin(add(mul(U, 23), 1)))))
    return { lets: l, qu: U, qv, alpha: sstep(0, 0.004, sub(qv, jag)) }
  }
}

export const PIXEL_TRANSITIONS = Object.keys(DEFS)
export const isPixelTransition = (kind: string): boolean => kind in DEFS

/** Dựng công thức của chuyển cảnh cho vai trò (clip ra / clip vào). */
export function pixelRecipe(kind: string, role: PxRole): PxRecipe | null {
  const def = DEFS[kind]
  return def ? def(role) : null
}

// ───────── Sinh mã ─────────

/** Thân hàm main() của fragment shader (GLSL ES 3.0). Đầu vào: uTex, uP, uAspect, uv (y hướng xuống). */
export function glslBody(r: PxRecipe): string {
  const lines = r.lets.list.map((x) => `float ${x.name} = ${x.value.g};`)
  const chroma = r.chroma ? r.chroma.g : '0.0'
  lines.push(
    `vec2 q = vec2(${r.qu.g}, ${r.qv.g});`,
    `float ch = ${chroma};`,
    'vec4 cg = sampleAt(q);',
    'float cr = sampleAt(q + vec2(ch, 0.0)).r;',
    'float cb = sampleAt(q - vec2(ch, 0.0)).b;',
    'vec3 c = vec3(cr, cg.g, cb);',
    ...(r.gain ? [`c *= ${r.gain.g};`] : []),
    ...(r.tint ? [`c += vec3(${r.tint[0].g}, ${r.tint[1].g}, ${r.tint[2].g});`] : []),
    `float a = cg.a${r.alpha ? ` * ${r.alpha.g}` : ''};`,
    'o = vec4(clamp(c, 0.0, 1.0) * a, a);'
  )
  return lines.join('\n  ')
}

/**
 * Biểu thức FFmpeg `geq` cho 4 kênh (định dạng gbrap). p tính theo thời gian của lớp:
 * p = (T − t0) / dur (kẹp 0…1).
 */
export function geqExprs(r: PxRecipe, t0: number, dur: number): { r: string; g: string; b: string; a: string } {
  // Mở đầu: ô 7, 8 = u, v (tâm điểm ảnh), ô 9 = p; rồi các biến tạm
  const head = [
    'st(7,(X+0.5)/W)',
    'st(8,(Y+0.5)/H)',
    `st(9,clip((T-${t0.toFixed(6)})/${Math.max(dur, 1e-6).toFixed(6)},0,1))`,
    ...r.lets.list.map((x) => `st(${x.slot},${x.value.f})`)
  ]
  // Toạ độ lấy mẫu (điểm ảnh) cho từng kênh; ngoài khung → 0 (trong suốt)
  const qu = r.qu.f
  const qv = r.qv.f
  const ch = r.chroma?.f ?? '0'
  const inside = (u: string): string => `between(${u},0,1)*between(${qv},0,1)`
  const sample = (plane: string, u: string): string => `if(${inside(u)},${plane}((${u})*W-0.5,(${qv})*H-0.5),0)`
  const alpha = `${sample('alpha', qu)}${r.alpha ? `*(${r.alpha.f})` : ''}`
  const gain = r.gain ? `*(${r.gain.f})` : ''
  const color = (plane: string, u: string, tint: Ex | undefined): string =>
    `clip(${sample(plane, u)}${gain}${tint ? `+255*(${tint.f})` : ''},0,255)`
  const wrap = (body: string): string => [...head, body].join(';')
  return {
    r: wrap(color('r', `(${qu})+(${ch})`, r.tint?.[0])),
    g: wrap(color('g', qu, r.tint?.[1])),
    b: wrap(color('b', `(${qu})-(${ch})`, r.tint?.[2])),
    a: wrap(alpha)
  }
}
