// "Tách âm thanh" (giống chuột phải → Tách âm thanh của CapCut):
// tiếng của một clip video được đưa xuống track âm thanh thành clip riêng, clip video bị tắt tiếng.
//
// Clip âm thanh mới dùng file .m4a đã trích xuất từ chính video đó (xem MediaService.extractAudio),
// nên khớp từng khung hình: cùng vị trí, cùng đoạn cắt, cùng tốc độ, âm lượng và fade như clip video.
import { isKaraokeFile } from '../media/derived'
import * as ops from '../project/ops'
import type { Id, MediaAsset, MediaClip, Project } from '../project/schema'
import { canPlace, createMediaClip, findClip } from './clips'

/** Clip này có tách âm thanh được không: clip video có tiếng, chưa tắt tiếng, track không khóa. */
export function canDetachAudio(project: Project, clipId: Id): boolean {
  const found = findClip(project, clipId)
  if (!found || found.track.locked || found.clip.type !== 'media') return false
  const asset = project.assets[found.clip.assetId]
  return asset?.kind === 'video' && asset.hasAudio && found.clip.volume > 0
}

/**
 * Tách âm thanh của một clip video.
 * @param audioAsset file âm thanh trích xuất từ video của clip (thêm vào thư viện nếu chưa có)
 * @returns id clip âm thanh mới, hoặc null nếu clip không tách được
 */
export function detachAudio(draft: Project, clipId: Id, audioAsset: MediaAsset): Id | null {
  if (!canDetachAudio(draft, clipId)) return null
  const video = findClip(draft, clipId)!.clip
  if (video.type !== 'media') return null
  if (!draft.assets[audioAsset.id]) ops.addAssets(draft, [audioAsset])

  const audio = {
    ...createMediaClip(audioAsset, video.start),
    duration: video.duration,
    sourceIn: video.sourceIn,
    speed: video.speed,
    volume: video.volume,
    fadeIn: video.fadeIn,
    fadeOut: video.fadeOut
  }
  // Keyframe âm lượng đi theo tiếng sang clip âm thanh
  if (video.keyframes.volume) {
    audio.keyframes = { volume: video.keyframes.volume.map((k) => ({ ...k })) }
    delete video.keyframes.volume
  }
  // Track âm thanh trên cùng còn trống đúng đoạn đó; không có thì tạo track mới (ngay dưới các track hình)
  const free = draft.tracks.find((t) => t.kind === 'audio' && !t.locked && canPlace(t, audio.start, audio.duration))
  ops.addClip(draft, free?.id ?? ops.addTrack(draft, 'audio'), audio)

  // Clip video giữ hình, tắt tiếng (fade tiếng không còn ý nghĩa)
  video.volume = 0
  video.fadeIn = 0
  video.fadeOut = 0
  return audio.id
}

// ───────────────────────── Xóa giọng hát (karaoke) ─────────────────────────

/** Clip này xóa giọng được không: clip âm thanh, hoặc clip video còn tiếng; chưa xóa giọng trước đó. */
export function canRemoveVocals(project: Project, clipId: Id): boolean {
  const found = findClip(project, clipId)
  if (!found || found.track.locked || found.clip.type !== 'media' || found.clip.vocalsRemovedFrom) return false
  const asset = project.assets[found.clip.assetId]
  if (!asset?.hasAudio || isKaraokeFile(asset.path)) return false
  return asset.kind === 'audio' || (asset.kind === 'video' && found.clip.volume > 0)
}

/**
 * Thay tiếng của clip bằng bản đã xóa giọng hát, nhớ lại bản gốc để "Khôi phục".
 *  - clip âm thanh: đổi sang file đã xóa giọng (giữ nguyên vị trí, đoạn cắt, âm lượng…)
 *  - clip video: tách âm thanh ra track riêng (bằng `plain` – tiếng gốc đã trích xuất) rồi xóa giọng
 *    trên clip âm thanh đó → "Khôi phục" sẽ trả clip âm thanh về tiếng gốc
 * @param plain bắt buộc với clip video: file tiếng gốc trích xuất từ video
 * @returns id clip đang phát bản đã xóa giọng, hoặc null nếu không làm được
 */
export function applyVocalRemoval(draft: Project, clipId: Id, karaoke: MediaAsset, plain?: MediaAsset): Id | null {
  if (!canRemoveVocals(draft, clipId)) return null
  let target = clipId
  if (draft.assets[(findClip(draft, clipId)!.clip as MediaClip).assetId]?.kind === 'video') {
    if (!plain) return null
    const detached = detachAudio(draft, clipId, plain)
    if (!detached) return null
    target = detached
  }
  const clip = findClip(draft, target)!.clip as MediaClip
  if (!draft.assets[karaoke.id]) ops.addAssets(draft, [karaoke])
  clip.vocalsRemovedFrom = clip.assetId
  clip.assetId = karaoke.id
  return clip.id
}

/** Nút "Khôi phục" dùng được không: clip đã xóa giọng và bản gốc vẫn còn trong thư viện. */
export function canRestoreVocals(project: Project, clipId: Id): boolean {
  const found = findClip(project, clipId)
  if (!found || found.track.locked || found.clip.type !== 'media') return false
  const from = found.clip.vocalsRemovedFrom
  return !!from && !!project.assets[from]
}

/** "Khôi phục": trả clip về tiếng gốc (có giọng hát). */
export function restoreVocals(draft: Project, clipId: Id): boolean {
  if (!canRestoreVocals(draft, clipId)) return false
  const clip = findClip(draft, clipId)!.clip as MediaClip
  clip.assetId = clip.vocalsRemovedFrom!
  clip.vocalsRemovedFrom = null
  return true
}
