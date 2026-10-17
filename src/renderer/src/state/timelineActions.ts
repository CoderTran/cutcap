// Lệnh thao tác trên timeline: thả media, di chuyển, cắt mép, tách, xóa, sao chép/dán, chọn.
// Logic tính toán nằm ở @shared/timeline (hàm thuần, có test); file này chỉ nối với store.
import * as ops from '@shared/project/ops'
import type { Id } from '@shared/project/schema'
import { MICROS_PER_SECOND, type Micros } from '@shared/project/time'
import { createMediaClip, mainTrackFor, resolveDrop, trackKindForAsset } from '@shared/timeline/clips'
import {
  applyMoves,
  applyTrim,
  clipsToSplit,
  copyClips,
  deleteClips,
  editableClipIds,
  pasteClips,
  splitClip,
  type ClipMove,
  type TrimEdge
} from '@shared/timeline/edit'
import { editorStore } from './editorStore'
import { projectStore } from './projectStore'

const project = () => projectStore.getState().project
const apply = (...args: Parameters<ReturnType<typeof projectStore.getState>['apply']>): void =>
  projectStore.getState().apply(...args)

/** Độ dài tối thiểu của clip = 1 frame theo fps của dự án. */
export function minClipDuration(): Micros {
  return Math.round(MICROS_PER_SECOND / project().settings.fps)
}

/**
 * Thả media từ thư viện vào timeline.
 * @param trackId track nằm dưới con trỏ; null = thả vào vùng trống (tạo track mới)
 * @param start   thời điểm bắt đầu (đã hít/snap)
 * @returns id clip mới, hoặc null nếu không thả được
 */
export function dropAssetOnTimeline(assetId: Id, trackId: Id | null, start: Micros): Id | null {
  const asset = project().assets[assetId]
  if (!asset) return null

  const target = resolveDrop(project(), asset, trackId, start)
  const clip = createMediaClip(asset, target.start)
  // Tạo track (nếu cần) + thêm clip = 1 bước Undo duy nhất
  apply('history.addClip', (d) => {
    const id = target.trackId ?? ops.addTrack(d, target.kind)
    ops.addClip(d, id, clip)
  })
  editorStore.getState().setSelection([clip.id])
  return clip.id
}

/** Nút "+" trên thẻ media: thêm vào track chính tại đầu phát (chỗ đó bận thì tạo track mới). */
export function addAssetAtPlayhead(assetId: Id): Id | null {
  const asset = project().assets[assetId]
  if (!asset) return null
  const track = mainTrackFor(project(), trackKindForAsset(asset))
  return dropAssetOnTimeline(assetId, track?.id ?? null, editorStore.getState().currentTime)
}

/** Di chuyển clip (sau khi kéo thả). */
export function moveClips(moves: ClipMove[]): void {
  if (moves.length > 0) apply('history.moveClips', (d) => applyMoves(d, moves))
}

/** Kéo mép clip. */
export function trimClip(clipId: Id, edge: TrimEdge, time: Micros): void {
  apply('history.trimClip', (d) => applyTrim(d, clipId, edge, time, minClipDuration()))
}

/** Ctrl+B: tách tại đầu phát. Nửa sau được chọn để có thể tách tiếp / xóa ngay. */
export function splitAtPlayhead(): void {
  const { currentTime, selectedClipIds, setSelection } = editorStore.getState()
  const ids = clipsToSplit(project(), selectedClipIds, currentTime, minClipDuration())
  if (ids.length === 0) return
  const rightIds: Id[] = []
  apply('history.splitClip', (d) => {
    for (const id of ids) {
      const right = splitClip(d, id, currentTime, minClipDuration())
      if (right) rightIds.push(right)
    }
  })
  setSelection(rightIds)
}

/**
 * Q / W (giống CapCut): bỏ phần bên TRÁI (Q) hoặc bên PHẢI (W) của clip tại đầu phát.
 * Áp cho clip đang chọn nằm dưới đầu phát; không chọn thì mọi clip dưới đầu phát (track không khóa).
 */
export function trimAtPlayhead(side: 'left' | 'right'): void {
  const { currentTime, selectedClipIds } = editorStore.getState()
  const ids = clipsToSplit(project(), selectedClipIds, currentTime, minClipDuration())
  if (ids.length === 0) return
  apply(side === 'left' ? 'history.trimLeft' : 'history.trimRight', (d) => {
    for (const id of ids) applyTrim(d, id, side === 'left' ? 'start' : 'end', currentTime, minClipDuration())
  })
}

/** Delete: xóa clip đang chọn (bỏ qua clip trên track khóa). */
export function deleteSelected(): void {
  const ids = editableClipIds(project(), editorStore.getState().selectedClipIds)
  if (ids.length === 0) return
  apply('history.deleteClips', (d) => deleteClips(d, ids))
  editorStore.getState().clearSelection()
}

export function copySelected(): void {
  const ids = editorStore.getState().selectedClipIds
  if (ids.length > 0) editorStore.getState().setClipboard(copyClips(project(), ids))
}

export function cutSelected(): void {
  copySelected()
  deleteSelected()
}

/** Ctrl+V: dán tại đầu phát, chọn các clip vừa dán. */
export function paste(): void {
  const { clipboard, currentTime, setSelection } = editorStore.getState()
  if (clipboard.length === 0) return
  let ids: Id[] = []
  apply('history.pasteClips', (d) => {
    ids = pasteClips(d, clipboard, currentTime)
  })
  setSelection(ids)
}

/** Ctrl+A: chọn mọi clip trên các track không khóa. */
export function selectAll(): void {
  const ids = project()
    .tracks.filter((t) => !t.locked)
    .flatMap((t) => t.clips.map((c) => c.id))
  editorStore.getState().setSelection(ids)
}

/** Bỏ chọn các clip không còn tồn tại (vd. sau khi Undo thao tác thêm clip). */
export function pruneSelection(): void {
  const { selectedClipIds, setSelection } = editorStore.getState()
  if (selectedClipIds.length === 0) return
  const existing = new Set(project().tracks.flatMap((t) => t.clips.map((c) => c.id)))
  const kept = selectedClipIds.filter((id) => existing.has(id))
  if (kept.length !== selectedClipIds.length) setSelection(kept)
}
