// Keyframe (khung khóa) – làm thuộc tính của clip thay đổi theo thời gian, giống CapCut:
// đặt Kích thước = 100% ở giây 1, 214% ở giây 3 → clip phóng to dần trong khoảng đó.
//
// - Thời điểm keyframe tính TỪ ĐẦU CLIP (µs trên timeline) → kéo clip đi chỗ khác, keyframe đi theo.
// - Giữa 2 keyframe: nội suy tuyến tính. Trước keyframe đầu / sau keyframe cuối: giữ nguyên giá trị.
// - Thuộc tính chưa có keyframe nào → dùng giá trị thường (clip.transform / clip.volume).
//
// Dùng CHUNG cho preview (vẽ canvas, âm lượng) và xuất video (biểu thức FFmpeg tạo từ cùng dữ liệu).
import {
  KEYFRAME_PROPS,
  type Clip,
  type Keyframe,
  type KeyframeProp,
  type MediaClip,
  type Project,
  type Transform
} from '../project/schema'
import type { ClipMask } from '../render/mask'
import type { Micros } from '../project/time'

export const TRANSFORM_PROPS = ['scale', 'x', 'y', 'rotation', 'opacity'] as const satisfies readonly KeyframeProp[]

/** Thuộc tính keyframe của mặt nạ → trường tương ứng trong clip.mask. */
export const MASK_PROP_FIELDS = {
  maskX: 'x',
  maskY: 'y',
  maskRotation: 'rotation',
  maskWidth: 'width',
  maskHeight: 'height',
  maskFeather: 'feather',
  maskRoundness: 'roundness'
} as const satisfies Partial<Record<KeyframeProp, keyof ClipMask>>
export type MaskProp = keyof typeof MASK_PROP_FIELDS
export const MASK_PROPS = Object.keys(MASK_PROP_FIELDS) as MaskProp[]
const isMaskProp = (p: KeyframeProp): p is MaskProp => p in MASK_PROP_FIELDS

/** Hai keyframe cách nhau ít hơn mức này coi là cùng một chỗ (nửa khung hình ở 30 fps). */
export const KEYFRAME_TOLERANCE_US = 16_000

/** Giới hạn giá trị của từng thuộc tính (giống thanh trượt / applyTransform). */
const LIMITS: Record<KeyframeProp, [number, number]> = {
  scale: [0.05, 10],
  x: [-0.5, 1.5],
  y: [-0.5, 1.5],
  rotation: [-3600, 3600],
  opacity: [0, 1],
  volume: [0, 2],
  maskX: [-0.5, 1.5],
  maskY: [-0.5, 1.5],
  maskRotation: [-3600, 3600],
  maskWidth: [0.01, 3],
  maskHeight: [0.01, 3],
  maskFeather: [0, 100],
  maskRoundness: [0, 100]
}

export function clampProp(prop: KeyframeProp, value: number): number {
  const [min, max] = LIMITS[prop]
  return Math.min(max, Math.max(min, value))
}

/** Thuộc tính này có áp dụng cho clip không (âm lượng: clip media; mặt nạ: clip media đang có mặt nạ). */
export function propApplies(clip: Clip, prop: KeyframeProp): boolean {
  if (isMaskProp(prop)) return clip.type === 'media' && clip.mask !== null
  return prop === 'volume' ? clip.type === 'media' : true
}

/** Giá trị thường (không keyframe) của thuộc tính. */
export function baseValue(clip: Clip, prop: KeyframeProp): number {
  if (isMaskProp(prop)) return clip.type === 'media' && clip.mask ? clip.mask[MASK_PROP_FIELDS[prop]] : 0
  if (prop === 'volume') return clip.type === 'media' ? clip.volume : 1
  return clip.transform[prop]
}

export function keyframesOf(clip: Clip, prop: KeyframeProp): Keyframe[] {
  return clip.keyframes[prop] ?? []
}

export function hasKeyframes(clip: Clip, props: readonly KeyframeProp[] = TRANSFORM_PROPS): boolean {
  return props.some((p) => keyframesOf(clip, p).length > 0)
}

/** Nội suy tuyến tính giữa các keyframe (đã sắp xếp theo thời gian). `local` = µs tính từ đầu clip. */
export function interpolate(kfs: readonly Keyframe[], local: Micros): number {
  if (local <= kfs[0].time) return kfs[0].value
  const last = kfs[kfs.length - 1]
  if (local >= last.time) return last.value
  for (let i = 1; i < kfs.length; i++) {
    const b = kfs[i]
    if (local <= b.time) {
      const a = kfs[i - 1]
      return a.value + ((b.value - a.value) * (local - a.time)) / (b.time - a.time)
    }
  }
  return last.value
}

/** Giá trị thuộc tính tại thời điểm t (µs trên timeline). */
export function valueAt(clip: Clip, prop: KeyframeProp, t: Micros): number {
  const kfs = keyframesOf(clip, prop)
  return kfs.length > 0 ? interpolate(kfs, t - clip.start) : baseValue(clip, prop)
}

