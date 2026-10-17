// Lệnh đổi thuộc tính clip: tốc độ, âm lượng, fade.
// `session`: mã của một lần kéo thanh trượt – mọi thay đổi trong cùng một lần kéo gộp thành 1 bước Undo.
import type { Id, TransitionKind } from '@shared/project/schema'
import type { Micros } from '@shared/project/time'
import { applyColor, applyColorToAll, applyFades, applySpeed, applyVolume, type ColorChanges } from '@shared/timeline/clipProps'
import { applyTransition } from '@shared/timeline/transitions'
import { projectStore } from './projectStore'
import { minClipDuration } from './timelineActions'

/** Gộp theo phiên kéo (không giới hạn thời gian): dừng tay giữa chừng vẫn là 1 bước Undo. */
const coalesce = (session: string | undefined) =>
  session ? { coalesceKey: session, coalesceWindowMs: Number.POSITIVE_INFINITY } : undefined

export function setClipSpeed(clipId: Id, speed: number, session?: string): void {
  projectStore
    .getState()
    .apply('history.clipSpeed', (d) => applySpeed(d, clipId, speed, minClipDuration()), coalesce(session))
}

export function setClipVolume(clipId: Id, volume: number, session?: string): void {
  projectStore.getState().apply('history.clipVolume', (d) => applyVolume(d, clipId, volume), coalesce(session))
}

export function setClipFades(clipId: Id, fadeIn: Micros, fadeOut: Micros, session?: string): void {
  projectStore
    .getState()
    .apply('history.clipFade', (d) => applyFades(d, clipId, fadeIn, fadeOut), coalesce(session))
}

/** Đặt chuyển cảnh vào clip (từ clip ngay trước); kind null = bỏ chuyển cảnh. */
export function setTransition(clipId: Id, kind: TransitionKind | null, duration: Micros, session?: string): void {
  projectStore
    .getState()
    .apply('history.transition', (d) => applyTransition(d, clipId, kind, duration), coalesce(session))
}

export function setClipColor(clipId: Id, changes: ColorChanges, session?: string): void {
  projectStore.getState().apply('history.clipColor', (d) => applyColor(d, clipId, changes), coalesce(session))
}

/** @returns số clip đã được áp màu */
export function copyColorToAll(clipId: Id): number {
  let count = 0
  projectStore.getState().apply('history.colorToAll', (d) => {
    count = applyColorToAll(d, clipId)
  })
  return count
}
