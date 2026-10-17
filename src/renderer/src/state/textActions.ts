// Lệnh thao tác với chữ và vị trí lớp hình.
// `session`: mã của một lần kéo / một lần gõ – mọi thay đổi trong cùng phiên gộp thành 1 bước Undo.
import * as ops from '@shared/project/ops'
import type { Id, TextAnimation, TextStyle, Transform } from '@shared/project/schema'
import { applyText, applyTextAnimation, applyTextStyle, applyTransform } from '@shared/timeline/clipProps'
import { canPlace, createTextClip, DEFAULT_TEXT_DURATION } from '@shared/timeline/clips'
import { editorStore } from './editorStore'
import { projectStore } from './projectStore'

const coalesce = (session: string | undefined) =>
  session ? { coalesceKey: session, coalesceWindowMs: Number.POSITIVE_INFINITY } : undefined

/**
 * Thêm chữ tại đầu phát: dùng track chữ đầu tiên còn trống chỗ đó, không có thì tạo track chữ mới.
 * @returns id clip chữ mới
 */
export function addTextAtPlayhead(
  defaultText: string,
  preset?: { style?: Partial<TextStyle>; animationIn?: TextAnimation }
): Id {
  const { project, apply } = projectStore.getState()
  const start = editorStore.getState().currentTime
  const base = createTextClip(start, defaultText)
  const clip = { ...base, style: { ...base.style, ...preset?.style }, animationIn: preset?.animationIn ?? base.animationIn }
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

export function setTextAnimation(clipId: Id, animation: TextAnimation, duration: number, session?: string): void {
  projectStore
    .getState()
    .apply('history.textAnimation', (d) => applyTextAnimation(d, clipId, animation, duration), coalesce(session))
}

export function setTransform(clipId: Id, changes: Partial<Transform>, session?: string): void {
  projectStore.getState().apply('history.transform', (d) => applyTransform(d, clipId, changes), coalesce(session))
}
