// Mặt nạ trên khung Xem trước: khung hình của clip × ảnh mặt nạ (destination-in) → phần ngoài trong suốt.
import type { Id } from '@shared/project/schema'
import type { ClipMask } from '@shared/render/mask'
import { drawMask } from './drawMask'

const MAX_SIDE = 1920

interface Entry {
  maskKey: string
  mask: HTMLCanvasElement
  out: HTMLCanvasElement
}

export class MaskPreview {
  private readonly cache = new Map<Id, Entry>()

  apply(clipId: Id, mask: ClipMask, source: CanvasImageSource, srcW: number, srcH: number): HTMLCanvasElement {
    const k = Math.min(1, MAX_SIDE / Math.max(srcW, srcH))
    const w = Math.max(1, Math.round(srcW * k))
    const h = Math.max(1, Math.round(srcH * k))
    let e = this.cache.get(clipId)
    if (!e) {
      e = { maskKey: '', mask: document.createElement('canvas'), out: document.createElement('canvas') }
      this.cache.set(clipId, e)
    }
    // Ảnh mặt nạ chỉ vẽ lại khi đổi thông số / kích thước
    const maskKey = `${w}x${h}|${JSON.stringify(mask)}`
    if (e.maskKey !== maskKey) {
      drawMask(e.mask, mask, w, h)
      e.maskKey = maskKey
    }
    if (e.out.width !== w || e.out.height !== h) {
      e.out.width = w
      e.out.height = h
    }
    const ctx = e.out.getContext('2d')!
    ctx.globalCompositeOperation = 'copy'
    ctx.drawImage(source, 0, 0, w, h)
    // Mặt nạ xám → độ trong suốt: dùng kênh độ sáng làm alpha (luminance-to-alpha qua filter của canvas)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(alphaOf(e), 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    return e.out
  }

  sweep(visible: Set<Id>): void {
    for (const id of this.cache.keys()) if (!visible.has(id)) this.cache.delete(id)
  }
}

/** Ảnh mặt nạ xám → ảnh có alpha = độ sáng (canvas destination-in dùng alpha, không dùng màu). */
const alphaCache = new WeakMap<HTMLCanvasElement, { key: string; canvas: HTMLCanvasElement }>()
function alphaOf(e: Entry): HTMLCanvasElement {
  const hit = alphaCache.get(e.mask)
  if (hit?.key === e.maskKey) return hit.canvas
  const { width: w, height: h } = e.mask
  const canvas = hit?.canvas ?? document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const src = e.mask.getContext('2d')!.getImageData(0, 0, w, h)
  const d = src.data
  for (let i = 0; i < d.length; i += 4) {
    d[i + 3] = d[i]
    d[i] = d[i + 1] = d[i + 2] = 255
  }
  canvas.getContext('2d')!.putImageData(src, 0, 0)
  alphaCache.set(e.mask, { key: e.maskKey, canvas })
  return canvas
}
