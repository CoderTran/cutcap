// Bộ lọc màu có sẵn. Mỗi bộ lọc là một dãy phép màu chuẩn CSS (xem colorMath.ts),
// nên preview, ô xem trước và video xuất ra cho cùng một màu.
// Thêm bộ lọc mới: thêm 1 mục vào FILTER_PRESETS và tên hiển thị trong file ngôn ngữ (filters.<id>).
import type { MediaClip } from '../project/schema'
import { adjustOps, cssFilterFromOps, ffmpegFiltersFromOps, scaleOp, type ColorOp } from './colorMath'

export interface FilterPreset {
  id: string
  ops: ColorOp[]
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'vivid', ops: [{ type: 'saturate', value: 1.45 }, { type: 'contrast', value: 1.1 }] },
  { id: 'warm', ops: [{ type: 'sepia', value: 0.25 }, { type: 'saturate', value: 1.2 }, { type: 'brightness', value: 1.03 }] },
  { id: 'cool', ops: [{ type: 'hueRotate', degrees: -12 }, { type: 'saturate', value: 0.9 }, { type: 'brightness', value: 1.03 }] },
  { id: 'bw', ops: [{ type: 'grayscale', value: 1 }, { type: 'contrast', value: 1.15 }] },
  {
    id: 'vintage',
    ops: [{ type: 'sepia', value: 0.5 }, { type: 'contrast', value: 0.9 }, { type: 'brightness', value: 1.05 }, { type: 'saturate', value: 0.85 }]
  },
  { id: 'faded', ops: [{ type: 'contrast', value: 0.78 }, { type: 'brightness', value: 1.08 }, { type: 'saturate', value: 0.75 }] },
  { id: 'dramatic', ops: [{ type: 'contrast', value: 1.4 }, { type: 'saturate', value: 0.8 }, { type: 'brightness', value: 0.95 }] },
  { id: 'sunset', ops: [{ type: 'sepia', value: 0.35 }, { type: 'hueRotate', degrees: -15 }, { type: 'saturate', value: 1.35 }] }
]

export function findFilter(id: string | null): FilterPreset | undefined {
  return id ? FILTER_PRESETS.find((f) => f.id === id) : undefined
}

/**
 * Toàn bộ phép màu của clip: bộ lọc (theo cường độ) TRƯỚC, rồi chỉnh tay (sáng/tương phản/bão hòa).
 * @param override dùng để xem thử bộ lọc khi rê chuột (không đổi dữ liệu dự án)
 */
export function clipColorOps(clip: MediaClip, override?: { filter: string | null }): ColorOp[] {
  const preset = findFilter(override ? override.filter : clip.filter)
  const k = clip.filterIntensity
  return [...(preset ? preset.ops.map((op) => scaleOp(op, k)) : []), ...adjustOps(clip.adjust)]
}

export function clipCssFilter(clip: MediaClip, override?: { filter: string | null }): string {
  return cssFilterFromOps(clipColorOps(clip, override))
}

export function clipFfmpegFilters(clip: MediaClip): string[] {
  return ffmpegFiltersFromOps(clipColorOps(clip))
}
