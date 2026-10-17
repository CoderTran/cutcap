// "Tách âm thanh" (giống chuột phải → Tách âm thanh của CapCut):
// tiếng của một clip video được đưa xuống track âm thanh thành clip riêng, clip video bị tắt tiếng.
//
// Clip âm thanh mới dùng file .m4a đã trích xuất từ chính video đó (xem MediaService.extractAudio),
// nên khớp từng khung hình: cùng vị trí, cùng đoạn cắt, cùng tốc độ, âm lượng và fade như clip video.
import { isKaraokeFile } from '../media/derived'
import type { AudioFxSettings } from '../render/voices'
import * as ops from '../project/ops'
import type { Id, MediaAsset, MediaClip, Project, Track } from '../project/schema'
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
  // Video đã xử lý âm thanh (giảm ồn, đổi giọng…) → clip âm thanh mang theo bản đã xử lý;
  // tiếng gốc vừa trích xuất làm "bản gốc" (tắt xử lý là trả về đó)
  const dub = video.audioAssetId && video.audioFx ? draft.assets[video.audioAssetId] : undefined
  if (dub && video.audioFx) {
    audio.assetId = dub.id
    audio.audioFx = { ...video.audioFx, original: audioAsset.id }
  }
  video.audioFx = null
  video.audioAssetId = null
  audio.loudnorm = video.loudnorm
  video.loudnorm = null
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

// ───────────────────────── Xử lý âm thanh (giảm ồn, cải thiện giọng, đổi giọng) ─────────────────────────

/** Clip này xử lý âm thanh được không: clip âm thanh, hoặc clip video còn tiếng; track không khóa. */
export function canProcessAudio(project: Project, clipId: Id): boolean {
  const found = findClip(project, clipId)
  if (!found || found.track.locked || found.clip.type !== 'media') return false
  if (found.clip.audioFx) return true
  const asset = project.assets[found.clip.assetId]
  if (!asset?.hasAudio) return false
  return asset.kind === 'audio' || (asset.kind === 'video' && found.clip.volume > 0)
}

/** File cần xử lý: luôn là bản GỐC (bật/tắt nhiều lần không bị chồng hiệu ứng). */
export function audioFxSourceAssetId(project: Project, clipId: Id): Id | null {
  const clip = findClip(project, clipId)?.clip
  if (clip?.type !== 'media') return null
  return clip.audioFx?.original ?? clip.assetId
}

/**
 * Áp thiết lập xử lý âm thanh: clip dùng file đã xử lý `processed`, nhớ bản gốc.
 *  - clip âm thanh: đổi file luôn
 *  - clip video: GIỮ NGUYÊN clip (không tách ra track riêng), chỉ phát `processed` thay cho tiếng gốc
 * @returns true nếu đã áp
 */
export function applyAudioFx(draft: Project, clipId: Id, settings: AudioFxSettings, processed: MediaAsset): boolean {
  if (!canProcessAudio(draft, clipId)) return false
  const clip = findClip(draft, clipId)!.clip as MediaClip
  if (!draft.assets[processed.id]) ops.addAssets(draft, [processed])
  const video = draft.assets[clip.assetId]?.kind === 'video'
  const previous = video ? clip.audioAssetId : clip.audioFx ? clip.assetId : null
  const original = clip.audioFx?.original ?? clip.assetId
  clip.audioFx = { ...settings, original }
  if (video) clip.audioAssetId = processed.id
  else clip.assetId = processed.id
  if (previous !== processed.id) dropIfUnused(draft, previous)
  return true
}

/**
 * File âm thanh đã xử lý (giảm ồn, rõ giọng, đổi giọng) đang được clip dùng: chỉ là "bản phụ" của clip,
 * không hiện trong thư viện media (người dùng không cần thấy / kéo nó ra như một file riêng).
 */
export function processedAudioAssetIds(tracks: Track[]): Set<Id> {
  const ids = new Set<Id>()
  for (const track of tracks) {
    for (const c of track.clips) {
      if (c.type !== 'media' || !c.audioFx) continue
      if (c.audioAssetId) ids.add(c.audioAssetId)
      else if (c.assetId !== c.audioFx.original) ids.add(c.assetId)
    }
  }
  return ids
}

/** Tắt hết xử lý ("Bản gốc"): trả clip về âm thanh gốc. */
export function clearAudioFx(draft: Project, clipId: Id): boolean {
  const found = findClip(draft, clipId)
  if (!found || found.track.locked || found.clip.type !== 'media' || !found.clip.audioFx) return false
  if (found.clip.audioAssetId) {
    // Clip video: bỏ file đã xử lý, phát lại tiếng của chính video
    const previous = found.clip.audioAssetId
    found.clip.audioAssetId = null
    found.clip.audioFx = null
    dropIfUnused(draft, previous)
    return true
  }
  if (!draft.assets[found.clip.audioFx.original]) return false
  const previous = found.clip.assetId
  found.clip.assetId = found.clip.audioFx.original
  found.clip.audioFx = null
  dropIfUnused(draft, previous)
  return true
}

/**
 * File đã xử lý cũ không còn clip nào dùng → bỏ khỏi thư viện (thử nhiều giọng không làm thư viện rối).
 * File vẫn còn trên ổ đĩa: chọn lại giọng đó thì dùng lại ngay, không phải xử lý lại.
 */
function dropIfUnused(draft: Project, assetId: Id | null): void {
  if (assetId && !ops.isAssetUsed(draft, assetId)) ops.removeAsset(draft, assetId)
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
