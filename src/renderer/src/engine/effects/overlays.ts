// Lớp phủ VẼ của hiệu ứng (tim bay, lấp lánh, sao rơi, đếm ngược, quét sáng…).
//
// Vẽ lên một lớp TRONG SUỐT. Preview vẽ trực tiếp mỗi khung; khi xuất video, renderEffectFrames vẽ
// sẵn từng khung bằng CHÍNH các hàm này rồi FFmpeg phủ lên → video xuất giống hệt preview.
//
// Mọi chuyển động là HÀM CỦA THỜI GIAN t (giây từ đầu clip hiệu ứng), không lưu trạng thái:
// mỗi hạt có thông số "ngẫu nhiên" lấy từ bộ sinh số có hạt giống cố định → lần nào vẽ cũng như nhau.
// Kích thước tính theo U = cạnh ngắn của khung → giống nhau ở mọi độ phân giải.
import type { OverlayKind } from '@shared/render/effects'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32): cùng hạt giống → cùng dãy số. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

interface Particle {
  x: number
  y: number
  size: number
  speed: number
  phase: number
  freq: number
  hue: number
  spin: number
}

const particleCache = new Map<string, Particle[]>()
/** n hạt với thông số cố định cho từng loại lớp phủ. */
function particles(kind: string, n: number): Particle[] {
  const key = `${kind}:${n}`
  const hit = particleCache.get(key)
  if (hit) return hit
  let seed = 0
  for (const ch of kind) seed = (seed * 31 + ch.charCodeAt(0)) | 0
  const r = rng(seed)
  const list = Array.from({ length: n }, () => ({
    x: r(),
    y: r(),
    size: r(),
    speed: r(),
    phase: r(),
    freq: r(),
    hue: r(),
    spin: r()
  }))
  particleCache.set(key, list)
  return list
}

const frac = (v: number): number => v - Math.floor(v)
const TAU = Math.PI * 2

function heartPath(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.beginPath()
  ctx.moveTo(cx, cy + s * 0.35)
  ctx.bezierCurveTo(cx - s * 0.9, cy - s * 0.25, cx - s * 0.45, cy - s * 0.95, cx, cy - s * 0.45)
  ctx.bezierCurveTo(cx + s * 0.45, cy - s * 0.95, cx + s * 0.9, cy - s * 0.25, cx, cy + s * 0.35)
  ctx.closePath()
}

function starPath(ctx: Ctx, cx: number, cy: number, r: number, points = 4, inner = 0.22): void {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * TAU - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * inner
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
}

function softDot(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = alpha
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  ctx.globalAlpha = 1
}

export function drawOverlay(ctx: Ctx, kind: OverlayKind, W: number, H: number, t: number): void {
  const U = Math.min(W, H)
  ctx.save()
  try {
    DRAW[kind](ctx, W, H, U, t)
  } finally {
    ctx.restore()
  }
}

