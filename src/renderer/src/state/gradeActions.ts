// Điều chỉnh màu (bảng phải → Điều chỉnh): sửa thông số màu của clip, có Undo.
// `session`: một lần kéo (thanh trượt, điểm đường cong, vòng tròn màu) = 1 bước Undo.
import type { Draft } from 'immer'
import type { Id } from '@shared/project/schema'
import { emptyGrade, isGradeEmpty, type ColorGrade } from '@shared/render/grade'
import { findClip } from '@shared/timeline/clips'
import { projectStore } from './projectStore'

const coalesce = (session?: string) => (session ? { coalesceKey: session, coalesceWindowMs: Number.POSITIVE_INFINITY } : undefined)

/** Sửa thông số màu (tạo mới nếu chưa có). Không còn chỉnh gì (và không bật Bảo vệ màu da) → bỏ hẳn. */
export function updateGrade(clipId: Id, recipe: (g: Draft<ColorGrade>) => void, session?: string): void {
  projectStore.getState().apply(
    'history.grade',
    (d) => {
      const c = findClip(d, clipId)?.clip
      if (c?.type !== 'media') return
      c.grade ??= emptyGrade()
      recipe(c.grade)
      if (isGradeEmpty(c.grade) && !c.grade.skinProtect) c.grade = null
    },
    coalesce(session)
  )
}
