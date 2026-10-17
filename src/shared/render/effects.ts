// Hiệu ứng video (tab "Hiệu ứng", giống CapCut). Mọi hiệu ứng đều MIỄN PHÍ.
//
// Hiệu ứng là một CLIP trên track "Hiệu ứng": trong khoảng thời gian của nó, hiệu ứng tác động lên
// mọi thứ nằm ở các track BÊN DƯỚI (toàn khung hình đã ghép).
//
// Mỗi hiệu ứng = dãy "phép" (EffectOp) dùng chung. Mỗi loại phép có 2 cách làm cho ra cùng kết quả:
//   - preview:  renderer/src/engine/effects/applyEffect.ts (Canvas 2D)
//   - xuất:     main/export/effectFilters.ts (bộ lọc FFmpeg)
// Công thức chuyển động là biểu thức FFmpeg theo t = giây tính từ đầu clip hiệu ứng (xem expr.ts).
// Kích thước ghi theo TỈ LỆ khung hình (vd. 0.01 × chiều rộng) → giống nhau ở mọi độ phân giải.
//
// Thêm hiệu ứng mới: thêm 1 mục vào EFFECTS + tên trong file ngôn ngữ (effects.names.<id>).
import type { ColorOp } from './colorMath'

export type EffectOp =
  /** Chỉnh màu cố định (dùng lại colorMath – y hệt bộ lọc màu của clip). */
  | { type: 'color'; ops: ColorOp[] }
  /** Âm bản: đảo màu (255 − giá trị). */
  | { type: 'invert' }
  /** Xoay màu theo thời gian (độ). */
  | { type: 'hueCycle'; degrees: string }
  /** Làm mờ Gauss, bán kính = radius × chiều cao khung. */
  | { type: 'blur'; radius: number }
  /** Phát sáng: bản mờ của khung hình phủ lên bằng chế độ "screen". */
  | { type: 'glow'; radius: number; opacity: number }
  /**
   * Biến đổi cả khung quanh tâm: phóng to (scale), dời (dx, dy × khung), xoay (độ). Phần trống tô đen.
   * sx (mặc định 1): hệ số riêng theo chiều ngang – âm = lật gương, cos(…) = lật như tấm thẻ.
   */
  | { type: 'transform'; scale: string; dx: string; dy: string; rotate: string; sx?: string }
  /** Gợn sóng: mỗi hàng ('h') / cột ('v') dời theo hình sin; amp × khung, cycles sóng/khung, speed sóng/giây. */
  | { type: 'wave'; axis: 'h' | 'v'; amp: number; cycles: number; speed: number }
  /** Khung ảnh: khung hình thu nhỏ (scale) có viền trắng (border × cao) trên nền là chính nó làm mờ. */
  | { type: 'framed'; scale: number; border: number; blur: number }
  /**
   * Lớp phủ VẼ (tim bay, lấp lánh, đếm ngược…): vẽ bằng Canvas – preview vẽ trực tiếp, khi xuất thì
   * vẽ sẵn từng khung thành PNG rồi FFmpeg phủ lên (y như chữ) → giống hệt nhau. Phải đứng CUỐI danh sách phép.
   */
  | { type: 'overlay'; kind: OverlayKind }
  /** Pha khung hình về một màu (chớp sáng / chớp tối / tối dần): amount 0…1 theo thời gian. */
  | { type: 'flash'; color: 'white' | 'black'; amount: string }
  /** Viền tối dần ra mép: từ inner tới outer (tỉ lệ nửa đường chéo), tối nhất = strength. */
  | { type: 'vignette'; inner: number; outer: number; strength: number }
  /** Dải đen trên + dưới (điện ảnh / màn trập), mỗi dải = size × chiều cao; size là biểu thức theo t. */
  | { type: 'bars'; size: string }
  /** Soi gương: 'h' nửa trái → phải, 'v' nửa trên → dưới, 'quad' góc trên trái → 4 góc. */
  | { type: 'mirror'; mode: 'h' | 'v' | 'quad' }
  /**
   * Chia màn hình cols × rows, mỗi ô là khung hình (cắt giữa cho đúng tỉ lệ ô).
   * border: viền quanh mỗi ô (× chiều cao) màu borderColor; flipAlt: ô xen kẽ lật gương.
   */
  | { type: 'grid'; cols: number; rows: number; border?: number; borderColor?: 'white' | 'black'; flipAlt?: boolean }
  /** Lật ngang / dọc. */
  | { type: 'flip'; axis: 'h' | 'v' }
  /** Ô vuông điểm ảnh: blocks ô theo chiều ngang. */
  | { type: 'pixelate'; blocks: number }
  /** Tách màu: kênh đỏ dời trái, xanh dương dời phải (amount × chiều rộng); gate > 0 mới hiện. */
  | { type: 'rgbSplit'; amount: number; gate?: string }
  /** Đường quét ngang (TV cũ): mỗi spacing × chiều cao một vạch tối. */
  | { type: 'scanlines'; spacing: number; opacity: number }
  /** Nhiễu hạt (ngẫu nhiên – mỗi lần xem khác nhau một chút, bản chất của nhiễu). */
  | { type: 'grain'; amount: number }

