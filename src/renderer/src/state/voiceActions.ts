// Xử lý âm thanh của clip (bảng phải → Âm thanh):
//   - Giảm tiếng ồn, Cải thiện giọng nói, Trình thay đổi giọng nói: FFmpeg xử lý BẢN GỐC theo một chuỗi
//     duy nhất ra file mới, clip chuyển sang dùng file đó (nhớ bản gốc – tắt hết là trả lại).
//   - Chuẩn hóa âm lượng: đo độ to (LUFS) rồi chỉnh Âm lượng của clip về mức chuẩn.
import type { Id } from '@shared/project/schema'
import { normalizeGain } from '@shared/render/audioMath'
import { audioFxKey, isAudioFxEmpty, type AudioFxSettings } from '@shared/render/voices'
import { clipEnd, findClip } from '@shared/timeline/clips'
import { applyAudioFx, audioFxSourceAssetId, canProcessAudio, clearAudioFx } from '@shared/timeline/detach'
import { editorStore } from './editorStore'
import { extractAudioAssets } from './mediaActions'
import { mediaStore, pathKey } from './mediaStore'
import { playRange } from './playbackActions'
import { projectStore } from './projectStore'

const NONE: AudioFxSettings = { voice: null, enhance: false, denoise: false }

/** Nghe thử: phát 3 giây từ đầu phát (nếu đầu phát nằm trong clip) hoặc từ đầu clip. */
function previewClip(clipId: Id): void {
  const clip = findClip(projectStore.getState().project, clipId)?.clip
  if (!clip) return
  const now = editorStore.getState().currentTime
  const from = now >= clip.start && now < clipEnd(clip) - 500_000 ? now : clip.start
  playRange(from, Math.min(3_000_000, clipEnd(clip) - from))
}

/** Thiết lập xử lý hiện tại của clip. */
export function audioFxOf(clipId: Id): AudioFxSettings {
  const clip = findClip(projectStore.getState().project, clipId)?.clip
  if (clip?.type !== 'media' || !clip.audioFx) return NONE
  const { voice, enhance, denoise } = clip.audioFx
  return { voice, enhance, denoise }
}

/**
 * Đổi thiết lập xử lý âm thanh (vd. { voice: 'robot' }, { denoise: true }). Tắt hết → về bản gốc.
 * @param labels.file nhãn trong tên file ở thư viện (vd. "giọng Robot · giảm ồn")
 * @returns mã lỗi ('no-audio', 'failed'…) hoặc null nếu xong
 */
export async function setAudioFx(
  clipId: Id,
  changes: Partial<AudioFxSettings>,
  labels: { file: (s: AudioFxSettings) => string; audioSuffix: string }
): Promise<string | null> {
  const p = projectStore.getState().project
  const clip = findClip(p, clipId)?.clip
  if (clip?.type !== 'media' || !canProcessAudio(p, clipId)) return null
  const next = { ...audioFxOf(clipId), ...changes }

  if (isAudioFxEmpty(next)) {
    projectStore.getState().apply('history.restoreVoice', (d) => void clearAudioFx(d, clipId))
    previewClip(clipId)
    return null
  }

  const sourceId = audioFxSourceAssetId(p, clipId)
  const source = sourceId ? p.assets[sourceId] : undefined
  if (!source) return 'missing'
  const media = mediaStore.getState()
  media.setImporting(true)
  try {
    const key = pathKey(source.path)
    const done = await extractAudioAssets([source.path], `(${labels.file(next)})`, `fx:${audioFxKey(next)}`)
    const processed = done.byVideo.get(key)
    if (!processed) return done.errors[0]?.error ?? 'failed'
    // Clip video vẫn giữ nguyên (không tách âm thanh ra track riêng) – chỉ phát bản đã xử lý thay tiếng gốc
    let ok = false
    projectStore.getState().apply('history.changeVoice', (d) => {
      ok = applyAudioFx(d, clipId, next, processed)
    })
    if (ok) previewClip(clipId)
    return null
  } finally {
    media.setImporting(false)
  }
}

/**
 * Chuẩn hóa âm lượng (bật): đo độ to đoạn file clip đang dùng, đặt Âm lượng để đạt mức chuẩn.
 * Tắt: trả lại âm lượng trước khi chuẩn hóa.
 * @returns mã lỗi ('silent' – không đo được) hoặc null
 */
export async function setLoudnessNormalized(clipId: Id, on: boolean): Promise<string | null> {
  const p = projectStore.getState().project
  const found = findClip(p, clipId)
  if (found?.clip.type !== 'media' || found.track.locked) return null
  if (!on) {
    projectStore.getState().apply('history.loudnorm', (d) => {
      const c = findClip(d, clipId)?.clip
      if (c?.type !== 'media' || !c.loudnorm) return
      c.volume = c.loudnorm.prevVolume
      c.loudnorm = null
    })
    return null
  }
  const clip = found.clip
  // Video đã xử lý âm thanh → đo bản đã xử lý (là tiếng đang phát)
  const asset = p.assets[clip.audioAssetId ?? clip.assetId]
  if (!asset?.hasAudio) return 'no-audio'
  const media = mediaStore.getState()
  media.setImporting(true)
  try {
    const measured = await window.cutcap.measureLoudness(asset.path, clip.sourceIn, Math.round(clip.duration * clip.speed))
    if (measured === null) return 'silent'
    projectStore.getState().apply('history.loudnorm', (d) => {
      const c = findClip(d, clipId)?.clip
      if (c?.type !== 'media') return
      c.loudnorm = { measured, prevVolume: c.loudnorm?.prevVolume ?? c.volume }
      c.volume = Math.round(normalizeGain(measured) * 100) / 100
    })
    return null
  } finally {
    media.setImporting(false)
  }
}
