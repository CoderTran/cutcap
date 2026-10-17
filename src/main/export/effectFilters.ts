// Hiệu ứng video → bộ lọc FFmpeg (phần "xuất" của shared/render/effects.ts).
// Mỗi loại phép ở đây phải cho ra cùng hình với bản Canvas trong renderer/src/engine/effects/applyEffect.ts.
//
// Khung hình đi qua hiệu ứng ở dạng gbrp (RGB tách lớp) để mọi phép tính màu đúng như trên canvas.
import type { Micros } from '@shared/project/time'
import { ffmpegFiltersFromOps } from '@shared/render/colorMath'
import {
  barPx,
  blurPx,
  coverCrop,
  framedLayout,
  gridBorderPx,
  pixelGrid,
  scanlineSpacing,
  shiftPx,
  splitSizes,
  type EffectDef,
  type EffectOp
} from '@shared/render/effects'
import { ffmpegExpr } from '@shared/render/expr'

/** Viền đen quanh khung khi biến đổi (phóng/xoay/dời): perspective lấy màu mép cho phần ngoài ảnh. */
const MARGIN = 4

const n = (v: number): string => String(Number(v.toFixed(6)))

export interface EffectFilterContext {
  W: number
  H: number
  fps: number
  /** Đầu clip hiệu ứng trên timeline (µs) – thời gian của biểu thức tính từ đây. */
  start: Micros
  /** Tiền tố nhãn riêng cho clip này (không trùng các clip khác trong filtergraph). */
  uid: string
}

/**
 * Các câu lệnh filtergraph áp hiệu ứng lên [inLabel] → [outLabel].
 * Đầu vào là nhánh đã cắt (trim) đúng khoảng của clip nhưng GIỮ mốc thời gian gốc:
 *   - bộ lọc dùng "t"/"T" (crop, eq, geq, blend, enable): thời gian cục bộ = t − start
 *   - perspective dùng số khung "on" (đếm từ 0 ở đầu nhánh): thời gian cục bộ = on / fps
 */
export function effectStatements(def: EffectDef, inLabel: string, outLabel: string, ctx: EffectFilterContext): string[] {
  const s = (ctx.start / 1_000_000).toFixed(6)
  const local = { t: `(t-${s})`, T: `(T-${s})`, on: `(on/${ctx.fps})` }
  const out: string[] = []
  let cur = `${ctx.uid}in`
  out.push(`[${inLabel}]format=gbrp[${cur}]`)
  def.ops.forEach((op, i) => {
    const next = `${ctx.uid}o${i}`
    out.push(...opStatements(op, cur, next, ctx, local, `${ctx.uid}${i}`))
    cur = next
  })
  out.push(`[${cur}]null[${outLabel}]`)
  return out
}

function chain(inL: string, outL: string, filters: string[]): string[] {
  return [`[${inL}]${filters.length > 0 ? filters.join(',') : 'null'}[${outL}]`]
}

