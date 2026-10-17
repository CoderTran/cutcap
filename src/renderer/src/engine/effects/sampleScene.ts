// Cảnh mẫu cho ô xem thử (hiệu ứng, hiệu ứng động): hoàng hôn, núi, dãy nhà – tự vẽ, không cần ảnh có bản quyền.
export const THUMB_W = 192
export const THUMB_H = 120

/** Cảnh mẫu tự vẽ (hoàng hôn, núi, nhà) – không cần ảnh có bản quyền. Vẽ 1 lần, dùng chung. */
let sample: OffscreenCanvas | null = null
export function sampleScene(): OffscreenCanvas {
  if (sample) return sample
  const c = new OffscreenCanvas(THUMB_W, THUMB_H)
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, THUMB_H)
  sky.addColorStop(0, '#2b3a8c')
  sky.addColorStop(0.55, '#e0607e')
  sky.addColorStop(1, '#f7b267')
  g.fillStyle = sky
  g.fillRect(0, 0, THUMB_W, THUMB_H)
  g.fillStyle = '#ffe08a'
  g.beginPath()
  g.arc(THUMB_W * 0.68, THUMB_H * 0.55, THUMB_H * 0.16, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#3d2c5a'
  g.beginPath()
  g.moveTo(0, THUMB_H * 0.8)
  g.lineTo(THUMB_W * 0.25, THUMB_H * 0.52)
  g.lineTo(THUMB_W * 0.5, THUMB_H * 0.78)
  g.lineTo(THUMB_W * 0.78, THUMB_H * 0.6)
  g.lineTo(THUMB_W, THUMB_H * 0.82)
  g.lineTo(THUMB_W, THUMB_H)
  g.lineTo(0, THUMB_H)
  g.fill()
  // Dãy nhà phía trước (cửa sổ sáng) – để thấy rõ hiệu ứng gương / chia màn hình
  const blocks = [[0.05, 0.3], [0.17, 0.42], [0.31, 0.26], [0.86, 0.36]]
  for (const [x, h] of blocks) {
    g.fillStyle = '#1b1530'
    g.fillRect(x * THUMB_W, THUMB_H * (1 - h), THUMB_W * 0.11, THUMB_H * h)
    g.fillStyle = '#ffd36e'
    for (let wy = THUMB_H * (1 - h) + 5; wy < THUMB_H - 6; wy += 9) g.fillRect(x * THUMB_W + 4, wy, 4, 4)
  }
  sample = c
  return c
}
