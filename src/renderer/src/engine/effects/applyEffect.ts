// Hiệu ứng video trên canvas (phần "preview" của shared/render/effects.ts).
// Mỗi loại phép ở đây phải cho ra cùng hình với bản FFmpeg trong main/export/effectFilters.ts.
//
// Cách làm chung: chụp lại khung hình hiện có trên canvas ("snap"), rồi vẽ lại có biến đổi / bộ lọc.
// Dùng cho: khung Xem trước (PreviewEngine) và ô xem thử trong tab Hiệu ứng.
import { cssFilterFromOps } from '@shared/render/colorMath'
import {
  barPx,
  blurPx,
  coverCrop,
  pixelGrid,
  scanlineSpacing,
  shiftPx,
  splitSizes,
  type EffectDef,
  type EffectOp
} from '@shared/render/effects'
import { evalExpr } from '@shared/render/expr'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

export class EffectPainter {
  private readonly snap = new OffscreenCanvas(1, 1)
  private readonly tmp = new OffscreenCanvas(1, 1)
  private readonly noise = new OffscreenCanvas(128, 128)

  /** Áp hiệu ứng lên toàn bộ nội dung đang có trên ctx (khung W×H). @param t giây tính từ đầu clip hiệu ứng */
  apply(ctx: Ctx, def: EffectDef, W: number, H: number, t: number): void {
    for (const op of def.ops) {
      this.capture(ctx, W, H)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.filter = 'none'
      try {
        this.paint(ctx, op, W, H, t)
      } finally {
        ctx.restore()
      }
    }
  }

  private capture(ctx: Ctx, W: number, H: number): void {
    if (this.snap.width !== W || this.snap.height !== H) {
      this.snap.width = W
      this.snap.height = H
    }
    const s = this.snap.getContext('2d')!
    s.globalCompositeOperation = 'copy'
    s.drawImage(ctx.canvas, 0, 0)
  }

