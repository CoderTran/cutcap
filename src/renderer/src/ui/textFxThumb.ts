// Ảnh ô xem trước của mẫu chữ / hiệu ứng văn bản: vẽ "ART" bằng ĐÚNG hàm vẽ của khung Xem trước / Xuất video
// (nên ô trông giống hệt kết quả), nhớ lại theo mã mẫu.
import type { TextStylePreset } from '@shared/render/textFx'
import { drawTextClip } from '../engine/text/drawText'
import { textClipFromPreset } from '../state/textActions'

const THUMB_W = 160
const THUMB_H = 110
const cache = new Map<string, string>()

export function textFxThumb(p: TextStylePreset): string {
  let url = cache.get(p.id)
  if (!url) {
    const canvas = document.createElement('canvas')
    canvas.width = THUMB_W
    canvas.height = THUMB_H
    const clip = textClipFromPreset('ART', 0, { ...p, animationIn: 'none' })
    // Cỡ chữ cố định cho ô (≈ 44% chiều cao ô), bỏ qua cỡ chữ của mẫu
    drawTextClip(canvas.getContext('2d')!, { ...clip, style: { ...clip.style, fontSize: 470 } }, THUMB_W, THUMB_H, 0)
    url = canvas.toDataURL()
    cache.set(p.id, url)
  }
  return url
}
