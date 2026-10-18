// Vẽ một clip chữ lên canvas 2D. Dùng CHUNG cho:
//   - preview (canvas trên màn hình, mỗi khung hình)
//   - xuất video (OffscreenCanvas đúng độ phân giải xuất → ảnh PNG → FFmpeg chồng lên)
// Nhờ vậy chữ trong video xuất ra giống hệt preview: cùng font Windows, cùng dấu tiếng Việt.
//
// Hiệu ứng văn bản (style.fx) vẽ theo lớp, từ dưới lên:
//   khung nền → bản sao lệch → khối 3D → bóng đổ → phát sáng → các lớp viền (ngoài → trong)
//   → ruột chữ (màu / gradient, kết cấu, vát cạnh) → trang trí
import type { TextBox, TextClip, TextFx } from '@shared/project/schema'
import type { Micros } from '@shared/project/time'
import { transformAt } from '@shared/timeline/keyframes'
import { textAnimFrame } from '@shared/render/textAnims'
import { LINE_HEIGHT, cssFont, fontPx, splitGraphemes } from '@shared/render/textLayout'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Khung bao của khối chữ (pixel canvas, chưa tính xoay) – dùng để bấm chọn / kéo trên preview. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Số ngẫu nhiên có hạt giống – mép rách / vị trí lấp lánh giống nhau ở mọi khung hình. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Vẽ chữ của clip tại thời điểm t lên khung W×H.
 * @returns khung bao khối chữ, hoặc null nếu không có gì để vẽ
 */
