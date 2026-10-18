// Sửa thông số mặt nạ (Điều chỉnh → Mặt nạ) – dùng chung cho bảng tùy chọn và khung kéo trên Xem trước.
// Đã có keyframe → tạo/cập nhật keyframe tại đầu phát (giống CapCut), chưa có → sửa thẳng giá trị.
import type { Id } from '@shared/project/schema'
import { findClip } from '@shared/timeline/clips'
import { setAnimatedValue, type MaskProp } from '@shared/timeline/keyframes'
import { editTimeFor } from './keyframeActions'
import { projectStore } from './projectStore'

export function setMaskValues(clipId: Id, values: Partial<Record<MaskProp, number>>, session?: string): void {
  projectStore.getState().apply(
    'history.mask',
    (d) => {
      const c = findClip(d, clipId)?.clip
      if (c?.type !== 'media' || !c.mask) return
      const t = editTimeFor(c)
      for (const [prop, value] of Object.entries(values) as [MaskProp, number][]) setAnimatedValue(c, prop, value, t)
    },
    session ? { coalesceKey: session, coalesceWindowMs: Number.POSITIVE_INFINITY } : undefined
  )
}
