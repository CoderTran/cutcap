// "Hiệu ứng động" của clip video/ảnh (bảng phải → tab Hiệu ứng động, giống CapCut): Vào / Ra / Kết hợp.
//
// Mỗi hiệu ứng động = công thức cho 6 "kênh" theo TIẾN ĐỘ t (0 → 1), viết bằng cú pháp biểu thức FFmpeg
// (xem expr.ts) để preview và xuất video tính ra cùng một con số:
//   scale (nhân Kích thước), dx/dy (cộng vào Vị trí, × khung), rot (cộng độ), alpha (nhân Độ mờ),
//   sx (nhân bề ngang – lật như tấm thẻ)
//
//  - Vào:     t chạy 0 → 1 trong `duration` đầu clip; t = 1 là trạng thái bình thường.
//  - Ra:      dùng LẠI công thức Vào nhưng chạy ngược (t = 1 → 0) trong `duration` cuối clip.
//  - Kết hợp: MỘT hiệu ứng dùng cho cả Vào (đầu clip, dài `duration`) lẫn Ra (cuối clip, chạy ngược,
//             dài `outDuration`) – thanh thời lượng có 2 đầu kéo riêng.
// Cộng dồn lên trên biến đổi/keyframe của clip: Kích thước × scale, Vị trí + dx/dy, Xoay + rot…
import type { ClipAnim, MediaClip } from '../project/schema'
import type { Micros } from '../project/time'
import { evalExpr, ffmpegExpr } from './expr'

export interface AnimChannels {
  scale?: string
  dx?: string
  dy?: string
  rot?: string
  alpha?: string
  sx?: string
}

export interface ClipAnimDef {
  id: string
  ch: AnimChannels
}

/** Nhanh rồi chậm dần (dùng cho Vào; chạy ngược thành chậm rồi nhanh cho Ra). */
const E = '(1-pow(1-t,3))'

export const IN_ANIMS: ClipAnimDef[] = [
  { id: 'fade', ch: { alpha: 't' } },
  { id: 'zoomIn', ch: { scale: `0.4+0.6*${E}`, alpha: 'min(1,t*2)' } },
  { id: 'zoomOut', ch: { scale: `1.6-0.6*${E}`, alpha: 'min(1,t*2)' } },
  { id: 'slideLeft', ch: { dx: `1-${E}` } },
  { id: 'slideRight', ch: { dx: `${E}-1` } },
  { id: 'slideUp', ch: { dy: `1-${E}` } },
  { id: 'slideDown', ch: { dy: `${E}-1` } },
  { id: 'diagonal', ch: { dx: `0.6*(1-${E})`, dy: `0.6*(1-${E})`, rot: `-20*(1-${E})`, alpha: 'min(1,t*3)' } },
  { id: 'rotateIn', ch: { rot: `-180*(1-${E})`, scale: `0.3+0.7*${E}`, alpha: 'min(1,t*2)' } },
  { id: 'spinIn', ch: { rot: `720*(1-${E})`, scale: `max(0.01,${E})` } },
  { id: 'dropIn', ch: { dy: '-0.7*exp(-5*t)*cos(3*PI*t)*(1-t)', alpha: 'min(1,t*4)' } },
  { id: 'pop', ch: { scale: 'max(0.01,1-exp(-5*t)*cos(2.5*PI*t))' } },
  { id: 'swing', ch: { rot: '25*exp(-5*t)*cos(4*PI*t)*(1-t)', alpha: 'min(1,t*3)' } },
  { id: 'shake', ch: { dx: '0.05*exp(-4*t)*sin(30*t)*(1-t)' } },
  { id: 'flip', ch: { sx: `0.03+0.97*${E}` } },
  { id: 'rise', ch: { dy: `0.25*(1-${E})`, alpha: 't' } }
]