export function drawTextClip(ctx: Ctx2D, clip: TextClip, W: number, H: number, t: Micros): Rect | null {
  const { style } = clip
  const fx = style.fx ?? null
  const transform = transformAt(clip, t) // có keyframe → vị trí/kích thước/xoay/độ mờ tại thời điểm t
  // Hiệu ứng động (Vào / Ra / Vòng lặp): biến đổi cả khối + từng ký tự – xem shared/render/textAnims.ts
  const anim = textAnimFrame(clip, t)
  const b = anim.block
  const unit = Math.min(W, H) / 1080 // 1 "đơn vị" theo khung 1080p
  const px = fontPx(style, W, H) * transform.scale * b.scale
  if (px < 0.5 || clip.text.length === 0 || b.alpha <= 0.001) return null

  ctx.save()
  ctx.font = cssFont(style, px)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // Bố cục tính theo TOÀN BỘ chữ – hiệu ứng gõ chữ chỉ ẩn bớt ký tự, khối chữ không bị xô lệch
  const fullLines = clip.text.split('\n')
  const widths = fullLines.map((line) => ctx.measureText(line).width)
  const blockW = Math.max(...widths, 1)
  const lineH = px * LINE_HEIGHT
  const blockH = lineH * fullLines.length
  const allGraphemes = anim.visible ? splitGraphemes(clip.text) : null
  const visibleLines = allGraphemes ? allGraphemes.slice(0, anim.visible!(allGraphemes.length)).join('').split('\n') : fullLines

  const cx = transform.x * W + b.dx * px
  const cy = transform.y * H + b.dy * px
  const left = -blockW / 2
  const top = -blockH / 2

  ctx.translate(cx, cy)
  ctx.rotate(((transform.rotation + b.rot) * Math.PI) / 180)
  if (b.skew) ctx.transform(1, 0, Math.tan((b.skew * Math.PI) / 180), 1, 0, 0)
  if (b.sx !== 1 || b.sy !== 1) ctx.scale(b.sx || 1e-4, b.sy || 1e-4)
  ctx.globalAlpha *= transform.opacity * Math.min(1, b.alpha)
  // Bộ lọc của cả khối (nhòe / đổi màu / độ sáng) – các lớp phát sáng, bóng đổ cộng thêm vào
  const baseFilter =
    [
      b.blur > 0.005 ? `blur(${(b.blur * px).toFixed(2)}px)` : '',
      Math.abs(b.hue) > 0.5 ? `hue-rotate(${b.hue.toFixed(1)}deg)` : '',
      Math.abs(b.bright - 1) > 0.005 ? `brightness(${b.bright.toFixed(3)})` : ''
    ]
      .filter(Boolean)
      .join(' ') || 'none'
  const withFilter = (extra: string): string => (baseFilter === 'none' ? extra : `${baseFilter} ${extra}`)
  ctx.filter = baseFilter

  // Che dần (wipe): chỉ hiện một phần khối chữ (chừa rộng cho viền, phát sáng, khung nền)
  if (anim.wipe) {
    const m = px * 0.9
    const x0 = left - m
    const y0 = top - m
    const w0 = blockW + m * 2
    const h0 = blockH + m * 2
    const p = Math.min(1, Math.max(0, anim.wipe.p))
    ctx.beginPath()
    switch (anim.wipe.from) {
      case 'left':
        ctx.rect(x0, y0, w0 * p, h0)
        break
      case 'right':
        ctx.rect(x0 + w0 * (1 - p), y0, w0 * p, h0)
        break
      case 'center':
        ctx.rect(x0 + (w0 * (1 - p)) / 2, y0, w0 * p, h0)
        break
      case 'top':
        ctx.rect(x0, y0, w0, h0 * p)
        break
      case 'bottom':
        ctx.rect(x0, y0 + h0 * (1 - p), w0, h0 * p)
        break
    }
    ctx.clip()
  }

  // Khung nền
  if (fx?.box) drawBox(ctx, fx.box, left, top, blockW, blockH, px, clip.text.length)
  else if (style.backgroundColor) {
    const padX = px * 0.3
    const padY = px * 0.12
    ctx.fillStyle = style.backgroundColor
    ctx.beginPath()
    ctx.roundRect(left - padX, top - padY, blockW + padX * 2, blockH + padY * 2, px * 0.2)
    ctx.fill()
  }

  // Hiệu ứng theo từng ký tự: đo vị trí từng ký tự (theo tiền tố → giữ đúng khoảng cách chữ)
  const glyphFn = anim.glyph
  const lineGlyphs = glyphFn
    ? fullLines.map((line) => {
        let acc = ''
        return splitGraphemes(line).map((g) => {
          const x0 = ctx.measureText(acc).width
          acc += g
          return { g, x0, w: ctx.measureText(acc).width - x0 }
        })
      })
    : null
  const glyphCount = lineGlyphs ? lineGlyphs.reduce((n, l) => n + l.length, 0) : 0

  /**
   * Gọi fn cho từng dòng đang hiện (vị trí x, y của dòng) – hoặc cho TỪNG KÝ TỰ (đã dời / xoay / phóng theo hiệu ứng)
   * nếu có hiệu ứng theo ký tự. c: canvas để vẽ (mặc định canvas chính; lớp tạm của ruột chữ truyền vào lớp đó).
   */
  const eachLine = (fn: (text: string, x: number, y: number) => void, c: Ctx2D = ctx): void => {
    let gi = 0
    fullLines.forEach((_line, i) => {
      const visible = visibleLines[i] ?? ''
      const x = style.align === 'left' ? left : style.align === 'right' ? left + blockW - widths[i] : -widths[i] / 2
      const y = top + lineH * (i + 0.5)
      if (!lineGlyphs || !glyphFn) {
        if (visible) fn(visible, x, y)
        return
      }
      const shown = visible ? splitGraphemes(visible).length : 0
      lineGlyphs[i].forEach((gl, k) => {
        const idx = gi++
        if (k >= shown) return
        const st = glyphFn(idx, glyphCount)
        if (st.alpha <= 0.001) return
        c.save()
        c.globalAlpha *= Math.min(1, st.alpha)
        if (st.blur > 0.005) c.filter = `${c.filter === 'none' ? '' : `${c.filter} `}blur(${(st.blur * px).toFixed(2)}px)`
        c.translate(x + gl.x0 + gl.w / 2 + st.dx * px, y + st.dy * px)
        if (st.rot) c.rotate((st.rot * Math.PI) / 180)
        const sx = st.scale * st.sx
        const sy = st.scale * st.sy
        if (sx !== 1 || sy !== 1) c.scale(sx || 1e-4, sy || 1e-4)
        fn(gl.g, -gl.w / 2, 0)
        c.restore()
      })
    })
  }

  // Độ dày các lớp viền (cộng dồn từ trong ra): viền thường trước, rồi các lớp viền thêm của hiệu ứng.
  // Canvas vẽ viền nằm GIỮA đường bao ký tự → lineWidth = 2 × độ dày lộ ra ngoài.
  const baseStroke = style.strokeColor && style.strokeWidth > 0 ? style.strokeWidth * unit * transform.scale * b.scale : 0
  const rings: { color: string; colors?: string[]; reach: number }[] = []
  if (baseStroke > 0) rings.push({ color: style.strokeColor!, reach: baseStroke })
  let reach = baseStroke
  for (const o of fx?.outlines ?? []) {
    reach += o.width * px
    rings.push({ color: o.color, colors: o.colors, reach })
  }
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2

  /** Bóng dáng cả khối chữ (chữ + mọi lớp viền) một màu, dời (dx, dy). */
  const silhouette = (color: string, dx: number, dy: number): void => {
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineWidth = reach * 2
    eachLine((text, x, y) => {
      if (reach > 0) ctx.strokeText(text, x + dx, y + dy)
      ctx.fillText(text, x + dx, y + dy)
    })
  }

  // Lửa cháy: vẽ PHÍA SAU chữ (lửa bốc lên từ chữ, không che mặt chữ)
  if (fx?.decor?.kind === 'flame' && fx.decor.count > 0) drawDecor(ctx, fx.decor, left, top, blockW, blockH, px)

  if (fx) {
    // Bản sao lệch phía sau (glitch đỏ–xanh, viền đôi lệch)
    for (const e of fx.echoes ?? []) {
      const dx = e.dx * px
      const dy = e.dy * px
      if (e.hollow) {
        ctx.strokeStyle = e.color
        ctx.lineWidth = Math.max(1, e.width * px)
        eachLine((text, x, y) => ctx.strokeText(text, x + dx, y + dy))
      } else silhouette(e.color, dx, dy)
    }
    // Khối 3D: nhiều bóng dáng xếp lớp theo hướng nghiêng
    if (fx.extrude && fx.extrude.depth > 0) {
      const depth = fx.extrude.depth * px
      const a = (fx.extrude.angle * Math.PI) / 180
      const steps = Math.min(48, Math.max(2, Math.ceil(depth / 1.2)))
      for (let i = steps; i >= 1; i--) silhouette(fx.extrude.color, (Math.cos(a) * depth * i) / steps, (Math.sin(a) * depth * i) / steps)
    }
    // Bóng đổ
    if (fx.shadow) {
      const blur = fx.shadow.blur * px
      ctx.filter = blur > 0.3 ? withFilter(`blur(${blur.toFixed(2)}px)`) : baseFilter
      silhouette(fx.shadow.color, fx.shadow.dx * px, fx.shadow.dy * px)
      ctx.filter = baseFilter
    }
    // Phát sáng: bóng dáng nhòe đậm, vẽ 2 lần cho sáng rõ
    if (fx.glow && fx.glow.blur > 0) {
      ctx.filter = withFilter(`blur(${(fx.glow.blur * px * 0.5).toFixed(2)}px)`)
      silhouette(fx.glow.color, 0, 0)
      silhouette(fx.glow.color, 0, 0)
      ctx.filter = baseFilter
    }
  }

  // Các lớp viền: ngoài cùng trước (viền chuyển màu: gradient ngang phủ cả khối)
  for (let k = rings.length - 1; k >= 0; k--) {
    const r = rings[k]
    ctx.strokeStyle =
      r.colors && r.colors.length >= 2
        ? gradient(ctx, { colors: r.colors, angle: 0 }, left - r.reach, top - r.reach, blockW + r.reach * 2, blockH + r.reach * 2)
        : r.color
    ctx.lineWidth = r.reach * 2
    eachLine((text, x, y) => ctx.strokeText(text, x, y))
  }

  // Ruột chữ: màu / gradient (chữ rỗng thì bỏ qua); có kết cấu / vát cạnh → vẽ trên lớp tạm
  if (!fx?.hollow) {
    const fillOf = (c: Ctx2D): string | CanvasGradient => (fx?.fill ? gradient(c, fx.fill, left, top, blockW, blockH) : style.color)
    if (fx && (fx.texture || fx.bevel)) drawFillLayer(ctx, fx, fillOf, eachLine, left, top, blockW, blockH, px)
    else {
      ctx.fillStyle = fillOf(ctx)
      eachLine((text, x, y) => ctx.fillText(text, x, y))
    }
  }

  if (fx?.decor && fx.decor.kind !== 'flame' && fx.decor.count > 0) drawDecor(ctx, fx.decor, left, top, blockW, blockH, px)
  ctx.restore()

  return { x: cx + left, y: cy + top, w: blockW, h: blockH }
}

