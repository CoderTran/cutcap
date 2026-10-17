// Lệnh keyframe cho giao diện: thêm/xóa keyframe tại đầu phát, nhảy tới keyframe trước/sau.
// Logic tính toán nằm ở @shared/timeline/keyframes (hàm thuần, có test).
import type { Clip, Id, KeyframeProp } from '@shared/project/schema'
import type { Micros } from '@shared/project/time'
import { clipEnd, findClip } from '@shared/timeline/clips'
import { clearKeyframes, moveKeyframes, neighborKeyframe, toggleKeyframe } from '@shared/timeline/keyframes'
import { editorStore } from './editorStore'
import { projectStore } from './projectStore'

/**
 * Thời điểm dùng để chỉnh / đặt keyframe cho clip: đầu phát, kẹp vào trong clip
 * (đầu phát nằm ngoài clip thì dùng mép gần nhất – không tạo keyframe ngoài clip).
 */
export function editTimeFor(clip: Clip, t: Micros = editorStore.getState().currentTime): Micros {
  return Math.min(clipEnd(clip) - 1, Math.max(clip.start, t))
}

/** Đầu phát có nằm trong clip không (nút keyframe chỉ dùng được khi đầu phát ở trong clip). */
export function playheadInside(clip: Clip, t: Micros): boolean {
  return t >= clip.start && t < clipEnd(clip)
}

/** Nút ◇ của một dòng thuộc tính (vd. "Kích thước" = ['scale'], "Vị trí" = ['x', 'y']). */
export function toggleKeyframeAt(clipId: Id, props: readonly KeyframeProp[]): void {
  const t = editorStore.getState().currentTime
  projectStore.getState().apply('history.keyframe', (d) => {
    const clip = findClip(d, clipId)?.clip
    if (clip && playheadInside(clip, t)) toggleKeyframe(clip, props, t)
  })
}

/** Xóa hết keyframe của các thuộc tính (giữ giá trị tại đầu phát). */
export function clearKeyframesOf(clipId: Id, props: readonly KeyframeProp[]): void {
  projectStore.getState().apply('history.clearKeyframes', (d) => {
    const clip = findClip(d, clipId)?.clip
    if (clip) clearKeyframes(clip, props, editTimeFor(clip))
  })
}

/**
 * Kéo dấu ◆ trên timeline từ `from` tới `to` (µs từ đầu clip). Cả lần kéo (cùng `session`) = 1 bước Undo.
 * @returns thời điểm mới (µs từ đầu clip) sau khi kẹp, để lần gọi sau kéo tiếp từ đó
 */
export function moveKeyframeTime(clipId: Id, from: Micros, to: Micros, session: string): Micros {
  let moved = from
  projectStore.getState().apply(
    'history.moveKeyframe',
    (d) => {
      const clip = findClip(d, clipId)?.clip
      if (clip) moved = moveKeyframes(clip, from, to)
    },
    { coalesceKey: session, coalesceWindowMs: 60_000 }
  )
  return moved
}

/** Mũi tên ‹ ›: nhảy đầu phát tới keyframe trước / sau. */
export function seekKeyframe(clipId: Id, props: readonly KeyframeProp[], dir: -1 | 1): void {
  const clip = findClip(projectStore.getState().project, clipId)?.clip
  if (!clip) return
  const t = neighborKeyframe(clip, props, editorStore.getState().currentTime, dir)
  if (t !== null) editorStore.getState().setCurrentTime(t)
}
