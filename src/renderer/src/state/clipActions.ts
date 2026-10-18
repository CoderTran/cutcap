// Lệnh đổi thuộc tính clip: tốc độ, âm lượng, fade.
// `session`: mã của một lần kéo thanh trượt – mọi thay đổi trong cùng một lần kéo gộp thành 1 bước Undo.
import type { Id, TransitionKind } from '@shared/project/schema'
import type { Micros } from '@shared/project/time'
import { applyColor, applyColorToAll, applyFades, applySpeed, applySpeedCurve, applyVolume, type ColorChanges } from '@shared/timeline/clipProps'
import type { SpeedCurve } from '@shared/timeline/speedCurve'
import { applyTransition } from '@shared/timeline/transitions'
import { findClip } from '@shared/timeline/clips'
import { editTimeFor } from './keyframeActions'
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

/** Tốc độ → Uốn cong: đặt đường cong (null = bỏ, về tốc độ đều). Một lần kéo điểm = 1 bước Undo. */
export function setClipSpeedCurve(clipId: Id, curve: SpeedCurve | null, session?: string): void {
  projectStore
    .getState()
    .apply('history.speedCurve', (d) => void applySpeedCurve(d, clipId, curve, minClipDuration()), coalesce(session))
}

export function setClipVolume(clipId: Id, volume: number, session?: string): void {
  projectStore.getState().apply(
    'history.clipVolume',
    (d) => {
      const clip = findClip(d, clipId)?.clip
      if (clip) applyVolume(d, clipId, volume, editTimeFor(clip)) // đã có keyframe → keyframe tại đầu phát
    },
    coalesce(session)
  )
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