function opStatements(
  op: EffectOp,
  inL: string,
  outL: string,
  { W, H }: EffectFilterContext,
  local: { t: string; T: string; on: string },
  p: string
): string[] {
  switch (op.type) {
    case 'color':
      // lutrgb cần RGB đóng gói → đổi qua rgb24 rồi về lại gbrp
      return chain(inL, outL, ['format=rgb24', ...ffmpegFiltersFromOps(op.ops), 'format=gbrp'])

    case 'invert':
      return chain(inL, outL, ['format=rgb24', 'negate', 'format=gbrp'])

    case 'hueCycle': {
      // Ma trận hue-rotate của CSS (giống colorMath.hueRotateMatrix), góc thay đổi theo thời gian
      const a = `((${ffmpegExpr(op.degrees, local.T)})*PI/180)`
      const c = `cos(${a})`
      const sn = `sin(${a})`
      const rows = [
        [`0.213+${c}*0.787-${sn}*0.213`, `0.715-${c}*0.715-${sn}*0.715`, `0.072-${c}*0.072+${sn}*0.928`],
        [`0.213-${c}*0.213+${sn}*0.143`, `0.715+${c}*0.285+${sn}*0.14`, `0.072-${c}*0.072-${sn}*0.283`],
        [`0.213-${c}*0.213-${sn}*0.787`, `0.715-${c}*0.715+${sn}*0.715`, `0.072+${c}*0.928+${sn}*0.072`]
      ]
      const ch = (row: string[]): string => `clip((${row[0]})*r(X,Y)+(${row[1]})*g(X,Y)+(${row[2]})*b(X,Y),0,255)`
      return chain(inL, outL, [`geq=r='${ch(rows[0])}':g='${ch(rows[1])}':b='${ch(rows[2])}'`])
    }

    case 'blur':
      return chain(inL, outL, [`gblur=sigma=${n(blurPx(op.radius, H))}`])

    case 'glow':
      // Bản mờ phủ lên bằng "screen" với độ đậm opacity – giống canvas: globalAlpha + 'screen'
      return [
        `[${inL}]split[${p}a][${p}b]`,
        `[${p}b]gblur=sigma=${n(blurPx(op.radius, H))}[${p}g]`,
        `[${p}a][${p}g]blend=all_mode=screen:all_opacity=${n(op.opacity)}[${outL}]`
      ]

    case 'transform': {
      // Biến đổi quanh tâm khung; phần trống (thu nhỏ/xoay/dời) là màu đen như preview
      const S = `(${ffmpegExpr(op.scale, local.on)})`
      const SX = `(${ffmpegExpr(op.sx ?? '1', local.on)})`
      const DX = `(${ffmpegExpr(op.dx, local.on)})`
      const DY = `(${ffmpegExpr(op.dy, local.on)})`
      const A = `((${ffmpegExpr(op.rotate, local.on)})*PI/180)`
      const CW = W + 2 * MARGIN
      const CH = H + 2 * MARGIN
      const corner = (px: number, py: number): [string, string] => {
        const dx = px - (MARGIN + W / 2)
        const dy = py - (MARGIN + H / 2)
        return [
          `${W / 2}+${W}*${DX}+${S}*(${SX}*(${dx})*cos(${A})-(${dy})*sin(${A}))`,
          `${H / 2}+${H}*${DY}+${S}*(${SX}*(${dx})*sin(${A})+(${dy})*cos(${A}))`
        ]
      }
      const coords = [corner(0, 0), corner(CW, 0), corner(0, CH), corner(CW, CH)]
        .map(([x, y], i) => `x${i}='${x}':y${i}='${y}'`)
        .join(':')
      return chain(inL, outL, [
        `pad=${CW}:${CH}:${MARGIN}:${MARGIN}:color=black`,
        `perspective=${coords}:sense=destination:eval=frame`,
        `crop=${W}:${H}:0:0`
      ])
    }

    case 'flash': {
      // Pha về một màu: A + (màu − A) × amount
      const k = `clip(${ffmpegExpr(op.amount, local.T)},0,1)`
      return [
        `[${inL}]split[${p}a][${p}b]`,
        `[${p}b]drawbox=x=0:y=0:w=iw:h=ih:c=${op.color}:t=fill[${p}c]`,
        `[${p}a][${p}c]blend=all_expr='A+(B-A)*${k}'[${outL}]`
      ]
    }

    case 'vignette': {
      // Tối dần theo khoảng cách tới tâm (tỉ lệ nửa đường chéo) – giống radial gradient của canvas
      const half = Math.hypot(W / 2, H / 2)
      const f = `(1-${n(op.strength)}*clip((hypot(X-${W / 2},Y-${H / 2})/${n(half)}-${n(op.inner)})/${n(op.outer - op.inner)},0,1))`
      return chain(inL, outL, [`geq=r='r(X,Y)*${f}':g='g(X,Y)*${f}':b='b(X,Y)*${f}'`])
    }

    case 'bars': {
      if (!/\bt\b/.test(op.size)) {
        // Cố định → drawbox (nhanh). Lưu ý: trong drawbox "t" là độ dày nét, KHÔNG phải thời gian
        const h = barPx(Number(op.size), H)
        return chain(inL, outL, [
          `drawbox=x=0:y=0:w=iw:h=${h}:c=black:t=fill`,
          `drawbox=x=0:y=${H - h}:w=iw:h=${h}:c=black:t=fill`
        ])
      }
      // Thay đổi theo thời gian (màn trập) → geq: tô đen các hàng trong 2 dải
      const hh = `round(${H}*clip(${ffmpegExpr(op.size, local.T)},0,0.5))`
      const f = `(1-gt(lt(Y,${hh})+gte(Y,${H}-${hh}),0))`
      return chain(inL, outL, [`geq=r='r(X,Y)*${f}':g='g(X,Y)*${f}':b='b(X,Y)*${f}'`])
    }

    case 'wave': {
      // Lấy mẫu từ vị trí dời: hàng Y lấy điểm (X − dx(Y)) → nội dung dời sang phải dx – giống canvas vẽ dải dời +dx
      const phase = (coord: string, size: number): string => `sin(2*PI*(${n(op.cycles)}*${coord}/${size}+${n(op.speed)}*${local.T}))`
      const sample =
        op.axis === 'h'
          ? (c: string): string => `${c}(X-${n(op.amp * W)}*${phase('Y', H)},Y)`
          : (c: string): string => `${c}(X,Y-${n(op.amp * H)}*${phase('X', W)})`
      return chain(inL, outL, [`geq=r='${sample('r')}':g='${sample('g')}':b='${sample('b')}'`])
    }

    case 'framed': {
      const L = framedLayout(W, H, op.scale, op.border)
      return [
        `[${inL}]split[${p}bg][${p}fg]`,
        `[${p}bg]gblur=sigma=${n(blurPx(op.blur, H))}[${p}bb]`,
        `[${p}fg]scale=${L.fw}:${L.fh}:flags=bicubic,pad=${L.fw + 2 * L.b}:${L.fh + 2 * L.b}:${L.b}:${L.b}:color=white[${p}card]`,
        `[${p}bb][${p}card]overlay=x=${L.x}:y=${L.y}[${outL}]`
      ]
    }

    case 'overlay':
      // Lớp phủ vẽ: graphBuilder phủ các khung PNG đã vẽ sẵn lên sau cùng – ở đây không làm gì
      return chain(inL, outL, [])

    case 'mirror': {
      if (op.mode === 'h') {
        return [
          `[${inL}]crop=${W / 2}:${H}:0:0,split[${p}l][${p}r]`,
          `[${p}r]hflip[${p}f]`,
          `[${p}l][${p}f]hstack[${outL}]`
        ]
      }
      if (op.mode === 'v') {
        return [
          `[${inL}]crop=${W}:${H / 2}:0:0,split[${p}t][${p}b]`,
          `[${p}b]vflip[${p}f]`,
          `[${p}t][${p}f]vstack[${outL}]`
        ]
      }
      return [
        `[${inL}]crop=${W / 2}:${H / 2}:0:0,split[${p}tl][${p}x]`,
        `[${p}x]hflip[${p}tr]`,
        `[${p}tl][${p}tr]hstack,split[${p}top][${p}z]`,
        `[${p}z]vflip[${p}bot]`,
        `[${p}top][${p}bot]vstack[${outL}]`
      ]
    }

    case 'grid': {
      const ws = splitSizes(W, op.cols)
      const hs = splitSizes(H, op.rows)
      const count = op.cols * op.rows
      const lines: string[] = [count > 1 ? `[${inL}]split=${count}${Array.from({ length: count }, (_, i) => `[${p}s${i}]`).join('')}` : `[${inL}]null[${p}s0]`]
      for (let r = 0; r < op.rows; r++) {
        for (let c = 0; c < op.cols; c++) {
          const i = r * op.cols + c
          // Ô có viền: ảnh nhỏ hơn ô 2 lần viền, đệm màu viền xung quanh; flipAlt: ô xen kẽ lật gương
          const b = gridBorderPx(op.border, H)
          const iw = Math.max(2, ws[c] - 2 * b)
          const ih = Math.max(2, hs[r] - 2 * b)
          const crop = coverCrop(W, H, iw, ih)
          const flip = op.flipAlt && (r + c) % 2 === 1 ? ',hflip' : ''
          const pad = b > 0 ? `,pad=${ws[c]}:${hs[r]}:${b}:${b}:color=${op.borderColor ?? 'white'}` : ''
          lines.push(`[${p}s${i}]crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${iw}:${ih}:flags=bicubic${flip}${pad},setsar=1[${p}c${i}]`)
        }
        const cells = Array.from({ length: op.cols }, (_, c) => `[${p}c${r * op.cols + c}]`).join('')
        lines.push(op.cols > 1 ? `${cells}hstack=inputs=${op.cols}[${p}r${r}]` : `${cells}null[${p}r${r}]`)
      }
      const rowsL = Array.from({ length: op.rows }, (_, r) => `[${p}r${r}]`).join('')
      lines.push(op.rows > 1 ? `${rowsL}vstack=inputs=${op.rows}[${outL}]` : `${rowsL}null[${outL}]`)
      return lines
    }

    case 'flip':
      return chain(inL, outL, [op.axis === 'h' ? 'hflip' : 'vflip'])

    case 'pixelate': {
      const g = pixelGrid(op.blocks, W, H)
      return chain(inL, outL, [`scale=${g.w}:${g.h}:flags=neighbor`, `scale=${W}:${H}:flags=neighbor`])
    }

    case 'rgbSplit': {
      const a = shiftPx(op.amount, W)
      const enable = op.gate ? `:enable='gt(${ffmpegExpr(op.gate, local.t)},0)'` : ''
      return chain(inL, outL, [`rgbashift=rh=${-a}:bh=${a}:edge=smear${enable}`])
    }

    case 'scanlines': {
      // Vạch tối dày ~40% khoảng cách, lặp mỗi `sp` dòng – canvas vẽ đúng các vạch này
      const sp = scanlineSpacing(op.spacing, H)
      const th = Math.max(1, Math.round(sp * 0.4))
      const f = `(1-${n(op.opacity)}*lt(mod(Y,${sp}),${th}))`
      return chain(inL, outL, [`geq=r='r(X,Y)*${f}':g='g(X,Y)*${f}':b='b(X,Y)*${f}'`])
    }

    case 'grain':
      // Nhiễu ngẫu nhiên theo thời gian (t) và đều (u) – preview cũng là nhiễu ngẫu nhiên cùng độ mạnh
      return chain(inL, outL, [`noise=alls=${Math.round(op.amount * 100)}:allf=t+u`])
  }
}
