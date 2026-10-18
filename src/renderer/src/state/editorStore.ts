// Trạng thái của TRÌNH CHỈNH SỬA (không phải của dự án): vị trí đầu phát, mức zoom, clip đang chọn…
// Không lưu vào file, không có Undo – giống CapCut: Ctrl+Z không làm đầu phát nhảy về chỗ cũ.
import { createStore, useStore } from 'zustand'
import type { Id } from '@shared/project/schema'
import type { Micros } from '@shared/project/time'
import type { ClipboardItem } from '@shared/timeline/edit'
import type { TilePreview } from '@shared/timeline/tilePreview'
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
  /** Đang chọn (chưa thêm) một ô Văn bản / Hiệu ứng / Chuyển tiếp → khung Xem trước vẽ thử. startedAt: performance.now(). */
  tilePreview: (TilePreview & { startedAt: number }) | null
  /** Tab bảng phải cần mở cho lần chọn hiện tại (vd. 'transition'); null = tab đầu tiên. */
  inspectorTab: string | null
  /** Hít (snap) khi kéo/thả clip – nút nam châm trên thanh công cụ timeline. */
  snapping: boolean
  /** Hút vào đoạn chính: clip trên track chính luôn nằm sát nhau (không khoảng trống), giống CapCut. */
  magnet: boolean
  /** Đang mở Điều chỉnh → Mặt nạ: khung Xem trước hiện khung kéo của mặt nạ thay cho khung chọn lớp. */
  maskEditing: boolean

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
  setTilePreview(preview: TilePreview | null): void
  /** Chọn clip và mở sẵn một tab của bảng phải. */
  selectWithTab(clipId: Id, tab: string): void
  toggleSnapping(): void
  setMagnet(on: boolean): void
  setMaskEditing(on: boolean): void
}

export const editorStore = createStore<EditorState>()((set) => ({
  currentTime: 0,
  playing: false,
  pxPerSecond: DEFAULT_PX_PER_SECOND,
  selectedClipIds: [],
  draggingAssetId: null,
  clipboard: [],
  filterPreview: null,
  tilePreview: null,
  inspectorTab: null,
  snapping: true,
  magnet: true,
  maskEditing: false,

  setCurrentTime: (t) => set({ currentTime: Math.max(0, Math.round(t)) }),
  setZoom: (pxPerSecond) => set({ pxPerSecond: clampZoom(pxPerSecond) }),
  setPlaying: (playing) => set({ playing }),
  selectClip: (clipId, additive = false) =>
    set((s) => {
      if (!additive) return { selectedClipIds: [clipId], inspectorTab: null }
      const has = s.selectedClipIds.includes(clipId)
      return { selectedClipIds: has ? s.selectedClipIds.filter((id) => id !== clipId) : [...s.selectedClipIds, clipId] }
    }),
  setSelection: (selectedClipIds) => set({ selectedClipIds, inspectorTab: null }),
  clearSelection: () => set({ selectedClipIds: [] }),
  setDraggingAsset: (draggingAssetId) => set({ draggingAssetId }),
  setClipboard: (clipboard) => set({ clipboard }),
  setFilterPreview: (filterPreview) => set({ filterPreview }),
  setTilePreview: (preview) => set({ tilePreview: preview ? { ...preview, startedAt: performance.now() } : null }),
  selectWithTab: (clipId, inspectorTab) => set({ selectedClipIds: [clipId], inspectorTab }),
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),
  setMagnet: (magnet) => set({ magnet }),
  setMaskEditing: (maskEditing) => set({ maskEditing })
}))

export function useEditorStore<T>(selector: (s: EditorState) => T): T {
  return useStore(editorStore, selector)
}
