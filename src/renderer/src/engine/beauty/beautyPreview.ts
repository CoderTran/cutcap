// Làm đẹp trên khung Xem trước: nhận diện mặt + vẽ hiệu ứng cho khung hình hiện tại của clip.
// Một BeautyRenderer (WebGL) dùng chung; kết quả chép ra canvas riêng của từng clip (nhiều clip cùng lúc).
// Đang dừng: nhớ kết quả theo (thời điểm, thông số) → vẽ lại khung (kéo chọn, đổi cỡ…) không phải tính lại.
import { isBeautyEmpty, type Beauty } from '@shared/render/beauty'
import { isFaceShapeEmpty, type FaceShape } from '@shared/render/faceShape'
import type { Id } from '@shared/project/schema'
import { BeautyRenderer } from './BeautyRenderer'
import { detectFacesNow, preloadFaceDetector } from './faceDetector'

/** Xử lý ở tối đa cỡ này (cạnh dài) – video 4K vẫn mượt, khung Xem trước cũng không cần hơn. */
const MAX_SIDE = 1920

interface Cached {
  key: string
  canvas: HTMLCanvasElement
  hasFace: boolean
}

export class BeautyPreview {
  private renderer: BeautyRenderer | null = null
  private failed = false
  private readonly cache = new Map<Id, Cached>()

  /** @param onReady gọi khi AI nạp xong → vẽ lại để thấy hiệu ứng */
  constructor(private readonly onReady: () => void) {}

  /**
   * @param frameKey thời điểm khung hình (vd. currentTime của video) – đổi thì tính lại
   * @returns canvas đã làm đẹp, hoặc null (không làm đẹp / không thấy mặt / AI chưa sẵn sàng)
   */
  apply(
    clipId: Id,
    beauty: Beauty | null,
    shape: FaceShape | null,
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    frameKey: number
  ): HTMLCanvasElement | null {
    if ((isBeautyEmpty(beauty) && isFaceShapeEmpty(shape)) || this.failed || srcW <= 0 || srcH <= 0) return null
    const key = `${frameKey.toFixed(3)}|${srcW}x${srcH}|${JSON.stringify(beauty)}|${JSON.stringify(shape)}`
    const hit = this.cache.get(clipId)
    if (hit?.key === key) return hit.hasFace ? hit.canvas : null

    const faces = detectFacesNow(source, srcW, srcH)
    if (faces === null) {
      void preloadFaceDetector().then(this.onReady, () => (this.failed = true))
      return null
    }
    const k = Math.min(1, MAX_SIDE / Math.max(srcW, srcH))
    const w = Math.round(srcW * k)
    const h = Math.round(srcH * k)
    try {
      this.renderer ??= new BeautyRenderer()
    } catch {
      this.failed = true // máy không có WebGL2 → bỏ qua làm đẹp ở khung Xem trước
      return null
    }
    const out = this.renderer.render(source as TexImageSource, w, h, faces, beauty, shape)
    const entry = hit ?? { key, canvas: document.createElement('canvas'), hasFace: false }
    entry.key = key
    entry.hasFace = out !== null
    if (out) {
      if (entry.canvas.width !== w || entry.canvas.height !== h) {
        entry.canvas.width = w
        entry.canvas.height = h
      }
      entry.canvas.getContext('2d')!.drawImage(out, 0, 0)
    }
    this.cache.set(clipId, entry)
    return out ? entry.canvas : null
  }

  /** Bỏ bộ nhớ của các clip không còn hiện. */
  sweep(visible: Set<Id>): void {
    for (const id of this.cache.keys()) if (!visible.has(id)) this.cache.delete(id)
  }
}
