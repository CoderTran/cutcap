// Ảnh bìa (nút "Ảnh bìa" ở đầu track chính, nút "Sửa ảnh bìa" trong hộp thoại Xuất).
// Lưu ở project.cover; lúc xuất, khung hình / ảnh được nhúng vào file mp4 (xem main/export/exporter.ts).
import { createStore, useStore } from 'zustand'
import type { ProjectCover } from '@shared/project/schema'
import { projectStore } from './projectStore'

/** Cạnh dài của ảnh nhỏ lưu trong dự án (chỉ để hiện trên giao diện). */
const THUMB_SIDE = 480

const coverStore = createStore<{ open: boolean }>()(() => ({ open: false }))
export const useCoverDialogOpen = (): boolean => useStore(coverStore, (s) => s.open)
export const isCoverDialogOpen = (): boolean => coverStore.getState().open
export const openCoverDialog = (): void => coverStore.setState({ open: true })
export const closeCoverDialog = (): void => coverStore.setState({ open: false })

export function setCover(cover: ProjectCover | null): void {
  projectStore.getState().apply('history.cover', (d) => {
    d.cover = cover
  })
}

/** Thu nhỏ một hình (khung Xem trước, ảnh đã tải) thành JPEG data URL. */
export function thumbnailOf(source: HTMLCanvasElement | HTMLImageElement, width: number, height: number): string | null {
  if (width === 0 || height === 0) return null
  const k = Math.min(1, THUMB_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * k))
  canvas.height = Math.max(1, Math.round(height * k))
  try {
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null // ảnh không đọc được điểm ảnh (vd. bị trình duyệt chặn)
  }
}

/** Đường dẫn file trên máy → URL giao thức cutcap-media (giống main/media/mediaUrl.ts). */
export const localImageUrl = (path: string): string => `cutcap-media://local/${encodeURIComponent(path)}`