  private paint(ctx: Ctx, op: EffectOp, W: number, H: number, t: number): void {
    const snap = this.snap
    switch (op.type) {
      case 'color': {
        const filter = cssFilterFromOps(op.ops)
        if (filter === 'none') return
        ctx.filter = filter
        ctx.drawImage(snap, 0, 0)
        return
      }
      case 'invert':
        ctx.filter = 'invert(1)'
        ctx.drawImage(snap, 0, 0)
        return
      case 'hueCycle':
        // hue-rotate của canvas dùng đúng ma trận CSS – bản xuất tính cùng ma trận bằng geq
        ctx.filter = `hue-rotate(${evalExpr(op.degrees, t)}deg)`
        ctx.drawImage(snap, 0, 0)
        return
      case 'blur':
        ctx.filter = `blur(${blurPx(op.radius, H)}px)`
        ctx.drawImage(snap, 0, 0)
        return
      case 'glow':
        // Khung hình gốc vẫn còn trên canvas; phủ thêm bản mờ bằng "screen"
        ctx.filter = `blur(${blurPx(op.radius, H)}px)`
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = op.opacity
        ctx.drawImage(snap, 0, 0)
        return
      case 'transform': {
        const s = evalExpr(op.scale, t)
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, W, H)
        ctx.translate(W / 2 + evalExpr(op.dx, t) * W, H / 2 + evalExpr(op.dy, t) * H)
        ctx.rotate((evalExpr(op.rotate, t) * Math.PI) / 180)
        ctx.scale(s, s)
        ctx.drawImage(snap, -W / 2, -H / 2)
        return
      }
      case 'flash':
        ctx.fillStyle = op.color === 'white' ? '#fff' : '#000'
        ctx.globalAlpha = clamp01(evalExpr(op.amount, t))
        ctx.fillRect(0, 0, W, H)
        return
      case 'vignette': {
        const half = Math.hypot(W / 2, H / 2)
        const g = ctx.createRadialGradient(W / 2, H / 2, op.inner * half, W / 2, H / 2, op.outer * half)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, `rgba(0,0,0,${op.strength})`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
        return
      }
      case 'bars': {
        const h = barPx(op.size, H)
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, W, h)
        ctx.fillRect(0, H - h, W, h)
        return
      }
      case 'mirror': {
        const hw = W / 2
        const hh = H / 2
        if (op.mode === 'h') {
          ctx.translate(W, 0)
          ctx.scale(-1, 1)
          ctx.drawImage(snap, 0, 0, hw, H, 0, 0, hw, H)
        } else if (op.mode === 'v') {
          ctx.translate(0, H)
          ctx.scale(1, -1)
          ctx.drawImage(snap, 0, 0, W, hh, 0, 0, W, hh)
        } else {
          // Góc trên trái → 4 góc (lật ngang / dọc / cả hai)
          for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
            ctx.setTransform(fx, 0, 0, fy, fx < 0 ? W : 0, fy < 0 ? H : 0)
            ctx.drawImage(snap, 0, 0, hw, hh, 0, 0, hw, hh)
          }
        }
        return
      }
      case 'grid': {
        const ws = splitSizes(W, op.cols)
        const hs = splitSizes(H, op.rows)
        let y = 0
        for (let r = 0; r < op.rows; r++) {
          let x = 0
          for (let c = 0; c < op.cols; c++) {
            const crop = coverCrop(W, H, ws[c], hs[r])
            ctx.drawImage(snap, crop.x, crop.y, crop.w, crop.h, x, y, ws[c], hs[r])
            x += ws[c]
          }
          y += hs[r]
        }
        return
      }
      case 'flip':
        if (op.axis === 'h') ctx.setTransform(-1, 0, 0, 1, W, 0)
        else ctx.setTransform(1, 0, 0, -1, 0, H)
        ctx.drawImage(snap, 0, 0)
        return
      case 'pixelate': {
        const g = pixelGrid(op.blocks, W, H)
        this.tmp.width = g.w
        this.tmp.height = g.h
        const tc = this.tmp.getContext('2d')!
        tc.imageSmoothingEnabled = false
        tc.drawImage(snap, 0, 0, g.w, g.h)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(this.tmp, 0, 0, W, H)
        return
      }
      case 'rgbSplit': {
        if (op.gate && evalExpr(op.gate, t) <= 0) return
        const a = shiftPx(op.amount, W)
        if (this.tmp.width !== W || this.tmp.height !== H) {
          this.tmp.width = W
          this.tmp.height = H
        }
        const tc = this.tmp.getContext('2d')!
        // Tách từng kênh (nhân với đỏ / lục / lam) rồi cộng lại ("lighter") với độ dời khác nhau
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = 'lighter'
        for (const [color, dx] of [['#f00', -a], ['#0f0', 0], ['#00f', a]] as const) {
          tc.globalCompositeOperation = 'copy'
          tc.drawImage(snap, 0, 0)
          tc.globalCompositeOperation = 'multiply'
          tc.fillStyle = color
          tc.fillRect(0, 0, W, H)
          ctx.drawImage(this.tmp, dx, 0)
        }
        return
      }
      case 'scanlines': {
        const sp = scanlineSpacing(op.spacing, H)
        const th = Math.max(1, Math.round(sp * 0.4))
        ctx.fillStyle = `rgba(0,0,0,${op.opacity})`
        for (let y = 0; y < H; y += sp) ctx.fillRect(0, y, W, th)
        return
      }
      case 'grain': {
        // Nhiễu ngẫu nhiên mỗi khung (giống noise allf=t+u của FFmpeg về độ mạnh, không giống từng hạt)
        const nc = this.noise.getContext('2d')!
        const img = nc.createImageData(this.noise.width, this.noise.height)
        for (let i = 0; i < img.data.length; i += 4) {
          const v = 128 + (Math.random() * 2 - 1) * 255 * op.amount
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v
          img.data[i + 3] = 255
        }
        nc.putImageData(img, 0, 0)
        const pattern = ctx.createPattern(this.noise, 'repeat')
        if (!pattern) return
        ctx.globalCompositeOperation = 'overlay'
        ctx.fillStyle = pattern
        ctx.fillRect(0, 0, W, H)
        return
      }
    }
  }
}
