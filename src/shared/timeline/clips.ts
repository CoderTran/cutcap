// Các phép tính về clip trên timeline: tạo clip từ media, kiểm tra chồng lấn, chọn track phù hợp.
// Hàm thuần – dùng chung cho giao diện, preview và (sau này) engine xuất video.
import { defaultColorAdjust, defaultTransform, createId } from '../project/factory'
import type { Clip, Id, MediaAsset, MediaClip, Project, TextClip, TextStyle, Track, TrackKind } from '../project/schema'
import { MICROS_PER_SECOND, type Micros } from '../project/time'

/** Ảnh tĩnh khi thả vào timeline sẽ dài bấy nhiêu (giống CapCut: 3 giây). */
export const DEFAULT_IMAGE_DURATION: Micros = 3 * MICROS_PER_SECOND

/** Clip chữ mới mặc định dài 3 giây. */
export const DEFAULT_TEXT_DURATION: Micros = 3 * MICROS_PER_SECOND

export function defaultTextStyle(): TextStyle {
  return {
    fontFamily: 'Segoe UI',
    fontSize: 80,
    color: '#ffffff',
    bold: true,
    italic: false,
    align: 'center',
    strokeColor: '#000000',
    strokeWidth: 4,
    backgroundColor: null
  }
}

/** Tạo clip chữ mới ở giữa khung hình. */
export function createTextClip(start: Micros, text: string): TextClip {
  return {
    id: createId(),
    type: 'text',
    start: Math.max(0, Math.round(start)),
    duration: DEFAULT_TEXT_DURATION,
    text,
    style: defaultTextStyle(),
    transform: defaultTransform(),
    // Giống CapCut: chữ mới không có hiệu ứng, để vừa thêm là thấy ngay trên khung Xem trước
    animationIn: 'none',
    animationDuration: 500_000
  }
}

/** Thời điểm kết thúc của clip trên timeline. */
export function clipEnd(clip: Pick<Clip, 'start' | 'duration'>): Micros {
  return clip.start + clip.duration
}

/** Tổng thời lượng dự án = điểm kết thúc của clip muộn nhất. */
export function projectDuration(project: Project): Micros {
  let end = 0
  for (const track of project.tracks) for (const clip of track.clips) end = Math.max(end, clipEnd(clip))
  return end
}

/** Media loại nào thì nằm trên track loại nào. */
export function trackKindForAsset(asset: MediaAsset): TrackKind {
  return asset.kind === 'audio' ? 'audio' : 'video'
}

/** Tạo clip mới dùng toàn bộ file media, bắt đầu tại `start`. */
export function createMediaClip(asset: MediaAsset, start: Micros): MediaClip {
  return {
    id: createId(),
    type: 'media',
    assetId: asset.id,
    start: Math.max(0, Math.round(start)),
    duration: asset.kind === 'image' ? DEFAULT_IMAGE_DURATION : Math.max(1, asset.durationUs),
    sourceIn: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    filter: null,
    filterIntensity: 1,
    adjust: defaultColorAdjust(),
    transform: defaultTransform(),
    transitionIn: null
  }
}

/**
 * Đoạn [start, start+duration) có trống trên track không.
 * @param ignoreIds các clip bỏ qua khi so (vd. chính clip đang được kéo)
 */
export function canPlace(track: Track, start: Micros, duration: Micros, ignoreIds: Id[] = []): boolean {
  if (start < 0) return false
  const end = start + duration
  return track.clips.every((c) => ignoreIds.includes(c.id) || end <= c.start || start >= clipEnd(c))
}

export interface DropTarget {
  /** Track sẽ nhận clip; null = cần tạo track mới loại `kind`. */
  trackId: Id | null
  kind: TrackKind
  start: Micros
}

/**
 * Quyết định thả media vào đâu.
 * - Thả đúng loại track, track không khóa, chỗ đó còn trống → đặt vào track đó.
 * - Ngược lại (sai loại, bị chồng, thả vào vùng trống) → tạo track mới, giống CapCut.
 */
export function resolveDrop(project: Project, asset: MediaAsset, trackId: Id | null, start: Micros): DropTarget {
  const kind = trackKindForAsset(asset)
  const clamped = Math.max(0, Math.round(start))
  const duration = asset.kind === 'image' ? DEFAULT_IMAGE_DURATION : asset.durationUs
  const track = project.tracks.find((t) => t.id === trackId)
  if (track && track.kind === kind && !track.locked && canPlace(track, clamped, duration)) {
    return { trackId: track.id, kind, start: clamped }
  }
  return { trackId: null, kind, start: clamped }
}

/**
 * Track chính kiểu CapCut: track video NẰM DƯỚI CÙNG (các track video phía trên là lớp phủ).
 * Với media âm thanh: track âm thanh đầu tiên.
 */
export function mainTrackFor(project: Project, kind: TrackKind): Track | undefined {
  const same = project.tracks.filter((t) => t.kind === kind && !t.locked)
  return kind === 'video' ? same.at(-1) : same[0]
}

/** Tìm clip theo id trên mọi track. */
export function findClip(project: Project, clipId: Id): { track: Track; clip: Clip } | null {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return { track, clip }
  }
  return null
}
