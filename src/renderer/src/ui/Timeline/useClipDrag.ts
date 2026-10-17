// Kéo clip bằng chuột: di chuyển (kéo thân clip) và cắt mép (kéo 2 mép trái/phải).
//
// Trong lúc kéo, dự án KHÔNG bị sửa – ta chỉ tính "bóng" (vị trí mới) để vẽ lên timeline.
// Chỉ khi thả chuột mới ghi vào dự án đúng 1 lần → 1 bước Undo, và không làm chậm khi kéo.
// Nhấn Esc trong lúc kéo để hủy.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Id, Track } from '@shared/project/schema'
import type { Micros } from '@shared/project/time'
import { clipEnd, findClip } from '@shared/timeline/clips'
import { editableClipIds, planMove, trimBounds, type ClipMove } from '@shared/timeline/edit'
import { pxToTime } from '@shared/timeline/ruler'
import { collectSnapPoints, snapSpan } from '@shared/timeline/snap'
import { editorStore } from '../../state/editorStore'
import { projectStore } from '../../state/projectStore'
import { minClipDuration, moveClips, trimClip } from '../../state/timelineActions'
import { RULER_HEIGHT, SNAP_PX, trackHeight } from './layout'

export type DragMode = 'move' | 'trim-start' | 'trim-end'

/** Một "bóng" clip: vị trí sẽ có nếu thả chuột bây giờ. */
export interface ClipGhost {
  clipId: Id
  trackId: Id
  start: Micros
  duration: Micros
}

export interface ClipDragPreview {
  mode: DragMode
  ghosts: ClipGhost[]
  valid: boolean
  snappedTo: Micros | null
}

interface Session {
  mode: DragMode
  clipId: Id
  clipIds: Id[]
  startX: number
  startY: number
  originStart: Micros
  originEnd: Micros
  moved: boolean
  /** Kết quả cuối cùng để ghi khi thả chuột. */
  commit: (() => void) | null
}

/** Chuột phải di chuyển quá bấy nhiêu pixel mới tính là kéo (tránh bấm chọn mà clip bị xê dịch). */
const DRAG_THRESHOLD_PX = 3

export function useClipDrag(
  contentRef: RefObject<HTMLDivElement | null>,
  tracks: Track[],
  offsets: number[]
): {
  preview: ClipDragPreview | null
  onClipPointerDown: (e: React.PointerEvent, clipId: Id, mode: DragMode) => void
} {
  const [preview, setPreview] = useState<ClipDragPreview | null>(null)
  const session = useRef<Session | null>(null)
  const cleanup = useRef<(() => void) | null>(null)

  // Dùng ref để hàm xử lý luôn thấy danh sách track mới nhất mà không phải tạo lại hàm
  const layout = useRef({ tracks, offsets })
  layout.current = { tracks, offsets }

  /** Track nằm dưới con trỏ chuột (null nếu không có). */
  const trackAt = (clientY: number): Id | null => {
    const content = contentRef.current?.getBoundingClientRect()
    if (!content) return null
    const y = clientY - content.top - RULER_HEIGHT
    const { tracks: ts, offsets: os } = layout.current
    const index = os.findIndex((top, i) => y >= top && y < top + trackHeight(ts[i]))
    return index >= 0 ? ts[index].id : null
  }

  const onMove = useCallback((e: PointerEvent) => {
    const s = session.current
    if (!s) return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (!s.moved && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
    s.moved = true

    const project = projectStore.getState().project
    const { pxPerSecond, currentTime, snapping } = editorStore.getState()
    const dt = pxToTime(dx, pxPerSecond)
    const threshold = snapping ? pxToTime(SNAP_PX, pxPerSecond) : 0
    const points = collectSnapPoints(project, currentTime, s.clipIds)
    const found = findClip(project, s.clipId)
    if (!found) return

    if (s.mode === 'move') {
      const snapped = snapSpan(s.originStart + dt, found.clip.duration, points, threshold)
      const target = s.clipIds.length === 1 ? trackAt(e.clientY) : null
      const plan = planMove(project, s.clipIds, snapped.start - s.originStart, target)
      const ghosts = plan.moves.map((m: ClipMove) => ({
        ...m,
        duration: findClip(project, m.clipId)!.clip.duration
      }))
      setPreview({ mode: 'move', ghosts, valid: plan.valid, snappedTo: snapped.snappedTo })
      s.commit = plan.valid ? () => moveClips(plan.moves) : null
      return
    }

    // Cắt mép: hít 1 điểm (độ dài 0), rồi kẹp trong giới hạn cho phép
    const edge = s.mode === 'trim-start' ? 'start' : 'end'
    const raw = (edge === 'start' ? s.originStart : s.originEnd) + dt
    const snapped = snapSpan(raw, 0, points, threshold)
    const bounds = trimBounds(project, s.clipId, edge, minClipDuration())
    if (!bounds) return
    const t = Math.min(bounds.max, Math.max(bounds.min, snapped.start))
    const ghost =
      edge === 'start'
        ? { clipId: s.clipId, trackId: found.track.id, start: t, duration: s.originEnd - t }
        : { clipId: s.clipId, trackId: found.track.id, start: s.originStart, duration: t - s.originStart }
    setPreview({ mode: s.mode, ghosts: [ghost], valid: true, snappedTo: t === snapped.start ? snapped.snappedTo : null })
    s.commit = () => trimClip(s.clipId, edge, t)
  }, [])

  const end = useCallback((commit: boolean) => {
    const s = session.current
    if (commit && s?.moved && s.commit) s.commit()
    session.current = null
    setPreview(null)
    cleanup.current?.()
    cleanup.current = null
  }, [])

  const onClipPointerDown = useCallback(
    (e: React.PointerEvent, clipId: Id, mode: DragMode) => {
      if (e.button !== 0) return
      e.stopPropagation() // không để vùng trống của track bắt sự kiện (sẽ bỏ chọn)
      const editor = editorStore.getState()
      const project = projectStore.getState().project

      // Ctrl/Shift + bấm: chọn thêm / bỏ chọn, không kéo
      if (e.ctrlKey || e.shiftKey) {
        editor.selectClip(clipId, true)
        return
      }
      if (!editor.selectedClipIds.includes(clipId)) editor.setSelection([clipId])

      const found = findClip(project, clipId)
      if (!found || found.track.locked) return // clip trên track khóa: chỉ chọn, không kéo

      const selected = editorStore.getState().selectedClipIds
      session.current = {
        mode,
        clipId,
        clipIds: mode === 'move' ? editableClipIds(project, selected) : [clipId],
        startX: e.clientX,
        startY: e.clientY,
        originStart: found.clip.start,
        originEnd: clipEnd(found.clip),
        moved: false,
        commit: null
      }

      const up = (): void => end(true)
      const key = (ev: KeyboardEvent): void => {
        if (ev.key === 'Escape') end(false)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', up)
      window.addEventListener('keydown', key)
      cleanup.current = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('keydown', key)
      }
    },
    [end, onMove]
  )

  // Gỡ listener nếu component bị hủy giữa lúc kéo
  useEffect(() => () => cleanup.current?.(), [])

  return { preview, onClipPointerDown }
}
