// Xem thử khi mới CHỌN một ô (Văn bản, Hiệu ứng, Chuyển tiếp) – chưa thêm vào dự án:
// khung Xem trước vẽ một bản dự án "tạm" có thêm mục đó. Dự án thật không đổi (không vào lịch sử Undo, không lưu).
import { textAnimSpans } from '../render/textAnims'
import { MICROS_PER_SECOND, type Micros } from '../project/time'
import type { EffectClip, Id, Project, TextClip, Track, Transition } from '../project/schema'

/** Mã của clip / track tạm (để engine không cho bấm chọn trên khung Xem trước). */
export const PREVIEW_ID = '__tile-preview'

export type TilePreview =
  /** Chữ / hiệu ứng: đặt tạm trên cùng, chạy lặp tại đầu phát (video bên dưới đứng yên). */
  | { kind: 'clip'; clip: TextClip | EffectClip }
  /** Chuyển cảnh: gắn tạm vào clip sau mối cắt. */
  | { kind: 'transition'; clipId: Id; transition: Transition }

/** Chữ đứng yên sau hiệu ứng xuất hiện bấy nhiêu rồi mới lặp lại. */
const TEXT_HOLD: Micros = 1.5 * MICROS_PER_SECOND

/** Độ dài một vòng lặp của bản xem thử (0 = đứng yên). */
export function previewLoop(clip: TextClip | EffectClip): Micros {
  if (clip.type === 'effect') return clip.duration
  const { inUs } = textAnimSpans(clip)
  return inUs > 0 ? Math.min(clip.duration, inUs + TEXT_HOLD) : 0
}

/**
 * Dự án tạm để vẽ tại thời điểm `t`.
 * @param elapsed thời gian từ lúc bắt đầu xem thử – chữ / hiệu ứng chạy lặp mà không phải tua video
 *                (clip tạm được dời sao cho tại `t` nó đang ở đúng thời điểm của vòng lặp)
 */
export function withTilePreview(project: Project, preview: TilePreview, t: Micros, elapsed: Micros): Project {
  if (preview.kind === 'transition') {
    return {
      ...project,
      tracks: project.tracks.map((tr) =>
        tr.clips.some((c) => c.id === preview.clipId)
          ? {
              ...tr,
              clips: tr.clips.map((c) => (c.id === preview.clipId && c.type === 'media' ? { ...c, transitionIn: preview.transition } : c))
            }
          : tr
      )
    }
  }
  const loop = previewLoop(preview.clip)
  const local = loop > 0 ? elapsed % loop : 0
  const clip = { ...preview.clip, id: PREVIEW_ID, start: t - local }
  const track: Track = {
    id: PREVIEW_ID,
    kind: clip.type === 'effect' ? 'effect' : 'text',
    name: '',
    muted: true,
    hidden: false,
    locked: true,
    clips: [clip]
  }
  return { ...project, tracks: [track, ...project.tracks] }
}
