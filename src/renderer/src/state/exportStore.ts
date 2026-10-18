// Trạng thái xuất video phía giao diện + các lệnh mở hộp thoại / bắt đầu / hủy.
import { createStore, useStore } from 'zustand'
import type { EncoderId, ExportProgress, ExportResult, ExportSettings } from '@shared/ipc'
import { canvasSize } from '@shared/project/canvas'
import { BeautyCancelled, renderBeautyClips } from '../engine/beauty/renderBeautyClips'
import { renderEffectFrames } from '../engine/effects/renderEffectFrames'
import { renderMaskImages } from '../engine/mask/renderMaskImages'
import { renderTextFrames } from '../engine/text/renderTextFrames'
import { pause } from './playbackActions'
import { projectStore } from './projectStore'

export type ExportPhase = 'idle' | 'running' | 'finished'

export interface ExportState {
  dialogOpen: boolean
  phase: ExportPhase
  progress: ExportProgress | null
  result: ExportResult | null
  /** null = đang dò. */
  encoders: EncoderId[] | null
  /** Nhớ đường dẫn lần xuất trước trong phiên làm việc. */
  lastOutputPath: string | null
  /** Bước chuẩn bị: làm đẹp từng khung hình (null = không có / đã xong). */
  beautyPrep: { done: number; total: number } | null
}

export const exportStore = createStore<ExportState>()(() => ({
  dialogOpen: false,
  phase: 'idle',
  progress: null,
  result: null,
  encoders: null,
  lastOutputPath: null,
  beautyPrep: null
}))

/** Bấm "Dừng" trong lúc đang làm đẹp khung hình (trước khi FFmpeg bắt đầu xuất). */
let prepCancelled = false

export function useExportStore<T>(selector: (s: ExportState) => T): T {
  return useStore(exportStore, selector)
}

export function openExportDialog(): void {
  pause() // đang phát preview thì dừng lại
  exportStore.setState({ dialogOpen: true })
  if (exportStore.getState().encoders === null) {
    window.cutcap
      .detectEncoders()
      .then((encoders) => exportStore.setState({ encoders }))
      .catch(() => exportStore.setState({ encoders: ['libx264'] }))
  }
}

/** Đóng hộp thoại. Nếu đang xuất thì vẫn chạy nền (hiện tiến trình nhỏ trên thanh công cụ). */
export function closeExportDialog(): void {
  const { phase } = exportStore.getState()
  exportStore.setState({ dialogOpen: false, ...(phase === 'finished' ? { phase: 'idle', result: null } : {}) })
}

export async function chooseOutputPath(current: string | null): Promise<string | null> {
  const name = projectStore.getState().project.name || 'Cutcap'
  return window.cutcap.chooseExportPath(name, current)
}

export async function startExport(settings: ExportSettings): Promise<void> {
  exportStore.setState({ phase: 'running', progress: null, result: null, lastOutputPath: settings.outputPath })
  // Chụp dự án hiện tại – tiếp tục chỉnh sửa trong lúc xuất không ảnh hưởng tới video đang xuất
  const project = projectStore.getState().project
  // Vẽ sẵn chữ thành ảnh PNG đúng độ phân giải xuất (cùng hàm vẽ với preview → giống hệt)
  const size = canvasSize(project.settings.aspectRatio, settings.resolution)
  const textFrames = await renderTextFrames(project, size.width, size.height, settings.fps)
  // Lớp phủ vẽ của hiệu ứng (tim bay, lấp lánh…) – cũng vẽ sẵn bằng đúng hàm của preview
  const effectFrames = await renderEffectFrames(project, size.width, size.height, settings.fps)
  // Làm đẹp: vẽ lại từng khung hình của clip (AI nhận diện mặt + WebGL – đúng code của khung Xem trước)
  prepCancelled = false
  let beautyRenders
  try {
    beautyRenders = await renderBeautyClips(project, size.width, size.height, {
      onProgress: (done, total) => exportStore.setState({ beautyPrep: { done, total } }),
      cancelled: () => prepCancelled
    })
  } catch (err) {
    exportStore.setState({
      phase: 'finished',
      dialogOpen: true,
      beautyPrep: null,
      result: err instanceof BeautyCancelled ? { status: 'cancelled' } : { status: 'error', message: 'beauty', detail: (err as Error).message }
    })
    return
  }
  exportStore.setState({ beautyPrep: null })
  const maskImages = await renderMaskImages(project, settings.fps)
  await window.cutcap.startExport({ project, settings, textFrames: [...textFrames, ...effectFrames], beautyRenders, maskImages })
}

export function cancelExport(): void {
  prepCancelled = true
  window.cutcap.cancelExport()
}

/** Nhận tiến trình / kết quả từ main. Gọi 1 lần khi khởi động. */
export function startExportSync(): () => void {
  const stopProgress = window.cutcap.onExportProgress((progress) => exportStore.setState({ progress }))
  const stopFinished = window.cutcap.onExportFinished((result) =>
    // Xuất xong khi hộp thoại đang đóng (chạy nền) → mở lại để báo kết quả
    exportStore.setState({ phase: 'finished', result, dialogOpen: true })
  )
  return () => {
    stopProgress()
    stopFinished()
  }
}