/** Lớp tạm dùng lại giữa các lần vẽ (đủ lớn cho khối chữ lớn nhất từng gặp). */
let layer: OffscreenCanvas | null = null

/**
 * Ruột chữ có kết cấu (kim tuyến, hạt, chấm tram, sọc) và / hoặc vát cạnh: vẽ ruột lên lớp tạm, phủ kết cấu
 * bằng 'source-atop' (chỉ dính trong ruột chữ), rồi dán lớp lên khung hình.
 */
function drawFillLayer(
  ctx: Ctx2D,
  fx: TextFx,
  fillOf: (c: Ctx2D) => string | CanvasGradient,
  eachLine: (fn: (text: string, x: number, y: number) => void, c?: Ctx2D) => void,
  left: number,
  top: number,
  w: number,
  h: number,
  px: number
): void {
  const m = Math.ceil(px * 0.35) // chừa lề (chữ nghiêng, dấu tiếng Việt)
  const lw = Math.ceil(w + m * 2)
  const lh = Math.ceil(h + m * 2)
  if (!layer || layer.width < lw || layer.height < lh) layer = new OffscreenCanvas(Math.max(lw, layer?.width ?? 0), Math.max(lh, layer?.height ?? 0))
  const l = layer.getContext('2d')!
  l.setTransform(1, 0, 0, 1, 0, 0)
  l.globalCompositeOperation = 'source-over'
  l.globalAlpha = 1
  l.filter = 'none'
  l.clearRect(0, 0, lw, lh)
  l.setTransform(1, 0, 0, 1, m - left, m - top)
  l.font = ctx.font
  l.textBaseline = 'middle'
  l.textAlign = 'left'
  l.lineJoin = 'round'
  l.fillStyle = fillOf(l)
  eachLine((text, x, y) => l.fillText(text, x, y), l)

  l.globalCompositeOperation = 'source-atop'
  if (fx.texture) drawTexture(l, fx.texture, left - m, top - m, lw, lh, px)
  if (fx.bevel && fx.bevel.size > 0) {
    const d = fx.bevel.size * px
    l.lineWidth = d
    l.strokeStyle = fx.bevel.dark
    eachLine((text, x, y) => l.strokeText(text, x + d / 2, y + d / 2), l)
    l.strokeStyle = fx.bevel.light
    eachLine((text, x, y) => l.strokeText(text, x - d / 2, y - d / 2), l)
  }
  ctx.drawImage(layer, 0, 0, lw, lh, left - m, top - m, lw, lh)
}

