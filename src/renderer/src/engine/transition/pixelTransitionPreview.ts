// Chuyển cảnh làm méo điểm ảnh trên khung Xem trước: một PixelTransitionRenderer (WebGL) dùng chung, kết quả chép
// ra canvas riêng của từng clip (mỗi clip có thể đang "ra" và "vào" cùng lúc khi rất ngắn → 2 bước nối tiếp).
import type { Id } from '@shared/project/schema'
import { sharedPixelRenderer } from './PixelTransitionRenderer'

/** Xử lý ở tối đa cỡ này (cạnh dài). */
const MAX_SIDE = 1920
/** Nguồn lớn hơn cỡ cần vẽ quá bấy nhiêu lần thì thu nhỏ trước khi đưa vào WebGL (video 4K → nhẹ hơn nhiều). */
const SHRINK_OVER = 1.2

export class PixelTransitionPreview {
  private readonly outputs = new Map<string, HTMLCanvasElement>()
  private staging: HTMLCanvasElement | null = null

  constructor() {
    sharedPixelRenderer()?.warmUp()
  }

  /**
   * @param maxSide cạnh dài của lớp khi vẽ lên khung Xem trước – xử lý ở đúng cỡ đó, không hơn
   * @returns canvas đã biến đổi (cùng tỉ lệ với nguồn), hoặc null nếu không làm được (máy không có WebGL2…).
   */
  apply(
    clipId: Id,
    steps: { kind: string; role: 'in' | 'out'; p: number }[],
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    maxSide = MAX_SIDE
  ): HTMLCanvasElement | null {
    if (steps.length === 0 || srcW <= 0 || srcH <= 0) return null
    const renderer = sharedPixelRenderer()
    if (!renderer) return null
    const k = Math.min(1, Math.min(MAX_SIDE, Math.max(64, maxSide)) / Math.max(srcW, srcH))
    const w = Math.round(srcW * k)
    const h = Math.round(srcH * k)
    let current: CanvasImageSource = source
    if (Math.max(srcW, srcH) > SHRINK_OVER * Math.max(w, h)) current = this.shrink(source, w, h)
    let result: HTMLCanvasElement | null = null
    steps.forEach((s, i) => {
      const out = renderer.render(current as TexImageSource, w, h, s.kind, s.role, s.p)
      if (!out) return
      // Chép ra canvas riêng (renderer dùng chung cho mọi clip)
      const key = `${clipId}|${i}`
      let c = this.outputs.get(key)
      if (!c) {
        c = document.createElement('canvas')
        this.outputs.set(key, c)
      }
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(out, 0, 0)
      current = c
      result = c
    })
    return result
  }

  /** Thu nhỏ nguồn về w×h bằng canvas 2D (GPU) – đưa ảnh nhỏ vào WebGL rẻ hơn nhiều so với cả khung 4K. */
  private shrink(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
    const c = (this.staging ??= document.createElement('canvas'))
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
    }
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(source, 0, 0, w, h)
    return c
  }

  sweep(visible: Set<Id>): void {
    for (const key of this.outputs.keys()) if (!visible.has(key.split('|')[0])) this.outputs.delete(key)
  }
}