/** Biến đổi (vị trí, kích thước, xoay, độ mờ) của clip tại thời điểm t. */
export function transformAt(clip: Clip, t: Micros): Transform {
  if (!hasKeyframes(clip)) return clip.transform
  return {
    x: valueAt(clip, 'x', t),
    y: valueAt(clip, 'y', t),
    scale: valueAt(clip, 'scale', t),
    rotation: valueAt(clip, 'rotation', t),
    opacity: valueAt(clip, 'opacity', t)
  }
}

export function volumeAt(clip: MediaClip, t: Micros): number {
  return valueAt(clip, 'volume', t)
}

/** Mặt nạ của clip tại thời điểm t (đã nội suy keyframe), hoặc null nếu clip không có mặt nạ. */
export function maskAt(clip: MediaClip, t: Micros): ClipMask | null {
  if (!clip.mask) return null
  if (!hasKeyframes(clip, MASK_PROPS)) return clip.mask
  const m = { ...clip.mask }
  for (const p of MASK_PROPS) m[MASK_PROP_FIELDS[p]] = valueAt(clip, p, t)
  return m
}

/** Mọi thời điểm có keyframe (µs từ đầu clip, không trùng) – để vẽ dấu ◆ trên timeline. */
export function keyframeTimes(clip: Clip, props: readonly KeyframeProp[] = KEYFRAME_PROPS): Micros[] {
  const times: Micros[] = []
  for (const p of props) {
    for (const k of keyframesOf(clip, p)) {
      if (!times.some((x) => Math.abs(x - k.time) < KEYFRAME_TOLERANCE_US)) times.push(k.time)
    }
  }
  return times.sort((a, b) => a - b)
}

/** Keyframe của thuộc tính nằm đúng (gần) thời điểm local, hoặc -1. */
function indexAt(kfs: readonly Keyframe[], local: Micros): number {
  return kfs.findIndex((k) => Math.abs(k.time - local) < KEYFRAME_TOLERANCE_US)
}

/** Có keyframe của TẤT CẢ các thuộc tính này ngay tại t không (nút ◆ sáng lên). */
export function isKeyframeAt(clip: Clip, props: readonly KeyframeProp[], t: Micros): boolean {
  return props.every((p) => indexAt(keyframesOf(clip, p), t - clip.start) >= 0)
}

/** Keyframe gần nhất trước / sau t (µs trên timeline) của các thuộc tính, hoặc null. */
export function neighborKeyframe(clip: Clip, props: readonly KeyframeProp[], t: Micros, dir: -1 | 1): Micros | null {
  const local = t - clip.start
  const times = keyframeTimes(clip, props).filter((x) => (dir < 0 ? x < local - KEYFRAME_TOLERANCE_US : x > local + KEYFRAME_TOLERANCE_US))
  if (times.length === 0) return null
  return clip.start + (dir < 0 ? times[times.length - 1] : times[0])
}

// ───────────────────────── Sửa (gọi trong projectStore.apply) ─────────────────────────

function upsert(clip: Clip, prop: KeyframeProp, local: Micros, value: number): void {
  const kfs = [...keyframesOf(clip, prop)]
  const v = clampProp(prop, value)
  const i = indexAt(kfs, local)
  if (i >= 0) kfs[i] = { time: kfs[i].time, value: v }
  else kfs.push({ time: Math.round(local), value: v })
  kfs.sort((a, b) => a.time - b.time)
  clip.keyframes[prop] = kfs
}

/**
 * Đặt giá trị thuộc tính khi người dùng chỉnh (thanh trượt, kéo trên preview) tại thời điểm t:
 * thuộc tính đã có keyframe → tạo/cập nhật keyframe tại t (giống CapCut); chưa có → đổi giá trị thường.
 */
export function setAnimatedValue(clip: Clip, prop: KeyframeProp, value: number, t: Micros): void {
  if (!propApplies(clip, prop)) return
  if (keyframesOf(clip, prop).length > 0) return upsert(clip, prop, t - clip.start, value)
  if (isMaskProp(prop)) {
    if (clip.type === 'media' && clip.mask) clip.mask[MASK_PROP_FIELDS[prop]] = clampProp(prop, value)
  } else if (prop === 'volume') {
    if (clip.type === 'media') clip.volume = clampProp(prop, value)
  } else {
    clip.transform[prop] = clampProp(prop, value)
  }
}

/**
 * Nút ◇: có keyframe của các thuộc tính tại t → xóa đi; chưa có → thêm keyframe mang giá trị hiện tại.
 * @returns true nếu vừa THÊM keyframe
 */
export function toggleKeyframe(clip: Clip, props: readonly KeyframeProp[], t: Micros): boolean {
  const applicable = props.filter((p) => propApplies(clip, p))
  const local = t - clip.start
  if (isKeyframeAt(clip, applicable, t)) {
    for (const p of applicable) {
      const kfs = keyframesOf(clip, p).filter((k) => Math.abs(k.time - local) >= KEYFRAME_TOLERANCE_US)
      // Xóa keyframe cuối cùng → giữ lại giá trị lúc đó làm giá trị thường (hình không "nhảy")
      if (kfs.length === 0) {
        const last = valueAt(clip, p, t)
        delete clip.keyframes[p]
        setAnimatedValue(clip, p, last, t)
      } else {
        clip.keyframes[p] = kfs
      }
    }
    return false
  }
  for (const p of applicable) upsert(clip, p, local, valueAt(clip, p, t))
  return true
}