/** Kết cấu phủ trên ruột chữ (đã ở chế độ 'source-atop'). */
function drawTexture(l: OffscreenCanvasRenderingContext2D, tx: NonNullable<TextFx['texture']>, x0: number, y0: number, w: number, h: number, px: number): void {
  const r = rng(Math.round(w * 13 + h * 7))
  l.fillStyle = tx.color
  l.strokeStyle = tx.color
  switch (tx.kind) {
    case 'glitter': {
      const n = Math.round(((w * h) / (px * px)) * 90 * tx.amount)
      for (let i = 0; i < n; i++) {
        l.globalAlpha = 0.35 + r() * 0.65
        const size = px * (0.008 + r() * 0.025)
        l.beginPath()
        l.arc(x0 + r() * w, y0 + r() * h, size, 0, Math.PI * 2)
        l.fill()
      }
      break
    }
    case 'noise': {
      const n = Math.round(((w * h) / (px * px)) * 260 * tx.amount)
      for (let i = 0; i < n; i++) {
        l.globalAlpha = r() * 0.6
        const size = Math.max(1, px * 0.012)
        l.fillRect(x0 + r() * w, y0 + r() * h, size, size)
      }
      break
    }
    case 'halftone': {
      const gap = px * 0.11
      for (let y = y0; y < y0 + h; y += gap)
        for (let x = x0 + ((Math.round((y - y0) / gap) % 2) * gap) / 2; x < x0 + w; x += gap) {
          l.globalAlpha = tx.amount
          l.beginPath()
          l.arc(x, y, gap * (0.12 + 0.3 * ((y - y0) / h)), 0, Math.PI * 2)
          l.fill()
        }
      break
    }
    case 'stripes': {
      const gap = px * 0.14
      l.globalAlpha = tx.amount
      l.lineWidth = gap * 0.35
      for (let x = x0 - h; x < x0 + w + h; x += gap) {
        l.beginPath()
        l.moveTo(x, y0 + h)
        l.lineTo(x + h, y0)
        l.stroke()
      }
      break
    }
  }
  l.globalAlpha = 1
}


