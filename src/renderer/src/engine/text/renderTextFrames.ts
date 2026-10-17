// Vẽ sẵn chữ thành ảnh PNG để FFmpeg chồng lên khi xuất video.
// Mỗi clip chữ: vài chục khung cho đoạn hiệu ứng xuất hiện + 1 khung tĩnh cho phần còn lại.
// Ảnh full khung hình, nền trong suốt – PNG của chữ trên nền trong suốt rất nhẹ (vài chục KB).
import type { TextFrameSet } from '@shared/ipc'
import type { Project } from '@shared/project/schema'
import { MICROS_PER_SECOND } from '@shared/project/time'
import { animationFrameCount } from '@shared/render/textLayout'
import { drawTextClip } from './drawText'

async function toPng(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

export async function renderTextFrames(project: Project, width: number, height: number, fps: number): Promise<TextFrameSet[]> {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Không tạo được OffscreenCanvas')
  const sets: TextFrameSet[] = []

  for (const track of project.tracks) {
    if (track.hidden) continue
    for (const clip of track.clips) {
      if (clip.type !== 'text') continue
      const animated: Uint8Array[] = []
      const count = animationFrameCount(clip, fps)
      for (let i = 0; i < count; i++) {
        ctx.clearRect(0, 0, width, height)
        drawTextClip(ctx, clip, width, height, clip.start + (i * MICROS_PER_SECOND) / fps)
        animated.push(await toPng(canvas))
      }
      // Khung tĩnh: trạng thái sau khi hiệu ứng đã chạy xong
      ctx.clearRect(0, 0, width, height)
      drawTextClip(ctx, clip, width, height, clip.start + clip.animationDuration)
      sets.push({ clipId: clip.id, animated, still: await toPng(canvas) })
    }
  }
  return sets
}
