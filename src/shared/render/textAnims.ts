// Hiệu ứng động cho chữ (bảng phải → Hiệu ứng động): Vào / Ra / Vòng lặp – giống CapCut.
// Hàm thuần: tính trạng thái của cả khối chữ và TỪNG KÝ TỰ tại thời điểm t; phần vẽ ở renderer/engine/text/drawText.ts
// (dùng chung cho Xem trước và Xuất video).
//
// Hiệu ứng Vào và Ra dùng chung một họ hàm theo "độ hiện" v: 0 = chưa hiện / đã biến mất, 1 = hiện đầy đủ.
//   Vào: v đi từ 0 → 1 trong thời lượng vào.   Ra: v đi từ 1 → 0 trong thời lượng ra (= hiệu ứng vào chạy ngược).
// Vòng lặp: hàm theo pha φ ∈ [0, 1) lặp lại mỗi chu kỳ.
import type { TextClip } from '../project/schema'
import type { Micros } from '../project/time'

/** Biến đổi của một ký tự (dx, dy theo cỡ chữ – em; rot: độ; blur: em). */
export interface GlyphState {
  dx: number
  dy: number
  scale: number
  sx: number
  sy: number
  rot: number
  alpha: number
  blur: number
}

/** Biến đổi của cả khối chữ. */
export interface BlockState extends GlyphState {
  /** Nghiêng (độ). */
  skew: number
  /** Xoay màu (độ) – cầu vồng / glitch. */
  hue: number
  /** Độ sáng (1 = giữ nguyên). */
  bright: number
}

export type WipeFrom = 'left' | 'right' | 'center' | 'top' | 'bottom'

export interface TextAnimFrame {
  block: BlockState
  /** Biến đổi từng ký tự (thứ tự i trong n ký tự nhìn thấy); null = không có hiệu ứng theo ký tự. */
  glyph: ((i: number, n: number) => GlyphState) | null
  /** Số ký tự đang hiện (gõ chữ) khi tổng số ký tự là n; null = hiện hết. */
  visible: ((n: number) => number) | null
  /** Che dần: chỉ hiện phần [0, p] theo hướng `from`; null = không che. */
  wipe: { from: WipeFrom; p: number } | null
}

export const IDENTITY_GLYPH: GlyphState = { dx: 0, dy: 0, scale: 1, sx: 1, sy: 1, rot: 0, alpha: 1, blur: 0 }
const identityBlock = (): BlockState => ({ ...IDENTITY_GLYPH, skew: 0, hue: 0, bright: 1 })

// ───────── Đường cong chuyển động ─────────

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const easeOutCubic = (p: number): number => 1 - (1 - p) ** 3
const easeOutBack = (p: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2
}
const easeOutElastic = (p: number): number =>
  p === 0 ? 0 : p === 1 ? 1 : 2 ** (-10 * p) * Math.sin(((p * 10 - 0.75) * (2 * Math.PI)) / 3) + 1
const easeOutBounce = (p: number): number => {
  const n1 = 7.5625
  const d1 = 2.75
  if (p < 1 / d1) return n1 * p * p
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375
  return n1 * (p -= 2.625 / d1) * p + 0.984375
}
const TAU = Math.PI * 2

/** Số giả ngẫu nhiên ổn định theo (i, k) – mỗi ký tự luôn có cùng "ngẫu nhiên" ở mọi khung hình. */
const hash = (i: number, k = 0): number => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Tiến độ riêng của ký tự i khi các ký tự lần lượt xuất hiện (spread: tỉ lệ thời gian dùng để rải). */
function stagger(v: number, i: number, n: number, spread = 0.6, order?: number): number {
  const k = order ?? (n > 1 ? i / (n - 1) : 0)
  return clamp01((v - spread * k) / (1 - spread))
}

// ───────── Danh mục ─────────

type Entrance = {
  block?: (v: number) => Partial<BlockState>
  glyph?: (v: number, i: number, n: number) => Partial<GlyphState>
  visible?: (v: number, n: number) => number
  wipe?: (v: number) => { from: WipeFrom; p: number }
}
type Loop = {
  block?: (phi: number) => Partial<BlockState>
  glyph?: (phi: number, i: number, n: number) => Partial<GlyphState>
  visible?: (phi: number, n: number) => number
}