/** Các lớp phủ vẽ (renderer/src/engine/effects/overlays.ts). */
export const OVERLAY_KINDS = [
  'hearts', 'sparkle', 'starDrops', 'dust', 'butterflies', 'confetti', 'bubbles', 'snow', 'rain',
  'countdown', 'lightSweep', 'ufoBeam', 'lightLeak', 'lensFlare', 'soccer', 'fire', 'disco', 'scratches'
] as const
export type OverlayKind = (typeof OVERLAY_KINDS)[number]

export const EFFECT_CATEGORIES = ['trending', 'decor', 'color', 'light', 'motion', 'frame', 'retro'] as const
export type EffectCategory = (typeof EFFECT_CATEGORIES)[number]

export interface EffectDef {
  id: string
  category: EffectCategory
  ops: EffectOp[]
}

/** Thời lượng mặc định khi thêm hiệu ứng (µs). */
export const DEFAULT_EFFECT_DURATION = 3_000_000

const still = { dx: '0', dy: '0', rotate: '0' }

export const EFFECTS: EffectDef[] = [
  // ───────── Màu sắc ─────────
  { id: 'bw', category: 'color', ops: [{ type: 'color', ops: [{ type: 'grayscale', value: 1 }] }] },
  { id: 'noir', category: 'color', ops: [{ type: 'color', ops: [{ type: 'grayscale', value: 1 }, { type: 'contrast', value: 1.6 }] }] },
  { id: 'sepia', category: 'color', ops: [{ type: 'color', ops: [{ type: 'sepia', value: 0.85 }, { type: 'contrast', value: 1.05 }] }] },
  { id: 'invert', category: 'color', ops: [{ type: 'invert' }] },
  { id: 'cool', category: 'color', ops: [{ type: 'color', ops: [{ type: 'hueRotate', degrees: -25 }, { type: 'saturate', value: 1.1 }, { type: 'brightness', value: 1.03 }] }] },
  { id: 'warm', category: 'color', ops: [{ type: 'color', ops: [{ type: 'sepia', value: 0.35 }, { type: 'saturate', value: 1.35 }, { type: 'brightness', value: 1.04 }] }] },
  { id: 'vivid', category: 'color', ops: [{ type: 'color', ops: [{ type: 'saturate', value: 1.7 }, { type: 'contrast', value: 1.15 }] }] },
  { id: 'faded', category: 'color', ops: [{ type: 'color', ops: [{ type: 'contrast', value: 0.7 }, { type: 'brightness', value: 1.1 }, { type: 'saturate', value: 0.65 }] }] },
  { id: 'rainbow', category: 'color', ops: [{ type: 'hueCycle', degrees: '120*t' }] },

  // ───────── Ánh sáng ─────────
  { id: 'blur', category: 'light', ops: [{ type: 'blur', radius: 0.012 }] },
  { id: 'dreamy', category: 'light', ops: [{ type: 'glow', radius: 0.02, opacity: 0.55 }, { type: 'color', ops: [{ type: 'brightness', value: 1.04 }] }] },
  { id: 'glow', category: 'light', ops: [{ type: 'glow', radius: 0.035, opacity: 0.85 }] },
  { id: 'flash', category: 'light', ops: [{ type: 'flash', color: 'white', amount: '0.9*exp(-6*mod(t,1))' }] },
  { id: 'strobe', category: 'light', ops: [{ type: 'flash', color: 'black', amount: 'lt(mod(t,0.25),0.08)' }] },
  { id: 'fadeBlack', category: 'light', ops: [{ type: 'flash', color: 'black', amount: 'clip(t/3,0,1)' }] },
  { id: 'fadeWhite', category: 'light', ops: [{ type: 'flash', color: 'white', amount: 'clip(1-t/1.5,0,1)' }] },

  // ───────── Chuyển động ─────────
  { id: 'shake', category: 'motion', ops: [{ type: 'transform', scale: '1.06', dx: '0.012*sin(2*PI*t*7)', dy: '0.012*cos(2*PI*t*5.3)', rotate: '0' }] },
  { id: 'shakeHard', category: 'motion', ops: [{ type: 'transform', scale: '1.12', dx: '0.035*sin(2*PI*t*11)', dy: '0.03*cos(2*PI*t*8.7)', rotate: '1.5*sin(2*PI*t*6)' }] },
  { id: 'heartbeat', category: 'motion', ops: [{ type: 'transform', scale: '1+0.08*exp(-10*mod(t,0.8))', ...still }] },
  { id: 'zoomPunch', category: 'motion', ops: [{ type: 'transform', scale: '1+0.18*lt(mod(t,1),0.12)', ...still }] },
  { id: 'zoomIn', category: 'motion', ops: [{ type: 'transform', scale: '1+0.25*clip(t/3,0,1)', ...still }] },
  { id: 'zoomOut', category: 'motion', ops: [{ type: 'transform', scale: '1.25-0.25*clip(t/3,0,1)', ...still }] },
  { id: 'sway', category: 'motion', ops: [{ type: 'transform', scale: '1.12', dx: '0', dy: '0', rotate: '4*sin(2*PI*t*0.8)' }] },
  { id: 'swing', category: 'motion', ops: [{ type: 'transform', scale: '1.15', dx: '0.06*sin(2*PI*t*0.7)', dy: '0', rotate: '0' }] },

  // ───────── Khung & chia màn hình ─────────
  { id: 'cinema', category: 'frame', ops: [{ type: 'bars', size: '0.12' }] },
  { id: 'vignette', category: 'frame', ops: [{ type: 'vignette', inner: 0.45, outer: 1, strength: 0.75 }] },
  { id: 'lens', category: 'frame', ops: [{ type: 'vignette', inner: 0.55, outer: 0.62, strength: 1 }] },
  { id: 'mirrorH', category: 'frame', ops: [{ type: 'mirror', mode: 'h' }] },
  { id: 'mirrorV', category: 'frame', ops: [{ type: 'mirror', mode: 'v' }] },
  { id: 'kaleido', category: 'frame', ops: [{ type: 'mirror', mode: 'quad' }] },
  { id: 'split2', category: 'frame', ops: [{ type: 'grid', cols: 2, rows: 1 }] },
  { id: 'split3', category: 'frame', ops: [{ type: 'grid', cols: 3, rows: 1 }] },
  { id: 'split4', category: 'frame', ops: [{ type: 'grid', cols: 2, rows: 2 }] },
  { id: 'split9', category: 'frame', ops: [{ type: 'grid', cols: 3, rows: 3 }] },
  { id: 'upsideDown', category: 'frame', ops: [{ type: 'flip', axis: 'v' }] },

  // ───────── Retro & nhiễu ─────────
  { id: 'rgbSplit', category: 'retro', ops: [{ type: 'rgbSplit', amount: 0.008 }] },
  {
    id: 'glitch',
    category: 'retro',
    ops: [
      // Từng đợt nhiễu ngắn: khung giật ngang + tách màu mạnh
      { type: 'transform', scale: '1.04', dx: '0.03*lt(mod(t,1.1),0.16)*sin(2*PI*t*23)', dy: '0', rotate: '0' },
      { type: 'rgbSplit', amount: 0.018, gate: 'lt(mod(t,1.1),0.16)' },
      { type: 'rgbSplit', amount: 0.003 }
    ]
  },
  {
    id: 'vhs',
    category: 'retro',
    ops: [
      { type: 'color', ops: [{ type: 'saturate', value: 0.8 }, { type: 'contrast', value: 1.1 }, { type: 'sepia', value: 0.12 }] },
      { type: 'blur', radius: 0.0012 },
      { type: 'rgbSplit', amount: 0.004 },
      { type: 'scanlines', spacing: 0.008, opacity: 0.25 },
      { type: 'grain', amount: 0.06 }
    ]
  },
  {
    id: 'oldFilm',
    category: 'retro',
    ops: [
      { type: 'color', ops: [{ type: 'sepia', value: 0.7 }, { type: 'contrast', value: 1.1 }] },
      { type: 'vignette', inner: 0.5, outer: 1.05, strength: 0.6 },
      { type: 'flash', color: 'black', amount: '0.06+0.06*sin(2*PI*t*9)' },
      { type: 'grain', amount: 0.1 }
    ]
  },
  { id: 'grain', category: 'retro', ops: [{ type: 'grain', amount: 0.12 }] },
  { id: 'scanlines', category: 'retro', ops: [{ type: 'scanlines', spacing: 0.006, opacity: 0.35 }, { type: 'vignette', inner: 0.6, outer: 1.1, strength: 0.4 }] },
  { id: 'pixel', category: 'retro', ops: [{ type: 'pixelate', blocks: 48 }] },
  { id: 'pixelShake', category: 'retro', ops: [{ type: 'transform', scale: '1.08', dx: '0.02*sin(2*PI*t*9)', dy: '0.015*cos(2*PI*t*7)', rotate: '0' }, { type: 'pixelate', blocks: 64 }] },
  {
    id: 'scratchFilm',
    category: 'retro',
    ops: [
      { type: 'color', ops: [{ type: 'sepia', value: 0.55 }, { type: 'contrast', value: 1.15 }] },
      { type: 'vignette', inner: 0.5, outer: 1.05, strength: 0.55 },
      { type: 'grain', amount: 0.08 },
      { type: 'overlay', kind: 'scratches' }
    ]
  },
  { id: 'neonTear', category: 'retro', ops: [{ type: 'hueCycle', degrees: '90*t' }, { type: 'color', ops: [{ type: 'saturate', value: 1.6 }] }, { type: 'rgbSplit', amount: 0.022, gate: 'lt(mod(t,0.7),0.18)' }] },

  // ───────── Trang trí & hạt (lớp phủ vẽ) ─────────
  { id: 'hearts', category: 'decor', ops: [{ type: 'overlay', kind: 'hearts' }] },
  { id: 'loveSparkle', category: 'decor', ops: [{ type: 'glow', radius: 0.02, opacity: 0.35 }, { type: 'overlay', kind: 'hearts' }, { type: 'overlay', kind: 'sparkle' }] },
  { id: 'sparkle', category: 'decor', ops: [{ type: 'overlay', kind: 'sparkle' }] },
  { id: 'starDrops', category: 'decor', ops: [{ type: 'overlay', kind: 'starDrops' }] },
  { id: 'dust', category: 'decor', ops: [{ type: 'overlay', kind: 'dust' }] },
  { id: 'butterflies', category: 'decor', ops: [{ type: 'overlay', kind: 'butterflies' }] },
  { id: 'confetti', category: 'decor', ops: [{ type: 'overlay', kind: 'confetti' }] },
  { id: 'bubbles', category: 'decor', ops: [{ type: 'overlay', kind: 'bubbles' }] },
  { id: 'snow', category: 'decor', ops: [{ type: 'color', ops: [{ type: 'brightness', value: 1.05 }, { type: 'saturate', value: 0.85 }] }, { type: 'overlay', kind: 'snow' }] },
  { id: 'rain', category: 'decor', ops: [{ type: 'color', ops: [{ type: 'brightness', value: 0.85 }, { type: 'saturate', value: 0.8 }, { type: 'hueRotate', degrees: -10 }] }, { type: 'overlay', kind: 'rain' }] },
  { id: 'soccer', category: 'decor', ops: [{ type: 'overlay', kind: 'soccer' }] },
  { id: 'fire', category: 'decor', ops: [{ type: 'color', ops: [{ type: 'sepia', value: 0.2 }, { type: 'saturate', value: 1.3 }] }, { type: 'overlay', kind: 'fire' }] },
  { id: 'countdown', category: 'decor', ops: [{ type: 'overlay', kind: 'countdown' }] },
  { id: 'ufoBeam', category: 'decor', ops: [{ type: 'color', ops: [{ type: 'brightness', value: 0.8 }] }, { type: 'overlay', kind: 'ufoBeam' }] },
  { id: 'disco', category: 'decor', ops: [{ type: 'color', ops: [{ type: 'brightness', value: 0.75 }] }, { type: 'overlay', kind: 'disco' }] },

  // ───────── Thịnh hành ─────────
  { id: 'lightSweep', category: 'trending', ops: [{ type: 'overlay', kind: 'lightSweep' }] },
  { id: 'lightLeak', category: 'trending', ops: [{ type: 'overlay', kind: 'lightLeak' }] },
  { id: 'lensFlare', category: 'trending', ops: [{ type: 'overlay', kind: 'lensFlare' }] },
  { id: 'flipSwap', category: 'trending', ops: [{ type: 'transform', scale: '1', dx: '0', dy: '0', rotate: '0', sx: 'if(lt(mod(t,1),0.5),1,-1)' }] },
  { id: 'cardFlip', category: 'trending', ops: [{ type: 'transform', scale: '0.9', dx: '0', dy: '0', rotate: '0', sx: 'if(lt(abs(cos(PI*t)),0.03),0.03,cos(PI*t))' }] },
  { id: 'trackShot', category: 'trending', ops: [{ type: 'transform', scale: '1.3', dx: '0.1*sin(2*PI*t*0.25)', dy: '0.02*sin(2*PI*t*0.5)', rotate: '0' }] },
  { id: 'zoomBounce', category: 'trending', ops: [{ type: 'transform', scale: '1+0.2*exp(-4*mod(t,1))*abs(cos(2*PI*mod(t,1)*1.5))', dx: '0', dy: '0', rotate: '0' }] },
  { id: 'windmill', category: 'trending', ops: [{ type: 'transform', scale: '1.85', dx: '0', dy: '0', rotate: '30*floor(t*3)' }] },
  { id: 'chaos', category: 'trending', ops: [{ type: 'transform', scale: '1.3', dx: '0.03*sin(2*PI*t*7)', dy: '0.03*cos(2*PI*t*6)', rotate: '6*sin(2*PI*t*3)' }, { type: 'rgbSplit', amount: 0.015, gate: 'lt(mod(t,0.5),0.12)' }] },
  { id: 'shutter', category: 'trending', ops: [{ type: 'bars', size: '0.5*max(0,1-abs(mod(t,1.2)-0.08)/0.08)' }, { type: 'flash', color: 'white', amount: '0.6*exp(-12*max(0,mod(t,1.2)-0.16))*gt(mod(t,1.2),0.16)' }] },
  { id: 'flashStrobe', category: 'trending', ops: [{ type: 'flash', color: 'white', amount: 'lt(mod(t,0.4),0.05)' }] },
  { id: 'glowFlash', category: 'trending', ops: [{ type: 'glow', radius: 0.03, opacity: 0.6 }, { type: 'flash', color: 'white', amount: '0.5*exp(-8*mod(t,0.6))' }] },
  { id: 'darkFantasy', category: 'trending', ops: [{ type: 'color', ops: [{ type: 'saturate', value: 0.6 }, { type: 'hueRotate', degrees: 15 }, { type: 'contrast', value: 1.25 }, { type: 'brightness', value: 0.85 }] }, { type: 'glow', radius: 0.025, opacity: 0.35 }, { type: 'vignette', inner: 0.35, outer: 0.95, strength: 0.85 }] },
  { id: 'neonCity', category: 'trending', ops: [{ type: 'color', ops: [{ type: 'hueRotate', degrees: -40 }, { type: 'saturate', value: 1.8 }, { type: 'contrast', value: 1.2 }] }, { type: 'glow', radius: 0.025, opacity: 0.5 }] },
  { id: 'chrome', category: 'trending', ops: [{ type: 'color', ops: [{ type: 'grayscale', value: 1 }, { type: 'contrast', value: 1.7 }, { type: 'brightness', value: 1.05 }] }, { type: 'glow', radius: 0.015, opacity: 0.3 }] },
  { id: 'colorBlend', category: 'trending', ops: [{ type: 'hueCycle', degrees: '60*t' }, { type: 'color', ops: [{ type: 'saturate', value: 1.4 }] }] },

  // ───────── Thêm: sóng & khung ─────────
  { id: 'waveSoft', category: 'motion', ops: [{ type: 'wave', axis: 'h', amp: 0.006, cycles: 3, speed: 1 }] },
  { id: 'waveVertical', category: 'motion', ops: [{ type: 'wave', axis: 'v', amp: 0.012, cycles: 2, speed: 1.2 }] },
  { id: 'waveDiagonal', category: 'motion', ops: [{ type: 'wave', axis: 'h', amp: 0.008, cycles: 4, speed: 1.5 }, { type: 'wave', axis: 'v', amp: 0.008, cycles: 4, speed: 1.5 }] },
  { id: 'patternWave', category: 'motion', ops: [{ type: 'wave', axis: 'h', amp: 0.02, cycles: 8, speed: 2 }] },
  { id: 'triple', category: 'frame', ops: [{ type: 'grid', cols: 3, rows: 1, border: 0.012, borderColor: 'white' }] },
  { id: 'fourPanel', category: 'frame', ops: [{ type: 'grid', cols: 2, rows: 2, border: 0.012, borderColor: 'black' }] },
  { id: 'tileFlip', category: 'frame', ops: [{ type: 'grid', cols: 2, rows: 2, flipAlt: true }] },
  { id: 'framed', category: 'frame', ops: [{ type: 'framed', scale: 0.78, border: 0.012, blur: 0.03 }] },
  { id: 'cardCut', category: 'frame', ops: [{ type: 'framed', scale: 0.84, border: 0.02, blur: 0.04 }, { type: 'transform', scale: '1', dx: '0', dy: '0', rotate: '2*sin(2*PI*t*0.6)' }] }
]