/** Xóa mọi keyframe của các thuộc tính, giữ giá trị tại t làm giá trị thường. */
export function clearKeyframes(clip: Clip, props: readonly KeyframeProp[], t: Micros): void {
  for (const p of props) {
    if (keyframesOf(clip, p).length === 0) continue
    const v = valueAt(clip, p, t)
    delete clip.keyframes[p]
    setAnimatedValue(clip, p, v, t)
  }
}

/**
 * Khoảng được phép kéo dấu ◆ tại `from` (µs từ đầu clip): trong clip, và không vượt qua dấu bên cạnh
 * (giữ thứ tự keyframe → chuyển động không bị đảo ngược).
 */
export function keyframeDragRange(clip: Clip, from: Micros): { min: Micros; max: Micros } {
  const others = keyframeTimes(clip).filter((x) => Math.abs(x - from) >= KEYFRAME_TOLERANCE_US)
  const before = others.filter((x) => x < from)
  const after = others.filter((x) => x > from)
  const gap = 2 * KEYFRAME_TOLERANCE_US
  return {
    min: before.length > 0 ? before[before.length - 1] + gap : 0,
    max: after.length > 0 ? after[0] - gap : clip.duration - 1
  }
}

/**
 * Kéo dấu ◆ trên timeline: dời MỌI keyframe nằm ở `from` (mọi thuộc tính) tới `to` (µs từ đầu clip).
 * `to` bị kẹp trong keyframeDragRange. @returns thời điểm mới thực sự (sau khi kẹp)
 */
export function moveKeyframes(clip: Clip, from: Micros, to: Micros): Micros {
  const { min, max } = keyframeDragRange(clip, from)
  const target = Math.round(Math.min(max, Math.max(min, to)))
  for (const p of Object.keys(clip.keyframes) as KeyframeProp[]) {
    const kfs = keyframesOf(clip, p)
    const i = indexAt(kfs, from)
    if (i < 0) continue
    clip.keyframes[p] = kfs.map((k, j) => (j === i ? { time: target, value: k.value } : k)).sort((a, b) => a.time - b.time)
  }
  return target
}

/** Dời mọi keyframe (vd. cắt bớt đầu clip Δ → keyframe dời −Δ để vẫn bám đúng nội dung). */
export function shiftKeyframes(clip: Clip, delta: Micros): void {
  if (delta === 0) return
  for (const p of Object.keys(clip.keyframes) as KeyframeProp[]) {
    clip.keyframes[p] = keyframesOf(clip, p).map((k) => ({ time: k.time + delta, value: k.value }))
  }
}

/** Co giãn thời gian keyframe (đổi tốc độ clip: độ dài × factor). */
export function scaleKeyframeTimes(clip: Clip, factor: number): void {
  if (factor === 1) return
  for (const p of Object.keys(clip.keyframes) as KeyframeProp[]) {
    clip.keyframes[p] = keyframesOf(clip, p).map((k) => ({ time: Math.round(k.time * factor), value: k.value }))
  }
}

// ───────────────────────── Biểu thức FFmpeg (xuất video) ─────────────────────────

/**
 * Biểu thức FFmpeg cho giá trị thuộc tính theo thời gian – cùng phép nội suy với `interpolate`.
 * @param timeExpr biểu thức thời gian TÍNH TỪ ĐẦU CLIP, đơn vị giây (vd. "(on/30-0.5)")
 * @returns chuỗi chỉ dùng if(), lt(), + − × ÷ – FFmpeg hiểu được
 */
export function ffmpegValueExpr(clip: Clip, prop: KeyframeProp, timeExpr: string): string {
  const kfs = keyframesOf(clip, prop)
  if (kfs.length === 0) return num(baseValue(clip, prop))
  const s = (us: Micros): string => num(us / 1_000_000)
  let expr = num(kfs[kfs.length - 1].value) // sau keyframe cuối: giữ giá trị cuối
  for (let i = kfs.length - 1; i >= 1; i--) {
    const a = kfs[i - 1]
    const b = kfs[i]
    const seg =
      b.time === a.time ? num(b.value) : `${num(a.value)}+(${num(b.value - a.value)})*(${timeExpr}-${s(a.time)})/${s(b.time - a.time)}`
    expr = `if(lt(${timeExpr},${s(b.time)}),${seg},${expr})`
  }
  return `if(lt(${timeExpr},${s(kfs[0].time)}),${num(kfs[0].value)},${expr})`
}

/** Số gọn cho biểu thức (bỏ số 0 thừa, không dùng dạng 1e-7). */
function num(v: number): string {
  return String(Number(v.toFixed(6)))
}

/** Clip có keyframe thuộc tính nào trong dự án không (dùng để báo/kiểm tra). */
export function projectHasKeyframes(project: Project): boolean {
  return project.tracks.some((t) => t.clips.some((c) => Object.keys(c.keyframes).length > 0))
}
