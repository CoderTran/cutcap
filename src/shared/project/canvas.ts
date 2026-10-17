// Tính kích thước khung hình (pixel) từ tỉ lệ + độ phân giải.
// "720p / 1080p / 4K" là độ dài CẠNH NGẮN, nên video dọc 9:16 ở 1080p = 1080×1920.
import type { AspectRatio, Resolution } from './schema'

export interface Size {
  width: number
  height: number
}

const SHORT_SIDE: Record<Resolution, number> = {
  '720p': 720,
  '1080p': 1080,
  '4k': 2160
}

/** Tỉ lệ rộng / cao. */
export function aspectValue(aspect: AspectRatio): number {
  const [w, h] = aspect.split(':').map(Number)
  return w / h
}

export function canvasSize(aspect: AspectRatio, resolution: Resolution): Size {
  const short = SHORT_SIDE[resolution]
  const ratio = aspectValue(aspect)
  // Bộ mã hóa H.264 yêu cầu kích thước chẵn
  const even = (n: number): number => Math.round(n / 2) * 2
  return ratio >= 1
    ? { width: even(short * ratio), height: short }
    : { width: short, height: even(short / ratio) }
}
