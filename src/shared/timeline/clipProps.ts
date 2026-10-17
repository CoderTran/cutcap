// Thuộc tính của clip: tốc độ, âm lượng, fade in/out.
// Hàm "âm lượng tại thời điểm t" (clipGainAt) dùng CHUNG cho preview và xuất video → nghe giống nhau.
import type { Clip, ColorAdjust, Id, MediaClip, Project, TextAnimation, TextStyle, Transform } from '../project/schema'
import type { Micros } from '../project/time'
import { clipEnd, findClip } from './clips'

export const MIN_SPEED = 0.25
export const MAX_SPEED = 4
export const MAX_VOLUME = 2 // 200%

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

// ───────────────────────── Tốc độ ─────────────────────────

export interface SpeedResult {
  speed: number
  /** Độ dài mới trên timeline. */
  duration: Micros
  /** true = clip bị cắt bớt vì sẽ đè lên clip phía sau. */
  truncated: boolean
}

/**
 * Tính kết quả khi đổi tốc độ: GIỮ NGUYÊN đoạn lấy trong file gốc, độ dài trên timeline co giãn.
 * Ví dụ clip 10s, tăng lên 2× → còn 5s; giảm xuống 0.5× → thành 20s.
 * Nếu dài ra mà chạm clip phía sau → cắt bớt cho vừa (không đẩy clip khác đi).
 */
export function planSpeed(project: Project, clipId: Id, speed: number, minDuration: Micros): SpeedResult | null {
  const found = findClip(project, clipId)
  if (!found || found.clip.type !== 'media') return null
  const { track, clip } = found
  const s = clamp(speed, MIN_SPEED, MAX_SPEED)
  const sourceSpan = clip.duration * clip.speed
  const wanted = Math.round(sourceSpan / s)
  const next = track.clips[track.clips.indexOf(clip) + 1]
  const room = next ? next.start - clip.start : Number.MAX_SAFE_INTEGER
  const duration = Math.max(minDuration, Math.min(wanted, room))
  return { speed: s, duration, truncated: duration < wanted }
}

export function applySpeed(draft: Project, clipId: Id, speed: number, minDuration: Micros): void {
  const plan = planSpeed(draft, clipId, speed, minDuration)
  const clip = findClip(draft, clipId)?.clip
  if (!plan || !clip || clip.type !== 'media') return
  clip.speed = plan.speed
  clip.duration = plan.duration
  clampFades(clip)
}

// ───────────────────────── Âm lượng & fade ─────────────────────────

export function applyVolume(draft: Project, clipId: Id, volume: number): void {
  const clip = findClip(draft, clipId)?.clip
  if (clip?.type === 'media') clip.volume = clamp(Math.round(volume * 100) / 100, 0, MAX_VOLUME)
}

export function applyFades(draft: Project, clipId: Id, fadeIn: Micros, fadeOut: Micros): void {
  const clip = findClip(draft, clipId)?.clip
  if (clip?.type !== 'media') return
  clip.fadeIn = Math.max(0, Math.round(fadeIn))
  clip.fadeOut = Math.max(0, Math.round(fadeOut))
  clampFades(clip)
}

/** Đảm bảo fade in + fade out không dài hơn clip (gọi sau khi cắt, tách, đổi tốc độ). */
export function clampFades(clip: Clip): void {
  if (clip.type !== 'media') return
  clip.fadeIn = Math.min(clip.fadeIn, clip.duration)
  clip.fadeOut = Math.min(clip.fadeOut, clip.duration - clip.fadeIn)
}

/** Độ dài fade thực tế (đã kẹp) – an toàn kể cả khi dữ liệu chưa được kẹp. */
export function effectiveFades(clip: MediaClip): { fadeIn: Micros; fadeOut: Micros } {
  const fadeIn = Math.min(clip.fadeIn, clip.duration)
  return { fadeIn, fadeOut: Math.min(clip.fadeOut, clip.duration - fadeIn) }
}

