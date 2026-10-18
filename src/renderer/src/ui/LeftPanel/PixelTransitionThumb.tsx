// Ô xem thử của chuyển cảnh làm méo điểm ảnh: cảnh mẫu A → cảnh mẫu B, vẽ bằng ĐÚNG bộ vẽ WebGL của khung Xem trước.
// Đứng yên: khung ở giữa chuyển cảnh; rê chuột: chạy lặp.
import { useEffect, useRef, useState } from 'react'
import { THUMB_H, THUMB_W, sampleScene } from '../../engine/effects/sampleScene'
import { sharedPixelRenderer } from '../../engine/transition/PixelTransitionRenderer'

let sceneB: OffscreenCanvas | null = null

/** Cảnh thứ 2: cảnh mẫu đổi tông màu (lạnh) để thấy rõ đang chuyển từ cảnh nào sang cảnh nào. */
function secondScene(): OffscreenCanvas {
  if (sceneB) return sceneB
  sceneB = new OffscreenCanvas(THUMB_W, THUMB_H)
  const g = sceneB.getContext('2d')!
  g.filter = 'hue-rotate(170deg) saturate(1.3)'
  g.drawImage(sampleScene(), 0, 0)
  return sceneB
}

/** Vẽ khung tại tiến độ p lên ctx (clip ra ở dưới, clip vào ở trên – như khung Xem trước). */
function drawAt(ctx: CanvasRenderingContext2D, kind: string, p: number): boolean {
  const renderer = sharedPixelRenderer()
  if (!renderer) return false
  ctx.clearRect(0, 0, THUMB_W, THUMB_H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, THUMB_W, THUMB_H)
  const a = renderer.render(sampleScene() as unknown as TexImageSource, THUMB_W, THUMB_H, kind, 'out', p)
  if (a) ctx.drawImage(a, 0, 0)
  const b = renderer.render(secondScene() as unknown as TexImageSource, THUMB_W, THUMB_H, kind, 'in', p)
  if (b) ctx.drawImage(b, 0, 0)
  return true
}

/** Một vòng: 0.3 s đứng ở A → 1.2 s chuyển → 0.5 s đứng ở B. */
const LOOP_MS = 2000

export function PixelTransitionThumb({ kind }: { kind: string }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState(false)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    if (!hover) {
      drawAt(ctx, kind, 0.4)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const loop = (now: number): void => {
      const e = (now - t0) % LOOP_MS
      drawAt(ctx, kind, Math.min(1, Math.max(0, (e - 300) / 1200)))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [kind, hover])
  return (
    <canvas
      ref={ref}
      className="transition-demo pixel"
      width={THUMB_W}
      height={THUMB_H}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    />
  )
}