/** Họ hiệu ứng Vào / Ra (theo độ hiện v). */
const ENTRANCES: Record<string, Entrance> = {
  fade: { block: (v) => ({ alpha: easeOutCubic(v) }) },
  slideUp: { block: (v) => ({ alpha: v, dy: (1 - easeOutCubic(v)) * 1.2 }) },
  slideDown: { block: (v) => ({ alpha: v, dy: -(1 - easeOutCubic(v)) * 1.2 }) },
  slideLeft: { block: (v) => ({ alpha: v, dx: (1 - easeOutCubic(v)) * 2 }) },
  slideRight: { block: (v) => ({ alpha: v, dx: -(1 - easeOutCubic(v)) * 2 }) },
  zoomIn: { block: (v) => ({ alpha: v, scale: 0.4 + 0.6 * easeOutCubic(v) }) },
  zoomOut: { block: (v) => ({ alpha: v, scale: 2.2 - 1.2 * easeOutCubic(v) }) },
  pop: { block: (v) => ({ alpha: clamp01(v * 3), scale: Math.max(0, easeOutBack(v)) }) },
  blur: { block: (v) => ({ alpha: v, blur: (1 - v) * 0.5 }) },
  rotate: { block: (v) => ({ alpha: v, rot: -(1 - easeOutCubic(v)) * 90, scale: 0.6 + 0.4 * v }) },
  swing: { block: (v) => ({ alpha: clamp01(v * 2), rot: Math.cos(v * TAU * 1.5) * (1 - v) * 35 }) },
  spin: { block: (v) => ({ alpha: v, rot: (1 - easeOutCubic(v)) * 360, scale: 0.3 + 0.7 * easeOutCubic(v) }) },
  stretch: { block: (v) => ({ alpha: clamp01(v * 2), sx: easeOutBack(v) }) },
  squash: { block: (v) => ({ alpha: clamp01(v * 2), sy: easeOutBack(v) }) },
  flip: { block: (v) => ({ alpha: v > 0 ? 1 : 0, sx: Math.sin((easeOutCubic(v) * Math.PI) / 2) }) },
  bounce: { block: (v) => ({ alpha: clamp01(v * 4), dy: -(1 - easeOutBounce(v)) * 1.6 }) },
  elastic: { block: (v) => ({ alpha: clamp01(v * 4), scale: Math.max(0, easeOutElastic(v)) }) },
  drop: { block: (v) => ({ alpha: clamp01(v * 3), dy: -(1 - easeOutBounce(v)) * 2.5 }) },
  rise: { block: (v) => ({ alpha: v, dy: (1 - easeOutBack(v)) * 1.5 }) },
  skew: { block: (v) => ({ alpha: v, skew: (1 - easeOutCubic(v)) * 40, dx: (1 - easeOutCubic(v)) * 1.2 }) },
  roll: { block: (v) => ({ alpha: v, dx: -(1 - easeOutCubic(v)) * 2.5, rot: -(1 - easeOutCubic(v)) * 360 }) },
  color: { block: (v) => ({ alpha: v, hue: (1 - v) * 220 }) },
  flash: { block: (v) => ({ alpha: v, bright: 1 + (1 - v) * 2.5 }) },
  shake: { block: (v) => ({ alpha: clamp01(v * 3), dx: Math.sin(v * TAU * 4) * (1 - v) * 0.35 }) },
  glitch: {
    block: (v) => {
      const step = Math.floor(v * 12)
      const on = v < 1 && hash(step, 3) > 0.35
      return {
        alpha: v < 0.15 ? (hash(step) > 0.5 ? 1 : 0) : 1,
        dx: on ? (hash(step, 1) - 0.5) * 0.4 * (1 - v) : 0,
        hue: on ? hash(step, 2) * 180 : 0
      }
    }
  },
  flicker: { block: (v) => ({ alpha: v >= 1 ? 1 : hash(Math.floor(v * 16)) < v ? 1 : 0.1 }) },
  neon: { block: (v) => ({ alpha: v >= 1 ? 1 : hash(Math.floor(v * 14), 5) < v ? 1 : 0.15, bright: 1 + (1 - v) * 0.8 }) },
  wipeLeft: { wipe: (v) => ({ from: 'left', p: easeOutCubic(v) }) },
  wipeRight: { wipe: (v) => ({ from: 'right', p: easeOutCubic(v) }) },
  wipeCenter: { wipe: (v) => ({ from: 'center', p: easeOutCubic(v) }) },
  wipeUp: { wipe: (v) => ({ from: 'bottom', p: easeOutCubic(v) }) },
  wipeDown: { wipe: (v) => ({ from: 'top', p: easeOutCubic(v) }) },
  typewriter: { visible: (v, n) => Math.floor(v * n + 1e-9) },

  // Theo từng ký tự
  charsFade: { glyph: (v, i, n) => ({ alpha: stagger(v, i, n) }) },
  charsPop: { glyph: (v, i, n) => ({ scale: Math.max(0, easeOutBack(stagger(v, i, n))), alpha: clamp01(stagger(v, i, n) * 3) }) },
  charsDrop: { glyph: (v, i, n) => ({ dy: -(1 - easeOutBounce(stagger(v, i, n))) * 1.5, alpha: clamp01(stagger(v, i, n) * 4) }) },
  charsRise: { glyph: (v, i, n) => ({ dy: (1 - easeOutCubic(stagger(v, i, n))) * 1, alpha: stagger(v, i, n) }) },
  charsSlide: { glyph: (v, i, n) => ({ dx: (1 - easeOutCubic(stagger(v, i, n))) * 1.2, alpha: stagger(v, i, n) }) },
  charsSpin: { glyph: (v, i, n) => ({ rot: (1 - easeOutCubic(stagger(v, i, n))) * 180, alpha: stagger(v, i, n) }) },
  charsZoom: { glyph: (v, i, n) => ({ scale: 3 - 2 * easeOutCubic(stagger(v, i, n)), alpha: stagger(v, i, n) }) },
  charsFlip: {
    glyph: (v, i, n) => ({ sx: Math.sin((easeOutCubic(stagger(v, i, n)) * Math.PI) / 2), alpha: stagger(v, i, n) > 0 ? 1 : 0 })
  },
  charsBlur: { glyph: (v, i, n) => ({ blur: (1 - stagger(v, i, n)) * 0.35, alpha: stagger(v, i, n) }) },
  charsWave: {
    glyph: (v, i, n) => ({
      dy: Math.sin(stagger(v, i, n, 0.5) * Math.PI) * -0.45 + (1 - stagger(v, i, n, 0.5)) * 0.6,
      alpha: stagger(v, i, n, 0.5)
    })
  },
  charsRandom: { glyph: (v, i, n) => ({ alpha: stagger(v, i, n, 0.7, hash(i, 9)) }) },
  charsScatter: {
    glyph: (v, i, n) => {
      const q = 1 - easeOutCubic(stagger(v, i, n, 0.3))
      return { dx: (hash(i, 1) - 0.5) * 4 * q, dy: (hash(i, 2) - 0.5) * 3 * q, rot: (hash(i, 3) - 0.5) * 360 * q, alpha: 1 - q * 0.8 }
    }
  },
  charsRain: {
    glyph: (v, i, n) => {
      const s = stagger(v, i, n, 0.6, hash(i, 4))
      return { dy: -(1 - easeOutBounce(s)) * 2.5, alpha: clamp01(s * 4) }
    }
  },
  charsElastic: {
    glyph: (v, i, n) => ({ scale: Math.max(0, easeOutElastic(stagger(v, i, n, 0.5))), alpha: clamp01(stagger(v, i, n, 0.5) * 4) })
  },
  charsSwing: {
    glyph: (v, i, n) => ({ rot: Math.cos(stagger(v, i, n) * TAU) * (1 - stagger(v, i, n)) * 40, alpha: clamp01(stagger(v, i, n) * 2) })
  },
  tracking: { glyph: (v, i, n) => ({ dx: (i - (n - 1) / 2) * 0.8 * (1 - easeOutCubic(v)), alpha: v }) },
  converge: {
    glyph: (v, i, n) => ({
      dx: (i - (n - 1) / 2) * -0.6 * (1 - easeOutCubic(v)),
      dy: (i % 2 ? 1 : -1) * (1 - easeOutCubic(v)) * 0.8,
      alpha: v
    })
  },
  charsFall: {
    glyph: (v, i, n) => ({
      dy: (1 - stagger(v, i, n, 0.5)) ** 2 * 3,
      rot: (1 - stagger(v, i, n, 0.5)) * (hash(i) - 0.5) * 90,
      alpha: stagger(v, i, n, 0.5)
    })
  },
  charsRiseBack: { glyph: (v, i, n) => ({ dy: (1 - easeOutBack(stagger(v, i, n))) * 1.2, alpha: clamp01(stagger(v, i, n) * 2) }) }
}