/** Gradient tuyến tính phủ cả khối chữ theo góc (độ; 90 = từ trên xuống). */
function gradient(ctx: Ctx2D, fill: { colors: string[]; angle: number; hard?: boolean }, x: number, y: number, w: number, h: number): CanvasGradient {
  const a = (fill.angle * Math.PI) / 180
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
  const mx = x + w / 2
  const my = y + h / 2
  const g = ctx.createLinearGradient(mx - dx * half, my - dy * half, mx + dx * half, my + dy * half)
  const n = fill.colors.length
  if (fill.hard)
    // Chia khúc rõ: mỗi màu chiếm một đoạn bằng nhau (vd. nửa trên trắng, nửa dưới đỏ)
    fill.colors.forEach((c, i) => {
      g.addColorStop(i / n, c)
      g.addColorStop((i + 1) / n - 0.001, c)
    })
  else fill.colors.forEach((c, i) => g.addColorStop(n === 1 ? 0 : i / (n - 1), c))
  return g
}

/** Khung nền: hình theo kiểu (bo góc, viên thuốc, xiên, mép rách, đám mây) + màu / gradient + hoa văn + viền. */
function drawBox(ctx: Ctx2D, box: TextBox, left: number, top: number, w: number, h: number, px: number, seed: number): void {
  const bx = left - box.padX * px
  const by = top - box.padY * px
  const bw = w + box.padX * px * 2
  const bh = h + box.padY * px * 2
  ctx.save()
  ctx.rotate((box.tilt * Math.PI) / 180)

  const path = new Path2D()
  switch (box.shape) {
    case 'pill':
      path.roundRect(bx, by, bw, bh, bh / 2)
      break
    case 'skew': {
      const k = bh * 0.28
      path.moveTo(bx + k, by)
      path.lineTo(bx + bw + k * 0.3, by)
      path.lineTo(bx + bw - k, by + bh)
      path.lineTo(bx - k * 0.3, by + bh)
      path.closePath()
      break
    }
    case 'ragged': {
      // Mép rách: đi quanh hình chữ nhật, mỗi bước lệch ngẫu nhiên (có hạt giống)
      const r = rng(seed * 7919 + 13)
      const amp = px * 0.07
      const step = px * 0.22
      const pts: [number, number][] = []
      const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number): void => {
        const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / step))
        for (let i = 0; i < n; i++) {
          const f = i / n
          const j = (r() - 0.5) * 2 * amp
          pts.push([x0 + (x1 - x0) * f + nx * j, y0 + (y1 - y0) * f + ny * j])
        }
      }
      edge(bx, by, bx + bw, by, 0, 1)
      edge(bx + bw, by, bx + bw, by + bh, 1, 0)
      edge(bx + bw, by + bh, bx, by + bh, 0, 1)
      edge(bx, by + bh, bx, by, 1, 0)
      pts.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)))
      path.closePath()
      break
    }
    case 'cloud': {
      // Đám mây / bong bóng: hình chữ nhật bo + các vòng tròn dọc mép
      const r0 = Math.min(bh * 0.24, bw * 0.15)
      path.roundRect(bx, by, bw, bh, r0)
      const n = Math.max(3, Math.round(bw / (r0 * 1.5)))
      for (let i = 0; i <= n; i++) {
        const x = bx + (bw * i) / n
        path.moveTo(x + r0, by)
        path.arc(x, by, r0, 0, Math.PI * 2)
        path.moveTo(x + r0, by + bh)
        path.arc(x, by + bh, r0, 0, Math.PI * 2)
      }
      for (const x of [bx, bx + bw]) {
        path.moveTo(x + r0, by + bh / 2)
        path.arc(x, by + bh / 2, r0, 0, Math.PI * 2)
      }
      break
    }
    case 'brush': {
      // Vệt cọ: mép trên / dưới gợn nhẹ, hai đầu loe ra và nham nhở
      const r = rng(seed * 104729 + 7)
      const pts: [number, number][] = []
      const n = Math.max(6, Math.round(bw / (px * 0.18)))
      for (let i = 0; i <= n; i++) pts.push([bx + (bw * i) / n, by + (r() - 0.5) * px * 0.08])
      for (let i = 0; i < 5; i++) pts.push([bx + bw + px * (0.05 + r() * 0.25), by + (bh * (i + 0.5)) / 5])
      for (let i = n; i >= 0; i--) pts.push([bx + (bw * i) / n, by + bh + (r() - 0.5) * px * 0.08])
      for (let i = 4; i >= 0; i--) pts.push([bx - px * (0.05 + r() * 0.25), by + (bh * (i + 0.5)) / 5])
      pts.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)))
      path.closePath()
      break
    }
    case 'banner': {
      // Dải ruy băng: hai đầu khía chữ V
      const k = bh * 0.35
      path.moveTo(bx - k, by)
      path.lineTo(bx + bw + k, by)
      path.lineTo(bx + bw, by + bh / 2)
      path.lineTo(bx + bw + k, by + bh)
      path.lineTo(bx - k, by + bh)
      path.lineTo(bx, by + bh / 2)
      path.closePath()
      break
    }
    case 'scribble':
      // Nét vẽ nguệch ngoạc: tô bằng các nét chéo dày bên trong hình bo góc (vẽ riêng bên dưới)
      path.roundRect(bx, by, bw, bh, bh * 0.3)
      break
    default:
      path.roundRect(bx, by, bw, bh, box.radius * px)
  }

  // Viền khung vẽ TRƯỚC (dày gấp đôi) rồi phủ nền lên → chỉ còn đường viền ngoài cùng
  // (khung đám mây ghép từ nhiều vòng tròn: không lộ viền của từng vòng bên trong)
  if (box.stroke && box.stroke.width > 0) {
    ctx.strokeStyle = box.stroke.color
    ctx.lineWidth = box.stroke.width * px * 2
    ctx.lineJoin = 'round'
    ctx.stroke(path)
  }
  if (box.colors.length > 1) {
    const g = ctx.createLinearGradient(0, by, 0, by + bh)
    box.colors.forEach((c, i) => g.addColorStop(i / (box.colors.length - 1), c))
    ctx.fillStyle = g
    ctx.strokeStyle = g
  } else {
    ctx.fillStyle = box.colors[0]
    ctx.strokeStyle = box.colors[0]
  }
  if (box.shape === 'scribble') {
    ctx.save()
    ctx.clip(path)
    ctx.lineCap = 'round'
    const r = rng(seed * 2711 + 3)
    for (let x = bx - bh; x < bx + bw + bh; x += px * 0.17) {
      // Nét bút: dày mỏng, nghiêng hơi khác nhau
      ctx.lineWidth = px * (0.09 + r() * 0.06)
      ctx.beginPath()
      ctx.moveTo(x + (r() - 0.5) * px * 0.08, by + bh + px * 0.1)
      ctx.lineTo(x + bh * (0.6 + r() * 0.2), by - px * 0.1)
      ctx.stroke()
    }
    ctx.restore()
  } else ctx.fill(path)
  if (box.shape === 'brush') {
    // Vệt lông cọ: vài đường ngang mờ
    const r = rng(seed * 31 + 5)
    ctx.save()
    ctx.clip(path)
    ctx.strokeStyle = '#ffffff'
    ctx.lineCap = 'round'
    for (let i = 0; i < 7; i++) {
      ctx.globalAlpha = 0.08 + r() * 0.12
      ctx.lineWidth = px * (0.02 + r() * 0.05)
      const y = by + r() * bh
      const x = bx + r() * bw * 0.4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + bw * (0.3 + r() * 0.6), y + (r() - 0.5) * px * 0.05)
      ctx.stroke()
    }
    ctx.restore()
  }

  if (box.pattern) {
    ctx.save()
    ctx.clip(path)
    ctx.fillStyle = box.pattern.color
    ctx.strokeStyle = box.pattern.color
    const ext = Math.hypot(bw, bh) // phủ cả khi xiên
    const gap = px * 0.3
    if (box.pattern.kind === 'stripes') {
      ctx.lineWidth = gap * 0.4
      for (let x = bx - ext; x < bx + bw + ext; x += gap) {
        ctx.beginPath()
        ctx.moveTo(x, by - 2)
        ctx.lineTo(x + bh, by + bh + 2)
        ctx.stroke()
      }
    } else if (box.pattern.kind === 'dots') {
      for (let y = by + gap / 2; y < by + bh; y += gap)
        for (let x = bx + gap / 2; x < bx + bw; x += gap) {
          ctx.beginPath()
          ctx.arc(x, y, gap * 0.16, 0, Math.PI * 2)
          ctx.fill()
        }
    } else {
      ctx.lineWidth = Math.max(1, px * 0.025)
      for (let x = bx; x < bx + bw; x += gap) {
        ctx.beginPath()
        ctx.moveTo(x, by)
        ctx.lineTo(x, by + bh)
        ctx.stroke()
      }
      for (let y = by; y < by + bh; y += gap) {
        ctx.beginPath()
        ctx.moveTo(bx, y)
        ctx.lineTo(bx + bw, y)
        ctx.stroke()
      }
    }
    ctx.restore()
  }
  ctx.restore()
}