// ───────── Kích thước dùng chung (preview và xuất tính giống nhau) ─────────

/** Chia `total` pixel thành n phần nguyên, cộng lại đúng bằng total (phần dư chia cho các ô đầu). */
export function splitSizes(total: number, n: number): number[] {
  const base = Math.floor(total / n)
  const rest = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0))
}

/** Vùng cắt ở GIỮA khung W×H có cùng tỉ lệ với ô cw×ch (để ô chia màn hình không bị méo). */
export function coverCrop(W: number, H: number, cw: number, ch: number): { x: number; y: number; w: number; h: number } {
  const k = Math.max(cw / W, ch / H)
  const w = Math.min(W, Math.round(cw / k))
  const h = Math.min(H, Math.round(ch / k))
  return { x: Math.floor((W - w) / 2), y: Math.floor((H - h) / 2), w, h }
}

export const blurPx = (radius: number, H: number): number => Math.max(0.5, radius * H)
export const shiftPx = (amount: number, W: number): number => Math.max(1, Math.round(amount * W))
export const barPx = (size: number, H: number): number => Math.round(size * H)
export const scanlineSpacing = (spacing: number, H: number): number => Math.max(2, Math.round(spacing * H))
/** Số ô điểm ảnh theo 2 chiều. */
export function pixelGrid(blocks: number, W: number, H: number): { w: number; h: number } {
  return { w: Math.max(1, blocks), h: Math.max(1, Math.round((blocks * H) / W)) }
}

/** Viền quanh mỗi ô chia màn hình (pixel), 0 nếu không có. */
export const gridBorderPx = (border: number | undefined, H: number): number => (border ? Math.max(1, Math.round(border * H)) : 0)

/** Bố cục "khung ảnh": ảnh thu nhỏ fw×fh, viền b, cả khung (gồm viền) đặt ở (x, y). */
export function framedLayout(W: number, H: number, scale: number, border: number): { fw: number; fh: number; b: number; x: number; y: number } {
  const fw = Math.max(2, Math.round((W * scale) / 2) * 2)
  const fh = Math.max(2, Math.round((H * scale) / 2) * 2)
  const b = Math.max(1, Math.round(border * H))
  return { fw, fh, b, x: Math.round((W - fw - 2 * b) / 2), y: Math.round((H - fh - 2 * b) / 2) }
}

/** Hiệu ứng có lớp phủ vẽ không (khi xuất cần vẽ sẵn khung hình). */
export function hasOverlay(def: EffectDef): boolean {
  return def.ops.some((op) => op.type === 'overlay')
}

export function findEffect(id: string): EffectDef | undefined {
  return EFFECTS.find((e) => e.id === id)
}