/**
 * Hệ số âm lượng của clip tại thời điểm t (0 = im lặng, 1 = gốc, 2 = gấp đôi).
 * Fade tuyến tính; fade in × fade out nhân với nhau – giống hệt bộ lọc afade của FFmpeg khi xuất.
 */
export function clipGainAt(clip: MediaClip, t: Micros): number {
  // Ngoài clip (phần kéo dài do chuyển cảnh): im lặng – âm thanh luôn cắt gọn tại mối cắt
  if (t < clip.start || t >= clipEnd(clip)) return 0
  const { fadeIn, fadeOut } = effectiveFades(clip)
  const local = t - clip.start
  const remaining = clipEnd(clip) - t
  const fin = fadeIn > 0 ? clamp(local / fadeIn, 0, 1) : 1
  const fout = fadeOut > 0 ? clamp(remaining / fadeOut, 0, 1) : 1
  return clip.volume * fin * fout
}

// ───────────────────────── Chữ & vị trí ─────────────────────────

export function applyText(draft: Project, clipId: Id, text: string): void {
  const clip = findClip(draft, clipId)?.clip
  if (clip?.type === 'text') clip.text = text
}

export function applyTextStyle(draft: Project, clipId: Id, changes: Partial<TextStyle>): void {
  const clip = findClip(draft, clipId)?.clip
  if (clip?.type !== 'text') return
  Object.assign(clip.style, changes)
  clip.style.fontSize = clamp(clip.style.fontSize, 8, 400)
  clip.style.strokeWidth = clamp(clip.style.strokeWidth, 0, 40)
}

export function applyTextAnimation(draft: Project, clipId: Id, animation: TextAnimation, duration: number): void {
  const clip = findClip(draft, clipId)?.clip
  if (clip?.type !== 'text') return
  clip.animationIn = animation
  clip.animationDuration = Math.round(clamp(duration, 100_000, 5_000_000))
}

/** Đổi vị trí / kích thước / xoay / độ mờ của lớp hình (video, ảnh, chữ). */
export function applyTransform(draft: Project, clipId: Id, changes: Partial<Transform>): void {
  const clip = findClip(draft, clipId)?.clip
  if (!clip) return
  Object.assign(clip.transform, changes)
  const t = clip.transform
  t.x = clamp(t.x, -0.5, 1.5) // cho phép kéo ra ngoài khung một nửa
  t.y = clamp(t.y, -0.5, 1.5)
  t.scale = clamp(t.scale, 0.05, 10)
  t.opacity = clamp(t.opacity, 0, 1)
}

// ───────────────────────── Màu sắc ─────────────────────────

export interface ColorChanges {
  filter?: string | null
  filterIntensity?: number
  adjust?: Partial<ColorAdjust>
}

export function applyColor(draft: Project, clipId: Id, changes: ColorChanges): void {
  const clip = findClip(draft, clipId)?.clip
  if (clip?.type !== 'media') return
  if (changes.filter !== undefined) clip.filter = changes.filter
  if (changes.filterIntensity !== undefined) clip.filterIntensity = clamp(changes.filterIntensity, 0, 1)
  if (changes.adjust) {
    for (const key of ['brightness', 'contrast', 'saturation'] as const) {
      const v = changes.adjust[key]
      if (v !== undefined) clip.adjust[key] = clamp(Math.round(v), -100, 100)
    }
  }
}

/**
 * Chép màu (bộ lọc + chỉnh tay) của một clip sang MỌI clip video/ảnh khác trong dự án.
 * @returns số clip đã đổi
 */
export function applyColorToAll(draft: Project, sourceClipId: Id): number {
  const source = findClip(draft, sourceClipId)?.clip
  if (source?.type !== 'media') return 0
  let count = 0
  for (const track of draft.tracks) {
    if (track.locked) continue
    for (const clip of track.clips) {
      if (clip.type !== 'media' || clip.id === source.id || draft.assets[clip.assetId]?.kind === 'audio') continue
      clip.filter = source.filter
      clip.filterIntensity = source.filterIntensity
      clip.adjust = { ...source.adjust }
      count++
    }
  }
  return count
}
