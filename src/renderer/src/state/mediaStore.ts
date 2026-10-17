// Trạng thái HIỂN THỊ của media (thumbnail, proxy, lỗi nhập) – KHÔNG lưu vào dự án,
// không có Undo. Dữ liệu lưu vào dự án (MediaAsset) nằm trong projectStore.
import { createStore, useStore } from 'zustand'
import type { MediaImportErrorCode, MediaPreview } from '@shared/ipc'

/** Khóa đường dẫn trên Windows: không phân biệt hoa/thường và dấu "/" hay "\". */
export const pathKey = (p: string): string => p.replace(/\//g, '\\').toLowerCase()

export interface ImportError {
  path: string
  /** Lỗi nhập file, hoặc lỗi trích xuất âm thanh ('no-audio' | 'failed'). */
  error: MediaImportErrorCode | 'no-audio' | 'failed'
}

export interface MediaState {
  /** Thông tin hiển thị theo đường dẫn file. */
  previews: Record<string, MediaPreview>
  /** Lỗi của lần nhập gần nhất (để hiện thông báo). */
  importErrors: ImportError[]
  importing: boolean

  setPreview(preview: MediaPreview): void
  setImportErrors(errors: ImportError[]): void
  setImporting(importing: boolean): void
}

export const mediaStore = createStore<MediaState>()((set) => ({
  previews: {},
  importErrors: [],
  importing: false,

  setPreview: (preview) => set((s) => ({ previews: { ...s.previews, [pathKey(preview.path)]: preview } })),
  setImportErrors: (importErrors) => set({ importErrors }),
  setImporting: (importing) => set({ importing })
}))

export function useMediaStore<T>(selector: (s: MediaState) => T): T {
  return useStore(mediaStore, selector)
}

/** Hook: thông tin hiển thị của một file (undefined = chưa chuẩn bị xong). */
export function useMediaPreview(path: string): MediaPreview | undefined {
  return useMediaStore((s) => s.previews[pathKey(path)])
}
