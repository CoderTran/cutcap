// Điều chỉnh màu trên khung Xem trước: một GradeRenderer (WebGL) dùng chung, kết quả chép ra canvas riêng
// của từng clip. Đang dừng: nhớ kết quả theo (khung hình, thông số) → vẽ lại khung không phải tính lại.
import type { Id } from '@shared/project/schema'
import { isGradeEmpty, type ColorGrade } from '@shared/render/grade'
import { GradeRenderer } from './GradeRenderer'

/** Xử lý ở tối đa cỡ này (cạnh dài). */
const MAX_SIDE = 1920

interface Cached {
  key: string
  canvas: HTMLCanvasElement
}

export class GradePreview {
  private renderer: GradeRenderer | null = null
  private failed = false
  private readonly cache = new Map<Id, Cached>()

  /**
   * @param frameKey thời điểm khung hình – đổi thì tính lại (hạt nhỏ cũng đổi theo)
   * @returns canvas đã chỉnh màu, hoặc null (không chỉnh / máy không có WebGL2)
   */
  apply(
    clipId: Id,
    grade: ColorGrade | null,
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    frameKey: number
  ): HTMLCanvasElement | null {
    if (!grade || isGradeEmpty(grade) || this.failed || srcW <= 0 || srcH <= 0) return null
    const key = `${frameKey.toFixed(3)}|${srcW}x${srcH}|${JSON.stringify(grade)}`
    const hit = this.cache.get(clipId)
    if (hit?.key === key) return hit.canvas
    const k = Math.min(1, MAX_SIDE / Math.max(srcW, srcH))
    const w = Math.round(srcW * k)
    const h = Math.round(srcH * k)
    try {
      this.renderer ??= new GradeRenderer()
    } catch {
      this.failed = true
      return null
    }
    const out = this.renderer.render(source as TexImageSource, w, h, grade, Math.round(frameKey * 30))
    const entry = hit ?? { key, canvas: document.createElement('canvas') }
    entry.key = key
    if (entry.canvas.width !== w || entry.canvas.height !== h) {
      entry.canvas.width = w
      entry.canvas.height = h
    }
    entry.canvas.getContext('2d')!.drawImage(out, 0, 0)
    this.cache.set(clipId, entry)
    return entry.canvas
  }

  sweep(visible: Set<Id>): void {
    for (const id of this.cache.keys()) if (!visible.has(id)) this.cache.delete(id)
  }
}
