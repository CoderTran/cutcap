// Biểu thức theo thời gian dùng CHUNG cho preview và xuất video.
//
// Công thức chuyển động của hiệu ứng (rung, nhịp đập, chớp sáng…) viết MỘT LẦN theo cú pháp biểu thức
// của FFmpeg, ví dụ "0.04*sin(2*PI*t*3)":
//   - Xuất video: đưa thẳng vào bộ lọc FFmpeg (thay "t" bằng thời gian cục bộ của hiệu ứng)
//   - Preview: dịch sang hàm JavaScript và tính trực tiếp
// → hai bên tính ra đúng cùng một con số.
//
// Chỉ hỗ trợ tập con an toàn: số, t, PI, + − × ÷, ( ), và các hàm trong FUNCS.

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  abs: Math.abs,
  floor: Math.floor,
  exp: Math.exp,
  sqrt: Math.sqrt,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  // Giống FFmpeg: mod(x, y) = x − y·floor(x/y)
  mod: (x, y) => x - y * Math.floor(x / y),
  lt: (a, b) => (a < b ? 1 : 0),
  gt: (a, b) => (a > b ? 1 : 0),
  gte: (a, b) => (a >= b ? 1 : 0),
  lte: (a, b) => (a <= b ? 1 : 0),
  between: (x, a, b) => (x >= a && x <= b ? 1 : 0),
  clip: (x, a, b) => Math.min(b, Math.max(a, x)),
  if: (c, a, b) => (c !== 0 ? a : b)
}

const TOKEN = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|(.))/gy

export type CompiledExpr = (t: number) => number

const cache = new Map<string, CompiledExpr>()

/**
 * Dịch biểu thức FFmpeg sang hàm JS. Báo lỗi nếu có tên lạ (để bắt lỗi gõ sai ngay trong test).
 * Không dùng eval trực tiếp trên chuỗi người dùng – chỉ dùng cho biểu thức viết sẵn trong mã.
 */
export function compileExpr(expr: string): CompiledExpr {
  const hit = cache.get(expr)
  if (hit) return hit
  let js = ''
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while (TOKEN.lastIndex < expr.length && (m = TOKEN.exec(expr))) {
    const [, numTok, name, sym] = m
    if (numTok !== undefined) js += numTok
    else if (name !== undefined) {
      if (name === 't') js += 't'
      else if (name === 'PI') js += 'Math.PI'
      else if (name in FUNCS) js += `F.${name === 'if' ? 'iff' : name}`
      else throw new Error(`Biểu thức có tên lạ "${name}": ${expr}`)
    } else if (sym !== undefined) {
      if (!'+-*/(),'.includes(sym)) throw new Error(`Biểu thức có ký tự lạ "${sym}": ${expr}`)
      js += sym
    }
  }
  const F = { ...FUNCS, iff: FUNCS.if }
  const fn = new Function('F', 't', `return (${js})`) as (f: typeof F, t: number) => number
  const compiled: CompiledExpr = (t) => fn(F, t)
  cache.set(expr, compiled)
  return compiled
}

/** Giá trị biểu thức tại t (giây). */
export function evalExpr(expr: string, t: number): number {
  return compileExpr(expr)(t)
}

/**
 * Thay biến "t" bằng biểu thức thời gian của từng bộ lọc FFmpeg
 * (vd. "(t-2.5)" cho crop/eq, "(T-2.5)" cho geq/blend, "(on/30)" cho perspective).
 */
export function ffmpegExpr(expr: string, timeExpr: string): string {
  return expr.replace(/\bt\b/g, timeExpr)
}