/** Ra: tên riêng nhưng dùng công thức Vào chạy ngược (ra theo hướng ngược với lúc vào). */
export const OUT_ANIMS: { id: string; from: string }[] = [
  { id: 'fade', from: 'fade' },
  { id: 'zoomOut', from: 'zoomIn' }, // thu nhỏ rồi biến mất
  { id: 'zoomIn', from: 'zoomOut' }, // phóng to rồi biến mất
  { id: 'slideLeft', from: 'slideRight' }, // trượt ra bên trái
  { id: 'slideRight', from: 'slideLeft' },
  { id: 'slideUp', from: 'slideDown' }, // trượt lên trên
  { id: 'slideDown', from: 'slideUp' },
  { id: 'diagonal', from: 'diagonal' },
  { id: 'rotateOut', from: 'rotateIn' },
  { id: 'spinOut', from: 'spinIn' },
  { id: 'flip', from: 'flip' },
  { id: 'sink', from: 'rise' }
]

export type AnimKind = 'in' | 'out' | 'combo'

/** Thời lượng mặc định khi chọn một hiệu ứng động (µs). */
export const DEFAULT_ANIM_DURATION: Record<AnimKind, Micros> = { in: 500_000, out: 500_000, combo: 500_000 }

export function animChannels(kind: AnimKind, id: string): AnimChannels | null {
  // Kết hợp dùng đúng hiệu ứng Vào (phần Ra là chính nó chạy ngược)
  if (kind === 'in' || kind === 'combo') return IN_ANIMS.find((a) => a.id === id)?.ch ?? null
  const out = OUT_ANIMS.find((a) => a.id === id)
  return out ? (IN_ANIMS.find((a) => a.id === out.from)?.ch ?? null) : null
}

export function animIds(kind: AnimKind): string[] {
  return (kind === 'out' ? OUT_ANIMS : IN_ANIMS).map((a) => a.id)
}

/** Clip có hiệu ứng động nào không. */
export function hasClipAnim(clip: MediaClip): boolean {
  return !!(clip.animIn || clip.animOut || clip.animCombo)
}

/** Thời lượng thực tế (giây) – kẹp để không dài hơn clip và phần đầu / phần cuối không chồng lên nhau. */
function spans(clip: MediaClip): { D: number; dIn: number; dOut: number; dCombo: number; dComboOut: number } {
  const D = clip.duration / 1e6
  const dIn = clip.animIn ? Math.min(D, clip.animIn.duration / 1e6) : 0
  const dOut = clip.animOut ? Math.min(D - dIn, clip.animOut.duration / 1e6) : 0
  const combo = clip.animCombo
  const dCombo = combo ? Math.min(D, combo.duration / 1e6) : 0
  const dComboOut = combo ? Math.min(D - dCombo, (combo.outDuration ?? combo.duration) / 1e6) : 0
  return { D, dIn, dOut, dCombo, dComboOut }
}

/** Thời lượng Vào / Ra của Kết hợp sau khi kẹp (µs) – cho thanh thời lượng 2 đầu. */
export function comboSpans(clip: MediaClip): { inUs: Micros; outUs: Micros } {
  const { dCombo, dComboOut } = spans(clip)
  return { inUs: Math.round(dCombo * 1e6), outUs: Math.round(dComboOut * 1e6) }
}

export interface AnimState {
  scale: number
  dx: number
  dy: number
  rot: number
  alpha: number
  sx: number
}

const IDENTITY: AnimState = { scale: 1, dx: 0, dy: 0, rot: 0, alpha: 1, sx: 1 }

function applyChannels(acc: AnimState, ch: AnimChannels, p: number): void {
  if (ch.scale) acc.scale *= evalExpr(ch.scale, p)
  if (ch.dx) acc.dx += evalExpr(ch.dx, p)
  if (ch.dy) acc.dy += evalExpr(ch.dy, p)
  if (ch.rot) acc.rot += evalExpr(ch.rot, p)
  if (ch.alpha) acc.alpha *= Math.min(1, Math.max(0, evalExpr(ch.alpha, p)))
  if (ch.sx) acc.sx *= evalExpr(ch.sx, p)
}

