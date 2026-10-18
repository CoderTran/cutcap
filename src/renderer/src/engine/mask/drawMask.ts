// Vẽ mặt nạ thành ảnh xám (trắng = giữ, đen = trong suốt). Dùng CHUNG cho khung Xem trước và ảnh mặt nạ
// gửi cho FFmpeg lúc xuất → mép, lông vũ, bo góc… giống hệt nhau.
import { featherPx, type ClipMask } from '@shared/render/mask'

/** Vẽ mặt nạ lên canvas w×h (xóa trắng/đen trước). */
export function drawMask(canvas: HTMLCanvasElement, mask: ClipMask, w: number, h: number): void {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = mask.invert ? '#fff' : '#000'
  ctx.fillRect(0, 0, w, h)

  const short = Math.min(w, h)
  const blur = featherPx(mask, w, h)
  ctx.filter = blur > 0.5 ? `blur(${blur}px)` : 'none'
  ctx.fillStyle = mask.invert ? '#000' : '#fff'
  ctx.translate(mask.x * w, mask.y * h)
  ctx.rotate((mask.rotation * Math.PI) / 180)
  // Vùng rất lớn cho mặt nạ "Tách" / "Cuộn phim" (phủ kín khung kể cả khi xoay)
  const far = Math.hypot(w, h) * 2
  ctx.beginPath()
  switch (mask.shape) {
    case 'linear':
      // Giữ nửa phía trên đường thẳng qua tâm
      ctx.rect(-far, -far, far * 2, far)
      break
    case 'mirror': {
      const half = (mask.width * short) / 2
      ctx.rect(-far, -half, far * 2, half * 2)
      break
    }
    case 'circle':
      ctx.ellipse(0, 0, (mask.width * short) / 2, (mask.height * short) / 2, 0, 0, Math.PI * 2)
      break
    case 'rect': {
      const rw = mask.width * short
      const rh = mask.height * short
      const radius = (mask.roundness / 100) * (Math.min(rw, rh) / 2)
      ctx.roundRect(-rw / 2, -rh / 2, rw, rh, radius)
      break
    }
  }
  ctx.fill()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
}

/** Ảnh mặt nạ PNG (cho lúc xuất). */
export async function maskPng(mask: ClipMask, w: number, h: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  drawMask(canvas, mask, w, h)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png')
  )
  return new Uint8Array(await blob.arrayBuffer())
}
