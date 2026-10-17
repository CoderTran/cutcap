// Trạng thái của TRÌNH CHỈNH SỬA (không phải của dự án): vị trí đầu phát, mức zoom, clip đang chọn…
// Không lưu vào file, không có Undo – giống CapCut: Ctrl+Z không làm đầu phát nhảy về chỗ cũ.
import { createStore, useStore } from 'zustand'
import type { Id } from '@shared/project/schema'
import type { Micros } from '@shared/project/time'
import type { ClipboardItem } from '@shared/timeline/edit'
import { DEFAULT_PX_PER_SECOND, clampZoom } from '@shared/timeline/ruler'

export interface EditorState {
  /** Vị trí đầu phát (playhead). */
  currentTime: Micros
  /** Đang phát preview. Chỉ PreviewEngine được đổi giá trị này (qua setPlaying). */
  playing: boolean
  /** Mức zoom timeline: số pixel cho 1 giây. */
  pxPerSecond: number
  selectedClipIds: Id[]
  /** Media đang được kéo từ thư viện (dragover không đọc được dữ liệu kéo, nên lưu ở đây). */
  draggingAssetId: Id | null
  /** Clip đã sao chép (Ctrl+C) – chỉ trong phiên làm việc, không dùng clipboard của Windows. */
  clipboard: ClipboardItem[]
  /** Đang rê chuột lên một bộ lọc: preview tạm áp bộ lọc đó cho clip (không đổi dự án). */
  filterPreview: { clipId: Id; filter: string | null } | null

  setCurrentTime(t: Micros): void
  setZoom(pxPerSecond: number): void
  setPlaying(playing: boolean): void
  /** Chọn clip. additive = giữ Ctrl/Shift để chọn thêm/bỏ chọn. */
  selectClip(clipId: Id, additive?: boolean): void
  setSelection(clipIds: Id[]): void
  clearSelection(): void
  setDraggingAsset(assetId: Id | null): void
  setClipboard(items: ClipboardItem[]): void
  setFilterPreview(preview: { clipId: Id; filter: string | null } | null): void
}

export const editorStore = createStore<EditorState>()((set) => ({
  currentTime: 0,
  playing: false,
  pxPerSecond: DEFAULT_PX_PER_SECOND,
  selectedClipIds: [],
  draggingAssetId: null,
  clipboard: [],
  filterPreview: null,

  setCurrentTime: (t) => set({ currentTime: Math.max(0, Math.round(t)) }),
  setZoom: (pxPerSecond) => set({ pxPerSecond: clampZoom(pxPerSecond) }),
  setPlaying: (playing) => set({ playing }),
  selectClip: (clipId, additive = false) =>
    set((s) => {
      if (!additive) return { selectedClipIds: [clipId] }
      const has = s.selectedClipIds.includes(clipId)
      return { selectedClipIds: has ? s.selectedClipIds.filter((id) => id !== clipId) : [...s.selectedClipIds, clipId] }
    }),
  setSelection: (selectedClipIds) => set({ selectedClipIds }),
  clearSelection: () => set({ selectedClipIds: [] }),
  setDraggingAsset: (draggingAssetId) => set({ draggingAssetId }),
  setClipboard: (clipboard) => set({ clipboard }),
  setFilterPreview: (filterPreview) => set({ filterPreview })
}))

export function useEditorStore<T>(selector: (s: EditorState) => T): T {
  return useStore(editorStore, selector)
}
