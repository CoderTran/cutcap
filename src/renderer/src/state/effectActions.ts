// Lệnh hiệu ứng video: thêm hiệu ứng tại đầu phát, đổi hiệu ứng của clip đang chọn.
import * as ops from '@shared/project/ops'
import type { Id } from '@shared/project/schema'
import { DEFAULT_EFFECT_DURATION } from '@shared/render/effects'
import { canPlace, createEffectClip, findClip } from '@shared/timeline/clips'
import { editorStore } from './editorStore'
import { projectStore } from './projectStore'

/**
 * Bấm ô hiệu ứng: thêm clip hiệu ứng dài 3 giây tại đầu phát, trên track "Hiệu ứng" còn trống
 * (không có thì tạo track mới – nằm trên cùng, tác động lên mọi thứ bên dưới). Chọn luôn clip mới.
 */
export function addEffectAtPlayhead(effectId: string): Id {
  const { project, apply } = projectStore.getState()
  const start = editorStore.getState().currentTime
  const clip = createEffectClip(start, effectId)
  editorStore.getState().setTilePreview(null)
  const free = project.tracks.find((t) => t.kind === 'effect' && !t.locked && canPlace(t, start, DEFAULT_EFFECT_DURATION))
  apply('history.addEffect', (d) => ops.addClip(d, free?.id ?? ops.addTrack(d, 'effect'), clip))
  editorStore.getState().setSelection([clip.id])
  return clip.id
}

/** Đổi sang hiệu ứng khác, giữ nguyên vị trí và độ dài clip. */
export function setEffectId(clipId: Id, effectId: string): void {
  projectStore.getState().apply('history.changeEffect', (d) => {
    const found = findClip(d, clipId)
    if (found?.clip.type === 'effect' && !found.track.locked) found.clip.effectId = effectId
  })
}
