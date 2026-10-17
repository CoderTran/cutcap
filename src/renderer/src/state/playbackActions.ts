// Lệnh điều khiển phát: Play/Pause, lùi/tiến từng frame, về đầu/cuối.
// PreviewEngine được tạo bởi khung Xem trước (PreviewStage) và đăng ký vào đây.
import { MICROS_PER_SECOND } from '@shared/project/time'
import { projectDuration } from '@shared/timeline/clips'
import type { PreviewEngine } from '../engine/preview/PreviewEngine'
import { editorStore } from './editorStore'
import { projectStore } from './projectStore'

let engine: PreviewEngine | null = null

export function attachEngine(e: PreviewEngine | null): void {
  engine = e
}

export function togglePlay(): void {
  if (!engine) return
  if (engine.isPlaying) engine.pause()
  else engine.play()
}

export function pause(): void {
  engine?.pause()
}

/** Lùi/tiến n frame (n âm = lùi). Đang phát thì dừng lại trước, giống CapCut. */
export function stepFrames(n: number): void {
  pause()
  const { settings } = projectStore.getState().project
  const frame = MICROS_PER_SECOND / settings.fps
  const { currentTime, setCurrentTime } = editorStore.getState()
  // Làm tròn về đúng mốc frame trước khi bước, để không bị lệch dần
  const index = Math.round(currentTime / frame) + n
  setCurrentTime(Math.min(projectDuration(projectStore.getState().project), Math.max(0, index * frame)))
}

let rangeTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Phát thử một đoạn rồi dừng (vd. vừa chọn hiệu ứng động → xem ngay, giống CapCut).
 * Gọi lần nữa trước khi xong thì đoạn cũ bị hủy.
 */
export function playRange(start: number, duration: number): void {
  if (!engine) return
  if (rangeTimer) clearTimeout(rangeTimer)
  engine.pause()
  editorStore.getState().setCurrentTime(start)
  engine.play()
  rangeTimer = setTimeout(() => {
    rangeTimer = null
    engine?.pause()
  }, duration / 1000 + 120)
}

export function goToStart(): void {
  editorStore.getState().setCurrentTime(0)
}

export function goToEnd(): void {
  pause()
  editorStore.getState().setCurrentTime(projectDuration(projectStore.getState().project))
}