/** Hiệu ứng Vào: mã → hàm theo độ hiện (thứ tự = thứ tự hiện trong lưới). */
export const TEXT_ANIM_IN = [
  'typewriter',
  'fade',
  'charsFade',
  'charsPop',
  'charsDrop',
  'charsRise',
  'charsWave',
  'charsZoom',
  'charsSpin',
  'charsFlip',
  'charsBlur',
  'charsRandom',
  'charsScatter',
  'charsRain',
  'charsElastic',
  'charsSwing',
  'charsSlide',
  'charsRiseBack',
  'tracking',
  'converge',
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
  'zoomIn',
  'zoomOut',
  'pop',
  'blur',
  'rotate',
  'swing',
  'spin',
  'stretch',
  'squash',
  'flip',
  'bounce',
  'elastic',
  'drop',
  'rise',
  'skew',
  'roll',
  'color',
  'flash',
  'shake',
  'glitch',
  'flicker',
  'neon',
  'wipeLeft',
  'wipeRight',
  'wipeCenter',
  'wipeUp',
  'wipeDown'
] as const

/**
 * Hiệu ứng Ra: mã → hiệu ứng vào chạy ngược (vd. "Trượt lên" khi ra = chạy ngược "Trượt xuống" khi vào).
 * Mã giữ nguyên tên hướng theo chiều chuyển động lúc RA.
 */