const DRAW: Record<OverlayKind, (ctx: Ctx, W: number, H: number, U: number, t: number) => void> = {
  // Tim hồng bay lên, lắc nhẹ, mờ dần khi lên cao
  hearts(ctx, W, H, U, t) {
    for (const p of particles('hearts', 16)) {
      const life = frac(p.phase + t * (0.18 + p.speed * 0.2))
      const x = (p.x + 0.04 * Math.sin(TAU * (t * (0.5 + p.freq) + p.phase))) * W
      const y = (1.1 - life * 1.25) * H
      const s = U * (0.035 + p.size * 0.045)
      ctx.globalAlpha = Math.min(1, (1 - life) * 1.6) * 0.9
      ctx.fillStyle = `hsl(${335 + p.hue * 25}, 90%, ${60 + p.hue * 15}%)`
      heartPath(ctx, x, y, s)
      ctx.fill()
    }
  },
  // Ngôi sao 4 cánh nhấp nháy tại chỗ, có quầng sáng
  sparkle(ctx, W, H, U, t) {
    for (const p of particles('sparkle', 26)) {
      const k = Math.max(0, Math.sin(TAU * (t * (0.6 + p.freq * 1.2) + p.phase)))
      if (k <= 0.02) continue
      const x = p.x * W
      const y = p.y * H
      const r = U * (0.012 + p.size * 0.03) * k
      softDot(ctx, x, y, r * 2.2, 'rgba(255,245,200,0.9)', 0.5 * k)
      ctx.globalAlpha = k
      ctx.fillStyle = p.hue > 0.5 ? '#fff' : '#ffe9a6'
      starPath(ctx, x, y, r)
      ctx.fill()
    }
  },
  // Sao băng rơi chéo, có vệt sáng phía sau
  starDrops(ctx, W, H, U, t) {
    ctx.lineCap = 'round'
    for (const p of particles('starDrops', 12)) {
      const life = frac(p.phase + t * (0.35 + p.speed * 0.35))
      const x = (p.x * 1.3 - 0.15 + life * 0.35) * W
      const y = (-0.1 + life * 1.25) * H
      const len = U * (0.12 + p.size * 0.12)
      const g = ctx.createLinearGradient(x, y, x - len * 0.35, y - len)
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.strokeStyle = g
      ctx.lineWidth = U * 0.006
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - len * 0.35, y - len)
      ctx.stroke()
      ctx.fillStyle = '#fff8d0'
      starPath(ctx, x, y, U * (0.014 + p.size * 0.01), 5, 0.45)
      ctx.fill()
    }
  },
  // Bụi sáng lơ lửng bay lên chậm
  dust(ctx, W, H, U, t) {
    for (const p of particles('dust', 45)) {
      const x = frac(p.x + 0.03 * Math.sin(TAU * (t * 0.2 + p.phase))) * W
      const y = frac(p.y - t * (0.03 + p.speed * 0.05)) * H
      const tw = 0.5 + 0.5 * Math.sin(TAU * (t * (0.5 + p.freq) + p.phase))
      softDot(ctx, x, y, U * (0.008 + p.size * 0.02), `hsla(${40 + p.hue * 30}, 100%, 85%, 1)`, 0.35 + 0.5 * tw)
    }
  },
  // Bướm bay lượn, cánh vỗ
  butterflies(ctx, W, H, U, t) {
    for (const p of particles('butterflies', 7)) {
      const x = frac(p.x + t * (0.04 + p.speed * 0.05)) * W
      const y = (p.y * 0.8 + 0.1 + 0.06 * Math.sin(TAU * (t * (0.4 + p.freq * 0.3) + p.phase))) * H
      const s = U * (0.03 + p.size * 0.025)
      const flap = 0.25 + 0.75 * Math.abs(Math.cos(TAU * t * (2.2 + p.freq)))
      const color = `hsl(${p.hue * 360}, 85%, 65%)`
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(0.3 * Math.sin(TAU * (t + p.phase)))
      for (const side of [-1, 1]) {
        ctx.save()
        ctx.scale(side * flap, 1)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.ellipse(s * 0.55, -s * 0.3, s * 0.55, s * 0.42, -0.5, 0, TAU)
        ctx.ellipse(s * 0.45, s * 0.35, s * 0.38, s * 0.3, 0.6, 0, TAU)
        ctx.fill()
        ctx.restore()
      }
      ctx.fillStyle = '#2a1a10'
      ctx.fillRect(-s * 0.06, -s * 0.5, s * 0.12, s)
      ctx.restore()
    }
  },
  // Pháo giấy rơi, xoay
  confetti(ctx, W, H, U, t) {
    for (const p of particles('confetti', 70)) {
      const life = frac(p.phase + t * (0.25 + p.speed * 0.25))
      const x = (p.x + 0.05 * Math.sin(TAU * (t * (0.8 + p.freq) + p.phase))) * W
      const y = (-0.05 + life * 1.1) * H
      const w = U * (0.012 + p.size * 0.012)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(TAU * (t * (0.5 + p.spin) + p.phase))
      ctx.scale(1, Math.cos(TAU * (t * (1 + p.freq) + p.phase)))
      ctx.fillStyle = `hsl(${p.hue * 360}, 90%, 60%)`
      ctx.fillRect(-w / 2, -w * 0.3, w, w * 0.6)
      ctx.restore()
    }
  },
  // Bong bóng xà phòng bay lên
  bubbles(ctx, W, H, U, t) {
    for (const p of particles('bubbles', 18)) {
      const life = frac(p.phase + t * (0.12 + p.speed * 0.15))
      const x = (p.x + 0.03 * Math.sin(TAU * (t * (0.5 + p.freq) + p.phase))) * W
      const y = (1.1 - life * 1.25) * H
      const r = U * (0.025 + p.size * 0.05)
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
      g.addColorStop(0, 'rgba(255,255,255,0.05)')
      g.addColorStop(0.85, `hsla(${180 + p.hue * 120}, 80%, 80%, 0.18)`)
      g.addColorStop(1, 'rgba(255,255,255,0.65)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.beginPath()
      ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.18, r * 0.1, -0.6, 0, TAU)
      ctx.fill()
    }
  },
  // Tuyết rơi lất phất
  snow(ctx, W, H, U, t) {
    ctx.fillStyle = '#fff'
    for (const p of particles('snow', 110)) {
      const life = frac(p.phase + t * (0.08 + p.speed * 0.12))
      const x = frac(p.x + 0.03 * Math.sin(TAU * (t * (0.3 + p.freq * 0.4) + p.phase))) * W
      const y = (-0.02 + life * 1.04) * H
      ctx.globalAlpha = 0.55 + p.size * 0.45
      ctx.beginPath()
      ctx.arc(x, y, U * (0.002 + p.size * 0.006), 0, TAU)
      ctx.fill()
    }
  },
  // Mưa xiên
  rain(ctx, W, H, U, t) {
    ctx.strokeStyle = 'rgba(200,215,235,0.55)'
    ctx.lineWidth = Math.max(1, U * 0.0025)
    ctx.beginPath()
    for (const p of particles('rain', 140)) {
      const life = frac(p.phase + t * (1.1 + p.speed * 0.8))
      const x = (p.x * 1.2 - 0.1 + life * 0.08) * W
      const y = (-0.1 + life * 1.2) * H
      const len = U * (0.04 + p.size * 0.05)
      ctx.moveTo(x, y)
      ctx.lineTo(x - len * 0.18, y - len)
    }
    ctx.stroke()
  },
  // Đếm ngược 3 – 2 – 1: số lớn giữa khung, vòng tròn chạy, nền tối nhẹ
  countdown(ctx, W, H, U, t) {
    if (t >= 3) return
    const n = 3 - Math.floor(t)
    const k = frac(t)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, W, H)
    const r = U * 0.28
    ctx.lineWidth = U * 0.02
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, r, 0, TAU)
    ctx.stroke()
    ctx.strokeStyle = '#fff'
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, r, -Math.PI / 2, -Math.PI / 2 + TAU * k)
    ctx.stroke()
    const pop = 1 + 0.25 * Math.exp(-10 * k)
    ctx.fillStyle = '#fff'
    ctx.font = `700 ${Math.round(U * 0.32 * pop)}px "Segoe UI", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), W / 2, H / 2 + U * 0.01)
  },
  // Dải sáng chéo quét ngang khung
  lightSweep(ctx, W, H, U, t) {
    const pos = frac(t / 1.6) * 1.8 - 0.4
    const cx = pos * W
    const bw = U * 0.35
    ctx.translate(cx, H / 2)
    ctx.rotate(0.35)
    const g = ctx.createLinearGradient(-bw, 0, bw, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(-bw, -H, bw * 2, H * 2)
  },
  // Đĩa bay phía trên chiếu tia sáng xuống, nhấp nháy
  ufoBeam(ctx, W, H, U, t) {
    const x = W / 2 + Math.sin(TAU * t * 0.3) * W * 0.05
    const top = H * 0.12
    const pulse = 0.55 + 0.25 * Math.sin(TAU * t * 2)
    const g = ctx.createLinearGradient(0, top, 0, H)
    g.addColorStop(0, `rgba(180,255,200,${0.6 * pulse})`)
    g.addColorStop(1, 'rgba(180,255,200,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x - U * 0.08, top)
    ctx.lineTo(x + U * 0.08, top)
    ctx.lineTo(x + U * 0.42, H)
    ctx.lineTo(x - U * 0.42, H)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#9aa3b5'
    ctx.beginPath()
    ctx.ellipse(x, top, U * 0.17, U * 0.045, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(170,230,255,0.9)'
    ctx.beginPath()
    ctx.ellipse(x, top - U * 0.03, U * 0.07, U * 0.05, 0, Math.PI, TAU)
    ctx.fill()
    for (let i = 0; i < 5; i++) {
      const on = Math.floor(t * 6 + i) % 2 === 0
      ctx.fillStyle = on ? '#ffe66b' : '#c94'
      ctx.beginPath()
      ctx.arc(x + (i - 2) * U * 0.06, top + U * 0.012, U * 0.01, 0, TAU)
      ctx.fill()
    }
  },
  // Vệt sáng ấm "rò" vào từ mép khung, trôi chậm
  lightLeak(ctx, W, H, U, t) {
    ctx.globalCompositeOperation = 'lighter'
    const blobs = [
      { x: 0.05, y: 0.2, c: 'rgba(255,120,40,0.55)', r: 0.75, f: 0.13 },
      { x: 0.95, y: 0.75, c: 'rgba(255,60,120,0.45)', r: 0.7, f: 0.11 },
      { x: 0.6, y: 0.05, c: 'rgba(255,210,90,0.4)', r: 0.6, f: 0.17 }
    ]
    for (const [i, b] of blobs.entries()) {
      const x = (b.x + 0.12 * Math.sin(TAU * (t * b.f + i * 0.3))) * W
      const y = (b.y + 0.1 * Math.cos(TAU * (t * b.f + i * 0.5))) * H
      softDot(ctx, x, y, U * b.r, b.c, 0.6 + 0.3 * Math.sin(TAU * (t * 0.3 + i)))
    }
  },
  // Lóe ống kính: nguồn sáng trôi + chuỗi vòng tròn đối xứng qua tâm
  lensFlare(ctx, W, H, U, t) {
    ctx.globalCompositeOperation = 'lighter'
    const sx = (0.15 + 0.7 * frac(t / 4)) * W
    const sy = (0.2 + 0.1 * Math.sin(TAU * t * 0.2)) * H
    softDot(ctx, sx, sy, U * 0.3, 'rgba(255,240,200,0.9)', 0.8)
    const dx = W / 2 - sx
    const dy = H / 2 - sy
    const rings = [
      [0.4, 0.05, 'rgba(120,200,255,0.5)'],
      [0.8, 0.08, 'rgba(255,160,90,0.35)'],
      [1.3, 0.04, 'rgba(160,255,180,0.45)'],
      [1.7, 0.12, 'rgba(200,140,255,0.25)']
    ] as const
    for (const [k, r, c] of rings) softDot(ctx, sx + dx * k * 2, sy + dy * k * 2, U * r, c, 1)
  },
  // Bóng đá nảy ngang qua khung
  soccer(ctx, W, H, U, t) {
    for (const p of particles('soccer', 5)) {
      const r = U * (0.05 + p.size * 0.03)
      const x = frac(p.x + t * (0.12 + p.speed * 0.15)) * (W + 4 * r) - 2 * r
      const bounce = Math.abs(Math.sin(TAU * (t * (0.6 + p.freq * 0.5) + p.phase) / 2))
      const y = H - r - bounce * H * (0.35 + p.y * 0.4)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(TAU * t * (0.5 + p.spin))
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#222'
      ctx.lineWidth = r * 0.06
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#222'
      starPath(ctx, 0, 0, r * 0.38, 5, 0.8)
      ctx.fill()
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU - Math.PI / 2
        ctx.beginPath()
        ctx.arc(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.17, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    }
  },
  // Lửa bốc lên từ đáy khung (nhiều đốm sáng vàng → cam → đỏ, cộng sáng)
  fire(ctx, W, H, U, t) {
    ctx.globalCompositeOperation = 'lighter'
    for (const p of particles('fire', 90)) {
      const life = frac(p.phase + t * (0.8 + p.speed * 0.9))
      const x = (p.x + 0.03 * Math.sin(TAU * (t * 2 + p.phase))) * W
      const y = H - life * H * (0.25 + p.size * 0.25)
      const r = U * (0.06 + p.size * 0.07) * (1 - life * 0.7)
      const hue = 50 - life * 45
      softDot(ctx, x, y, r, `hsla(${hue}, 100%, ${60 - life * 15}%, 1)`, (1 - life) * 0.55)
    }
  },
  // Đèn disco: các đốm màu xoay quanh khung
  disco(ctx, W, H, U, t) {
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 7; i++) {
      const a = TAU * (t * 0.25 + i / 7)
      const x = W / 2 + Math.cos(a) * W * 0.32
      const y = H / 2 + Math.sin(a * 1.3) * H * 0.3
      softDot(ctx, x, y, U * 0.28, `hsla(${(i * 51 + t * 90) % 360}, 100%, 60%, 1)`, 0.45)
    }
  },
  // Phim trầy: vạch dọc + đốm bụi đổi theo từng "khung phim" (24 lần/giây)
  scratches(ctx, W, H, U, t) {
    const frame = Math.floor(t * 24)
    const r = rng(frame * 7919 + 13)
    ctx.strokeStyle = 'rgba(30,25,20,0.55)'
    const lines = 1 + Math.floor(r() * 3)
    for (let i = 0; i < lines; i++) {
      const x = r() * W
      ctx.lineWidth = Math.max(1, U * 0.0015 * (1 + r() * 2))
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + (r() - 0.5) * U * 0.02, H)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(20,15,10,0.6)'
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      ctx.arc(r() * W, r() * H, U * 0.002 * (1 + r() * 3), 0, TAU)
      ctx.fill()
    }
  }
}
