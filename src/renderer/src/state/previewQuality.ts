// Chất lượng khung Xem trước (Đầy đủ / Cao / Trung bình / Thấp) – nhớ theo máy, áp dụng cho mọi dự án.
// Chỉ đổi bản dùng để XEM; video xuất ra luôn lấy file gốc.
import { createStore, useStore } from 'zustand'
import { PREVIEW_QUALITIES, type PreviewQuality } from '@shared/ipc'

const KEY = 'cutcap.previewQuality'
/** Mặc định "Cao" (1080p): nét mà vẫn mượt trên máy thường. */
const DEFAULT: PreviewQuality = 'high'

function saved(): PreviewQuality {
  try {
    const v = localStorage.getItem(KEY)
    if (v && (PREVIEW_QUALITIES as string[]).includes(v)) return v as PreviewQuality
  } catch {
    // bộ nhớ trình duyệt bị chặn → mặc định
  }
  return DEFAULT
}

export const previewQualityStore = createStore<{ quality: PreviewQuality }>()(() => ({ quality: saved() }))

export const usePreviewQuality = (): PreviewQuality => useStore(previewQualityStore, (s) => s.quality)

/** Gửi chất lượng đã nhớ cho main lúc mở app (trước khi nạp media). */
export function initPreviewQuality(): Promise<void> {
  return window.cutcap.setPreviewQuality(previewQualityStore.getState().quality)
}

export function setPreviewQuality(quality: PreviewQuality): void {
  previewQualityStore.setState({ quality })
  try {
    localStorage.setItem(KEY, quality)
  } catch {
    // không lưu được thì chỉ có hiệu lực trong lần mở này
  }
  void window.cutcap.setPreviewQuality(quality)
}