const OUT_MAP: Record<string, string> = {
  typewriter: 'typewriter',
  fade: 'fade',
  charsFade: 'charsFade',
  charsPop: 'charsPop',
  charsFall: 'charsFall',
  charsUp: 'charsRise',
  charsWave: 'charsWave',
  charsZoom: 'charsZoom',
  charsSpin: 'charsSpin',
  charsFlip: 'charsFlip',
  charsBlur: 'charsBlur',
  dissolve: 'charsRandom',
  charsScatter: 'charsScatter',
  charsRain: 'charsRain',
  charsElastic: 'charsElastic',
  charsSwing: 'charsSwing',
  charsSlide: 'charsSlide',
  tracking: 'tracking',
  converge: 'converge',
  slideUp: 'slideDown',
  slideDown: 'slideUp',
  slideLeft: 'slideRight',
  slideRight: 'slideLeft',
  shrink: 'zoomIn',
  grow: 'zoomOut',
  pop: 'pop',
  blur: 'blur',
  rotate: 'rotate',
  swing: 'swing',
  spin: 'spin',
  stretch: 'stretch',
  squash: 'squash',
  flip: 'flip',
  sink: 'rise',
  fly: 'drop',
  skew: 'skew',
  roll: 'roll',
  color: 'color',
  flash: 'flash',
  shake: 'shake',
  glitch: 'glitch',
  flicker: 'flicker',
  neon: 'neon',
  wipeLeft: 'wipeRight',
  wipeRight: 'wipeLeft',
  wipeCenter: 'wipeCenter',
  wipeUp: 'wipeDown',
  wipeDown: 'wipeUp'
}
export const TEXT_ANIM_OUT = Object.keys(OUT_MAP)

