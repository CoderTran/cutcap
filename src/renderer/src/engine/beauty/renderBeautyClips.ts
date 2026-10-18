// Trước khi xuất: vẽ lại mọi clip có Làm đẹp bằng ĐÚNG code của khung Xem trước (AI + WebGL).
// Main giải mã từng khung → ở đây làm đẹp → gửi lại để main ghi thành file tạm (xem main/beauty/beautyJobs.ts).
import type { BeautyRender } from '@shared/ipc'
import { isBeautyEmpty } from '@shared/render/beauty'
import { isFaceShapeEmpty } from '@shared/render/faceShape'
import type { MediaClip, Project } from '@shared/project/schema'
import { edgeSpeeds, sourceSpanOf } from '@shared/timeline/clipTime'
import { MAX_TRANSITION } from '@shared/timeline/transitions'
import { BeautyRenderer } from './BeautyRenderer'
import { detectFaces } from './faceDetector'

export interface BeautyRenderHooks {
  /** Tiến trình chung: số khung đã xong / tổng số khung của mọi clip. */
  onProgress: (done: number, total: number) => void
  /** true → dừng ngay (người dùng bấm Hủy). */
  cancelled: () => boolean
}

export class BeautyCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'BeautyCancelled'
  }
}

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2)

export async function renderBeautyClips(project: Project, outW: number, outH: number, hooks: BeautyRenderHooks): Promise<BeautyRender[]> {
  const jobs: { clip: MediaClip; path: string; image: boolean; w: number; h: number; fps: number; startUs: number; durationUs: number }[] =
    []
  for (const track of project.tracks) {
    if (track.hidden || track.kind === 'audio') continue
    for (const clip of track.clips) {
      if (clip.type !== 'media' || (isBeautyEmpty(clip.beauty) && isFaceShapeEmpty(clip.faceShape))) continue
      const asset = project.assets[clip.assetId]
      if (!asset || asset.kind === 'audio' || !asset.width || !asset.height) continue
      // Cỡ vẽ lại: như file gốc nhưng không lớn hơn khung video xuất ra (4K → 1080p khi xuất 1080p)
      const k = Math.min(1, Math.max(outW, outH) / Math.max(asset.width, asset.height))
      const image = asset.kind === 'image'
      // Lấy dư 2 bên cho chuyển cảnh (lớp hình có thể bắt đầu sớm / kết thúc muộn hơn clip)
      const edges = edgeSpeeds(clip)
      const startUs = image ? 0 : Math.max(0, clip.sourceIn - MAX_TRANSITION * edges.start)
      const endUs = image ? 0 : Math.min(asset.durationUs, clip.sourceIn + sourceSpanOf(clip) + MAX_TRANSITION * edges.end)
      jobs.push({
        clip,
        path: asset.path,
        image,
        w: even(asset.width * k),
        h: even(asset.height * k),
        fps: asset.fps ?? 30,
        startUs,
        durationUs: endUs - startUs
      })
    }
  }
  if (jobs.length === 0) return []

  const renderer = new BeautyRenderer()
  const frameCanvas = document.createElement('canvas')
  const results: BeautyRender[] = []
  const opened = await Promise.all(
    jobs.map((j) =>
      window.cutcap.beautyOpen({
        path: j.path,
        startUs: j.startUs,
        durationUs: j.durationUs,
        width: j.w,
        height: j.h,
        fps: j.fps,
        image: j.image
      })
    )
  )
  const total = opened.reduce((n, o) => n + o.frames, 0)
  let done = 0
  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]
      const { id } = opened[i]
      frameCanvas.width = job.w
      frameCanvas.height = job.h
      const ctx = frameCanvas.getContext('2d')!
      for (;;) {
        if (hooks.cancelled()) throw new BeautyCancelled()
        const frame = await window.cutcap.beautyRead(id)
        if (!frame) break
        ctx.putImageData(
          new ImageData(new Uint8ClampedArray(frame.buffer as ArrayBuffer, frame.byteOffset, frame.byteLength), job.w, job.h),
          0,
          0
        )
        const faces = await detectFaces(frameCanvas, job.w, job.h)
        const out = renderer.render(frameCanvas, job.w, job.h, faces, job.clip.beauty, job.clip.faceShape, true)
        await window.cutcap.beautyWrite(id, out ? renderer.readPixels() : frame)
        hooks.onProgress(Math.min(++done, total), total)
      }
      const path = await window.cutcap.beautyClose(id, true)
      if (path) results.push({ clipId: job.clip.id, path, offsetUs: job.startUs, height: job.h })
    }
    return results
  } catch (err) {
    // Hủy / lỗi: đóng mọi phiên còn mở (file tạm bị xóa)
    await Promise.all(opened.map((o) => window.cutcap.beautyClose(o.id, false)))
    throw err
  }
}
