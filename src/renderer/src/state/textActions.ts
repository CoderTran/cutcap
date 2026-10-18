// Lệnh thao tác với chữ và vị trí lớp hình.
// `session`: mã của một lần kéo / một lần gõ – mọi thay đổi trong cùng phiên gộp thành 1 bước Undo.
import * as ops from '@shared/project/ops'
import type { Id, TextAnimation, TextClip, TextStyle, Transform } from '@shared/project/schema'
import { applyText, applyTextAnimation, applyTextStyle, applyTransform, applyTextAnim } from '@shared/timeline/clipProps'
import { canPlace, createTextClip, DEFAULT_TEXT_DURATION, findClip } from '@shared/timeline/clips'
import { editorStore } from './editorStore'
import { editTimeFor } from './keyframeActions'
import { projectStore } from './projectStore'

const coalesce = (session: string | undefined) =>
  session ? { coalesceKey: session, coalesceWindowMs: Number.POSITIVE_INFINITY } : undefined

/**
 * Thêm chữ tại đầu phát: dùng track chữ đầu tiên còn trống chỗ đó, không có thì tạo track chữ mới.
 * @returns id clip chữ mới
 */
/** Clip chữ theo mẫu (chưa thêm vào dự án) – dùng khi thêm và khi xem thử. */
export function textClipFromPreset(defaultText: string, start: number, preset?: { style?: Partial<TextStyle>; animationIn?: TextAnimation }): TextClip {
  const base = createTextClip(start, defaultText)
  return { ...base, style: { ...base.style, ...preset?.style }, animationIn: preset?.animationIn ?? base.animationIn }
}

export function addTextAtPlayhead(
  defaultText: string,
  preset?: { style?: Partial<TextStyle>; animationIn?: TextAnimation }
): Id {
  const { project, apply } = projectStore.getState()
  const start = editorStore.getState().currentTime
  const clip = textClipFromPreset(defaultText, start, preset)
  editorStore.getState().setTilePreview(null)
  const free = project.tracks.find((t) => t.kind === 'text' && !t.locked && canPlace(t, start, DEFAULT_TEXT_DURATION))
  apply('history.addText', (d) => ops.addClip(d, free?.id ?? ops.addTrack(d, 'text'), clip))
  editorStore.getState().setSelection([clip.id])
  return clip.id
}

export function setText(clipId: Id, text: string, session?: string): void {
  projectStore.getState().apply('history.editText', (d) => applyText(d, clipId, text), coalesce(session))
}

export function setTextStyle(clipId: Id, changes: Partial<TextStyle>, session?: string): void {
  projectStore.getState().apply('history.textStyle', (d) => applyTextStyle(d, clipId, changes), coalesce(session))
}

/** Đặt / bỏ hiệu ứng động Vào / Ra / Vòng lặp của chữ. */
export function setTextAnim(
  clipId: Id,
  kind: 'in' | 'out' | 'loop',
  value: { id: string; duration: number } | { id: string; period: number } | null,
  session?: string
): void {
  projectStore.getState().apply('history.textAnimation', (d) => applyTextAnim(d, clipId, kind, value), coalesce(session))
}

export function setTextAnimation(clipId: Id, animation: TextAnimation, duration: number, session?: string): void {
  projectStore
    .getState()
    .apply('history.textAnimation', (d) => applyTextAnimation(d, clipId, animation, duration), coalesce(session))
}

/** Đổi biến đổi tại đầu phát: thuộc tính đã có keyframe thì tạo/sửa keyframe ở đó (giống CapCut). */
export function setTransform(clipId: Id, changes: Partial<Transform>, session?: string): void {
  projectStore.getState().apply(
    'history.transform',
    (d) => {
      const clip = findClip(d, clipId)?.clip
      if (clip) applyTransform(d, clipId, changes, editTimeFor(clip))
    },
    coalesce(session)
  )
}