/** Hiệu ứng Vòng lặp (theo pha φ). */
const LOOPS: Record<string, Loop> = {
  pulse: { block: (f) => ({ scale: 1 + 0.08 * Math.sin(f * TAU) }) },
  breathe: { block: (f) => ({ alpha: 0.55 + 0.45 * Math.cos(f * TAU) }) },
  float: { block: (f) => ({ dy: 0.12 * Math.sin(f * TAU) }) },
  swing: { block: (f) => ({ rot: 6 * Math.sin(f * TAU) }) },
  shake: { block: (f) => ({ dx: 0.05 * Math.sin(f * TAU * 6) }) },
  jitter: { block: (f) => ({ dx: (hash(Math.floor(f * 12), 1) - 0.5) * 0.08, dy: (hash(Math.floor(f * 12), 2) - 0.5) * 0.08 }) },
  heartbeat: {
    block: (f) => ({ scale: 1 + 0.12 * Math.max(0, Math.sin(f * TAU * 2)) ** 8 + 0.06 * Math.max(0, Math.sin(f * TAU * 2 - 0.9)) ** 8 })
  },
  bounce: { block: (f) => ({ dy: -0.25 * Math.abs(Math.sin(f * Math.PI)) }) },
  rotate: { block: (f) => ({ rot: f * 360 }) },
  spin3d: { block: (f) => ({ sx: Math.cos(f * TAU) }) },
  stretch: { block: (f) => ({ sx: 1 + 0.12 * Math.sin(f * TAU), sy: 1 - 0.1 * Math.sin(f * TAU) }) },
  tilt: { block: (f) => ({ skew: 12 * Math.sin(f * TAU) }) },
  drift: { block: (f) => ({ dx: 0.2 * Math.sin(f * TAU) }) },
  rainbow: { block: (f) => ({ hue: f * 360 }) },
  neonPulse: { block: (f) => ({ bright: 1 + 0.6 * (0.5 + 0.5 * Math.sin(f * TAU)) }) },
  flash: { block: (f) => ({ bright: f % 0.5 < 0.08 ? 2.2 : 1 }) },
  blink: { block: (f) => ({ alpha: f < 0.5 ? 1 : 0.15 }) },
  flicker: { block: (f) => ({ alpha: hash(Math.floor(f * 20), 7) > 0.18 ? 1 : 0.2 }) },
  glitch: {
    block: (f) => {
      const step = Math.floor(f * 16)
      const on = hash(step, 8) > 0.7
      return { dx: on ? (hash(step, 1) - 0.5) * 0.3 : 0, hue: on ? hash(step, 2) * 200 : 0 }
    }
  },
  zoomBreath: { block: (f) => ({ scale: 1 + 0.15 * (0.5 - 0.5 * Math.cos(f * TAU)) }) },
  wave: { glyph: (f, i, n) => ({ dy: -0.22 * Math.sin((f - i / Math.max(1, n)) * TAU) }) },
  jump: {
    glyph: (f, i, n) => {
      const local = (f * n - i + n) % n
      return { dy: local < 1 ? -0.4 * Math.sin(local * Math.PI) : 0 }
    }
  },
  wobble: { glyph: (f, i) => ({ rot: 12 * Math.sin((f + i * 0.15) * TAU) }) },
  ripple: { glyph: (f, i, n) => ({ scale: 1 + 0.18 * Math.max(0, Math.sin((f - i / Math.max(1, n)) * TAU)) }) },
  sway: { glyph: (f, i) => ({ dx: 0.08 * Math.sin((f + i * 0.2) * TAU) }) },
  orbit: { glyph: (f, i) => ({ dx: 0.06 * Math.cos((f + i * 0.12) * TAU), dy: 0.06 * Math.sin((f + i * 0.12) * TAU) }) },
  shiver: {
    glyph: (f, i) => ({ dx: (hash(Math.floor(f * 24) * 31 + i, 1) - 0.5) * 0.06, dy: (hash(Math.floor(f * 24) * 31 + i, 2) - 0.5) * 0.06 })
  },
  flipChars: { glyph: (f, i, n) => ({ sx: Math.cos(clamp01(f * n * 0.5 - i * 0.5) * TAU) }) },
  breatheChars: { glyph: (f, i, n) => ({ alpha: 0.4 + 0.6 * (0.5 + 0.5 * Math.cos((f - i / Math.max(1, n)) * TAU)) }) },
  trackingBreath: { glyph: (f, i, n) => ({ dx: (i - (n - 1) / 2) * 0.12 * (0.5 - 0.5 * Math.cos(f * TAU)) }) },
  typeLoop: { visible: (f, n) => Math.floor(clamp01(f / 0.7) * n + 1e-9) }
}
export const TEXT_ANIM_LOOP = Object.keys(LOOPS)

export type TextAnimKind = 'in' | 'out' | 'loop'
export const textAnimIds = (kind: TextAnimKind): readonly string[] =>
  kind === 'in' ? TEXT_ANIM_IN : kind === 'out' ? TEXT_ANIM_OUT : TEXT_ANIM_LOOP

/** Hiệu ứng có dựa vào từng ký tự không (cần vẽ từng ký tự). */
export const isPerChar = (kind: TextAnimKind, id: string): boolean => {
  const def = kind === 'loop' ? LOOPS[id] : ENTRANCES[kind === 'out' ? (OUT_MAP[id] ?? '') : id]
  return !!def?.glyph
}

// Hiệu ứng xuất hiện kiểu cũ (trước khi có Vào / Ra / Vòng lặp) → hiệu ứng Vào tương ứng
const LEGACY_IN: Record<string, string> = { fade: 'fade', 'slide-up': 'slideUp', zoom: 'zoomIn', typewriter: 'typewriter' }