/** Trạng thái hiệu ứng động tại thời điểm t (µs trên timeline) – preview dùng. */
export function clipAnimAt(clip: MediaClip, t: Micros): AnimState {
  if (!hasClipAnim(clip)) return IDENTITY
  const { D, dIn, dOut, dCombo, dComboOut } = spans(clip)
  const L = (t - clip.start) / 1e6
  const acc = { ...IDENTITY }
  const inCh = clip.animIn && animChannels('in', clip.animIn.id)
  const outCh = clip.animOut && animChannels('out', clip.animOut.id)
  const comboCh = clip.animCombo && animChannels('combo', clip.animCombo.id)
  if (comboCh && dCombo > 0) applyChannels(acc, comboCh, Math.min(1, Math.max(0, L / dCombo))) // vào
  if (comboCh && dComboOut > 0) applyChannels(acc, comboCh, 1 - Math.min(1, Math.max(0, (L - (D - dComboOut)) / dComboOut))) // ra (chạy ngược)
  if (inCh && dIn > 0) applyChannels(acc, inCh, Math.min(1, Math.max(0, L / dIn)))
  if (outCh && dOut > 0) applyChannels(acc, outCh, 1 - Math.min(1, Math.max(0, (L - (D - dOut)) / dOut)))
  return acc
}

/**
 * Biểu thức FFmpeg của 6 kênh (cùng phép tính với clipAnimAt).
 * @param local biểu thức "giây tính từ đầu clip" của bộ lọc dùng nó (vd. "(on/30-0.5)" hoặc "(T-0.5)")
 */
export function clipAnimExprs(clip: MediaClip, local: string): Record<keyof AnimState, string> {
  const out: Record<keyof AnimState, string[]> = { scale: [], dx: [], dy: [], rot: [], alpha: [], sx: [] }
  const { D, dIn, dOut, dCombo, dComboOut } = spans(clip)
  const n = (v: number): string => String(Number(v.toFixed(6)))
  const add = (ch: AnimChannels, p: string): void => {
    const sub = (e: string): string => `(${ffmpegExpr(e, p)})`
    if (ch.scale) out.scale.push(sub(ch.scale))
    if (ch.dx) out.dx.push(sub(ch.dx))
    if (ch.dy) out.dy.push(sub(ch.dy))
    if (ch.rot) out.rot.push(sub(ch.rot))
    if (ch.alpha) out.alpha.push(`clip(${sub(ch.alpha)},0,1)`)
    if (ch.sx) out.sx.push(sub(ch.sx))
  }
  const comboCh = clip.animCombo && animChannels('combo', clip.animCombo.id)
  const inCh = clip.animIn && animChannels('in', clip.animIn.id)
  const outCh = clip.animOut && animChannels('out', clip.animOut.id)
  if (comboCh && dCombo > 0) add(comboCh, `clip(${local}/${n(dCombo)},0,1)`)
  if (comboCh && dComboOut > 0) add(comboCh, `(1-clip((${local}-${n(D - dComboOut)})/${n(dComboOut)},0,1))`)
  if (inCh && dIn > 0) add(inCh, `clip(${local}/${n(dIn)},0,1)`)
  if (outCh && dOut > 0) add(outCh, `(1-clip((${local}-${n(D - dOut)})/${n(dOut)},0,1))`)
  const join = (list: string[], op: '*' | '+', id: string): string => (list.length > 0 ? list.join(op) : id)
  return {
    scale: join(out.scale, '*', '1'),
    dx: join(out.dx, '+', '0'),
    dy: join(out.dy, '+', '0'),
    rot: join(out.rot, '+', '0'),
    alpha: join(out.alpha, '*', '1'),
    sx: join(out.sx, '*', '1')
  }
}

/** Kích thước lớn nhất mà hiệu ứng động đạt tới (lấy mẫu dày) – để xuất video đủ nét khi phóng to. */
export function maxAnimScale(clip: MediaClip): number {
  if (!hasClipAnim(clip)) return 1
  let max = 1
  for (let i = 0; i <= 400; i++) max = Math.max(max, clipAnimAt(clip, clip.start + (clip.duration * i) / 400).scale)
  return max
}

export type { ClipAnim }
