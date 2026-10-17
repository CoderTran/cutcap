// Vẽ sẵn lớp phủ của hiệu ứng (tim bay, lấp lánh, đếm ngược…) thành PNG để FFmpeg phủ lên khi xuất.
// Dùng CHÍNH hàm drawOverlay của preview → video xuất giống hệt preview.
// Mỗi clip hiệu ứng có lớp phủ: 1 ảnh cho mỗi khung hình trong suốt thời lượng clip.
import type { TextFrameSet } from '@shared/ipc'
import type { Project } from '@shared/project/schema'
import { MICROS_PER_SECOND } from '@shared/project/time'
import { findEffect } from '@shared/render/effects'
import { drawOverlay } from './overlays'

async function toPng(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * @param onProgress báo tiến độ 0…1 (vẽ nhiều khung có thể mất vài giây)
 * @returns cùng dạng với khung chữ (TextFrameSet): clipId = id clip hiệu ứng, animated = mọi khung
 */
export async function renderEffectFrames(
  project: Project,
  width: number,
  height: number,
  fps: number,
  onProgress?: (fraction: number) => void
): Promise<TextFrameSet[]> {
  const jobs = project.tracks
    .filter((t) => t.kind === 'effect' && !t.hidden)
    .flatMap((t) => t.clips)
    .flatMap((clip) => {
      const def = clip.type === 'effect' ? findEffect(clip.effectId) : undefined
      const kinds = def?.ops.flatMap((op) => (op.type === 'overlay' ? [op.kind] : [])) ?? []
      return kinds.length > 0 ? [{ clip, kinds, count: Math.ceil((clip.duration / MICROS_PER_SECOND) * fps) }] : []
    })
  if (jobs.length === 0) return []

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Không tạo được OffscreenCanvas')
  const total = jobs.reduce((sum, j) => sum + j.count, 0)
  let done = 0
  const sets: TextFrameSet[] = []

  for (const { clip, kinds, count } of jobs) {
    const animated: Uint8Array[] = []
    for (let i = 0; i < count; i++) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, width, height)
      for (const kind of kinds) drawOverlay(ctx, kind, width, height, i / fps)
      animated.push(await toPng(canvas))
      onProgress?.(++done / total)
    }
    ctx.clearRect(0, 0, width, height)
    sets.push({ clipId: clip.id, animated, still: await toPng(canvas) })
  }
  return sets
}