/** Hiệu ứng Vào thực tế (mới, hoặc kiểu cũ quy đổi). */
export function textInOf(clip: TextClip): { id: string; duration: Micros } | null {
  if (clip.textIn) return clip.textIn
  if (clip.animationIn !== 'none' && clip.animationDuration > 0)
    return { id: LEGACY_IN[clip.animationIn] ?? 'fade', duration: clip.animationDuration }
  return null
}

/** Thời lượng thật của Vào / Ra (không vượt quá clip; hai đoạn không chồng nhau). */
export function textAnimSpans(clip: TextClip): { inUs: Micros; outUs: Micros } {
  const tin = textInOf(clip)
  const inUs = tin ? Math.min(tin.duration, clip.duration) : 0
  const outUs = clip.textOut ? Math.min(clip.textOut.duration, Math.max(0, clip.duration - inUs)) : 0
  return { inUs, outUs }
}

/** Có hiệu ứng động nào không (để xuất video biết phải vẽ từng khung). */
export function hasTextAnim(clip: TextClip): boolean {
  return textInOf(clip) !== null || !!clip.textOut || !!clip.textLoop
}

/** Trạng thái hiệu ứng động của clip chữ tại thời điểm t. */
export function textAnimFrame(clip: TextClip, t: Micros): TextAnimFrame {
  const block = identityBlock()
  const glyphs: ((i: number, n: number) => Partial<GlyphState>)[] = []
  let wipe: TextAnimFrame['wipe'] = null
  const local = t - clip.start
  const { inUs, outUs } = textAnimSpans(clip)

  const applyBlock = (b: Partial<BlockState>): void => {
    block.dx += b.dx ?? 0
    block.dy += b.dy ?? 0
    block.scale *= b.scale ?? 1
    block.sx *= b.sx ?? 1
    block.sy *= b.sy ?? 1
    block.rot += b.rot ?? 0
    block.alpha *= b.alpha ?? 1
    block.blur += b.blur ?? 0
    block.skew += b.skew ?? 0
    block.hue += b.hue ?? 0
    block.bright *= b.bright ?? 1
  }
  const visibleFns: ((n: number) => number)[] = []

  const entrance = (def: Entrance | undefined, v: number): void => {
    if (!def) return
    if (def.block) applyBlock(def.block(v))
    if (def.glyph) glyphs.push((i, n) => def.glyph!(v, i, n))
    if (def.visible) visibleFns.push((n) => def.visible!(v, n))
    if (def.wipe) wipe = def.wipe(v)
  }

  const tin = textInOf(clip)
  if (tin && inUs > 0 && local < inUs) entrance(ENTRANCES[tin.id], clamp01(local / inUs))
  if (clip.textOut && outUs > 0 && local > clip.duration - outUs) {
    entrance(ENTRANCES[OUT_MAP[clip.textOut.id] ?? ''], clamp01((clip.duration - local) / outUs))
  }
  if (clip.textLoop && clip.textLoop.period > 0) {
    const def = LOOPS[clip.textLoop.id]
    // Vòng lặp chạy sau khi Vào xong (giống CapCut), pha tính từ lúc đó
    if (def && local >= inUs) {
      const phi = ((((local - inUs) / clip.textLoop.period) % 1) + 1) % 1
      if (def.block) applyBlock(def.block(phi))
      if (def.glyph) glyphs.push((i, n) => def.glyph!(phi, i, n))
      if (def.visible) visibleFns.push((n) => def.visible!(phi, n))
    }
  }

  const glyph =
    glyphs.length === 0
      ? null
      : (i: number, n: number): GlyphState => {
          const g = { ...IDENTITY_GLYPH }
          for (const f of glyphs) {
            const p = f(i, n)
            g.dx += p.dx ?? 0
            g.dy += p.dy ?? 0
            g.scale *= p.scale ?? 1
            g.sx *= p.sx ?? 1
            g.sy *= p.sy ?? 1
            g.rot += p.rot ?? 0
            g.alpha *= p.alpha ?? 1
            g.blur += p.blur ?? 0
          }
          return g
        }
  const visible = visibleFns.length === 0 ? null : (n: number): number => Math.max(0, Math.min(n, ...visibleFns.map((f) => f(n))))
  return { block, glyph, visible, wipe }
}

/** Thời lượng mặc định khi vừa chọn hiệu ứng. */
export const DEFAULT_TEXT_ANIM_US: Micros = 500_000
export const DEFAULT_TEXT_LOOP_US: Micros = 1_000_000
