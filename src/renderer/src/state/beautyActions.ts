// Làm đẹp (Video → Làm đẹp → Làn da): đổi từng mức, bật/tắt cả nhóm, đặt lại.
// `session`: một lần kéo thanh trượt = 1 bước Undo.
import { emptyBeauty, isBeautyEmpty, type Beauty, type BeautyKey } from '@shared/render/beauty'
import { emptyFaceShape, faceShapeMin, isFaceShapeEmpty, type FaceShape, type FaceShapeKey } from '@shared/render/faceShape'
import type { Id } from '@shared/project/schema'
import { findClip } from '@shared/timeline/clips'
import { projectStore } from './projectStore'

/** Bật "Làn da" lần đầu: mức vừa phải giống CapCut (làm mịn + trắng nhẹ). */
export const BEAUTY_DEFAULTS: Beauty = { ...emptyBeauty(), smooth: 40, whiten: 20 }

const coalesce = (session?: string) => (session ? { coalesceKey: session, coalesceWindowMs: Number.POSITIVE_INFINITY } : undefined)

export function setBeautyLevel(clipId: Id, key: BeautyKey, value: number, session?: string): void {
  projectStore.getState().apply(
    'history.beauty',
    (d) => {
      const c = findClip(d, clipId)?.clip
      if (c?.type !== 'media') return
      const next = { ...(c.beauty ?? emptyBeauty()), [key]: Math.min(100, Math.max(0, Math.round(value))) }
      c.beauty = isBeautyEmpty(next) ? null : next
    },
    coalesce(session)
  )
}

/** Bật: dùng mức mặc định · Tắt / Đặt lại: bỏ hết làm đẹp. */
export function setBeautyEnabled(clipId: Id, on: boolean): void {
  projectStore.getState().apply('history.beauty', (d) => {
    const c = findClip(d, clipId)?.clip
    if (c?.type === 'media') c.beauty = on ? { ...BEAUTY_DEFAULTS } : null
  })
}

// ───────── Khuôn mặt ─────────

/** Bật "Khuôn mặt" lần đầu: thon gọn nhẹ (giống CapCut). */
export const FACE_SHAPE_DEFAULTS: FaceShape = { ...emptyFaceShape(), slim: 30 }

export function setFaceShapeLevel(clipId: Id, key: FaceShapeKey, value: number, session?: string): void {
  projectStore.getState().apply(
    'history.faceShape',
    (d) => {
      const c = findClip(d, clipId)?.clip
      if (c?.type !== 'media') return
      const next = { ...(c.faceShape ?? emptyFaceShape()), [key]: Math.min(100, Math.max(faceShapeMin(key), Math.round(value))) }
      c.faceShape = isFaceShapeEmpty(next) ? null : next
    },
    coalesce(session)
  )
}

export function setFaceShapeEnabled(clipId: Id, on: boolean): void {
  projectStore.getState().apply('history.faceShape', (d) => {
    const c = findClip(d, clipId)?.clip
    if (c?.type === 'media') c.faceShape = on ? { ...FACE_SHAPE_DEFAULTS } : null
  })
}