/** Trang trí quanh khối chữ (vị trí cố định theo hạt giống → giống nhau ở mọi khung hình). */
function drawDecor(ctx: Ctx2D, dc: NonNullable<TextFx['decor']>, left: number, top: number, w: number, h: number, px: number): void {
  const r = rng(dc.count * 31 + dc.kind.length * 7 + 7)
  ctx.save()
  ctx.fillStyle = dc.color
  ctx.strokeStyle = dc.color
  /** Một điểm quanh viền khối chữ (cạnh i % 4), đẩy ra ngoài một chút. */
  const around = (i: number): [number, number] => {
    const side = i % 4
    const f = r()
    const out = px * (0.05 + r() * 0.2)
    const x = side < 2 ? left + f * w : side === 2 ? left - out : left + w + out
    const y = side === 0 ? top - out : side === 1 ? top + h + out : top + f * h
    return [x, y]
  }
  switch (dc.kind) {
    case 'sparkle':
      ctx.shadowColor = dc.color
      ctx.shadowBlur = px * 0.15
      for (let i = 0; i < dc.count; i++) {
        const [x, y] = around(i)
        const size = px * (0.1 + r() * 0.14)
        ctx.beginPath()
        ctx.moveTo(x, y - size)
        ctx.quadraticCurveTo(x, y, x + size, y)
        ctx.quadraticCurveTo(x, y, x, y + size)
        ctx.quadraticCurveTo(x, y, x - size, y)
        ctx.quadraticCurveTo(x, y, x, y - size)
        ctx.fill()
      }
      break
    case 'star':
      for (let i = 0; i < dc.count; i++) {
        const [x, y] = around(i)
        const R = px * (0.09 + r() * 0.1)
        ctx.beginPath()
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5
          const rr = k % 2 ? R * 0.45 : R
          if (k === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
          else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
        }
        ctx.closePath()
        ctx.fill()
      }
      break
    case 'heart':
      for (let i = 0; i < dc.count; i++) {
        const [x, y] = around(i)
        const s = px * (0.08 + r() * 0.08)
        ctx.beginPath()
        ctx.moveTo(x, y + s * 0.9)
        ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.3, x, y - s * 0.45)
        ctx.bezierCurveTo(x + s * 0.7, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9)
        ctx.fill()
      }
      break
    case 'bubble':
      ctx.lineWidth = Math.max(1, px * 0.02)
      for (let i = 0; i < dc.count; i++) {
        const [x, y] = around(i)
        ctx.globalAlpha = 0.5 + r() * 0.5
        ctx.beginPath()
        ctx.arc(x, y, px * (0.04 + r() * 0.08), 0, Math.PI * 2)
        if (r() > 0.5) ctx.fill()
        else ctx.stroke()
      }
      break
    case 'snow': {
      // Tuyết phủ trên đầu chữ: các cục tròn dọc mép trên
      const n = Math.max(3, Math.round(w / (px * 0.22)))
      for (let i = 0; i < n; i++) {
        const x = left + ((i + 0.5) * w) / n + (r() - 0.5) * px * 0.08
        ctx.beginPath()
        ctx.ellipse(x, top + px * 0.2, px * (0.1 + r() * 0.08), px * (0.06 + r() * 0.05), 0, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'flame': {
      // Lửa cháy trên đầu chữ: các ngọn lửa (vàng ở gốc → màu lửa → trong suốt ở đỉnh)
      const n = Math.max(3, Math.round(w / (px * 0.28)))
      for (let i = 0; i < n; i++) {
        const x = left + ((i + 0.5) * w) / n + (r() - 0.5) * px * 0.1
        const base = top + px * 0.45
        const fh = px * (0.45 + r() * 0.45)
        const fw = px * (0.12 + r() * 0.08)
        const g = ctx.createLinearGradient(0, base, 0, base - fh)
        g.addColorStop(0, '#fff3a0')
        g.addColorStop(0.35, dc.color)
        g.addColorStop(1, 'rgba(255,60,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(x - fw, base)
        ctx.quadraticCurveTo(x - fw * 1.1, base - fh * 0.5, x + (r() - 0.5) * fw, base - fh)
        ctx.quadraticCurveTo(x + fw * 1.1, base - fh * 0.5, x + fw, base)
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'drip': {
      // Sơn chảy dưới chữ
      const n = Math.max(2, dc.count)
      for (let i = 0; i < n; i++) {
        const x = left + r() * w
        const len = px * (0.15 + r() * 0.4)
        const dw = px * (0.04 + r() * 0.04)
        const y0 = top + h - px * 0.25
        ctx.beginPath()
        ctx.roundRect(x - dw / 2, y0, dw, len, dw / 2)
        ctx.arc(x, y0 + len, dw * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'confetti': {
      const palette = [dc.color, '#ff4f8b', '#ffd400', '#2ecc71', '#1e90ff', '#9b30ff']
      for (let i = 0; i < dc.count; i++) {
        const [x, y] = around(i)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(r() * Math.PI)
        ctx.fillStyle = palette[i % palette.length]
        ctx.fillRect(-px * 0.04, -px * 0.015, px * 0.08, px * 0.03)
        ctx.restore()
      }
      break
    }
  }
  ctx.restore()
}
