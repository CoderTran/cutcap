// Biểu thức theo thời gian dùng CHUNG cho preview và xuất video.
//
// Công thức chuyển động của hiệu ứng (rung, nhịp đập, chớp sáng…) viết MỘT LẦN theo cú pháp biểu thức
// của FFmpeg, ví dụ "0.04*sin(2*PI*t*3)":
//   - Xuất video: đưa thẳng vào bộ lọc FFmpeg (thay "t" bằng thời gian cục bộ của hiệu ứng)
//   - Preview: phân tích cú pháp thành cây biểu thức rồi tính bằng JavaScript
// → hai bên tính ra đúng cùng một con số.
//
// Tự phân tích cú pháp (không dùng eval / new Function) → chạy được dưới chính sách bảo mật (CSP)
// chặn eval của giao diện, và không thể chạy mã lạ.
// Hỗ trợ: số, t, PI, + − × ÷, dấu âm, ( ), và các hàm trong FUNCS.

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

type Node =
  | { k: 'num'; v: number }
  | { k: 't' }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: Node; b: Node }
  | { k: 'call'; f: (...a: number[]) => number; args: Node[] }

type Token = { type: 'num'; v: number } | { type: 'name'; v: string } | { type: 'sym'; v: string }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|(\S))/gy
  let m: RegExpExecArray | null
  while (re.lastIndex < expr.length && (m = re.exec(expr))) {
    if (m[1] !== undefined) tokens.push({ type: 'num', v: Number(m[1]) })
    else if (m[2] !== undefined) tokens.push({ type: 'name', v: m[2] })
    else if (m[3] !== undefined) {
      if (!'+-*/(),'.includes(m[3])) throw new Error(`Biểu thức có ký tự lạ "${m[3]}": ${expr}`)
      tokens.push({ type: 'sym', v: m[3] })
    } else break // chỉ còn khoảng trắng
  }
  return tokens
}

/** Phân tích cú pháp kiểu "đệ quy đi xuống": cộng/trừ < nhân/chia < dấu âm < số/hàm/ngoặc. */
function parse(expr: string): Node {
  const tokens = tokenize(expr)
  let i = 0
  const peek = (): Token | undefined => tokens[i]
  const isSym = (v: string): boolean => peek()?.type === 'sym' && peek()!.v === v
  const expect = (v: string): void => {
    if (!isSym(v)) throw new Error(`Biểu thức thiếu "${v}": ${expr}`)
    i++
  }

  const primary = (): Node => {
    const tok = tokens[i++]
    if (!tok) throw new Error(`Biểu thức bị cụt: ${expr}`)
    if (tok.type === 'num') return { k: 'num', v: tok.v }
    if (tok.type === 'sym') {
      if (tok.v === '(') {
        const inner = sum()
        expect(')')
        return inner
      }
      if (tok.v === '-') return { k: 'neg', a: primary() }
      if (tok.v === '+') return primary()
      throw new Error(`Biểu thức sai ở "${tok.v}": ${expr}`)
    }
    if (tok.v === 't') return { k: 't' }
    if (tok.v === 'PI') return { k: 'num', v: Math.PI }
    const f = FUNCS[tok.v]
    if (!f) throw new Error(`Biểu thức có tên lạ "${tok.v}": ${expr}`)
    expect('(')
    const args: Node[] = [sum()]
    while (isSym(',')) {
      i++
      args.push(sum())
    }
    expect(')')
    return { k: 'call', f, args }
  }
  const product = (): Node => {
    let node = primary()
    while (isSym('*') || isSym('/')) {
      const op = tokens[i++].v as '*' | '/'
      node = { k: 'bin', op, a: node, b: primary() }
    }
    return node
  }
  const sum = (): Node => {
    let node = product()
    while (isSym('+') || isSym('-')) {
      const op = tokens[i++].v as '+' | '-'
      node = { k: 'bin', op, a: node, b: product() }
    }
    return node
  }

  const root = sum()
  if (i < tokens.length) throw new Error(`Biểu thức thừa phần cuối: ${expr}`)
  return root
}

function run(n: Node, t: number): number {
  switch (n.k) {
    case 'num':
      return n.v
    case 't':
      return t
    case 'neg':
      return -run(n.a, t)
    case 'bin': {
      const a = run(n.a, t)
      const b = run(n.b, t)
      return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : a / b
    }
    case 'call':
      return n.f(...n.args.map((x) => run(x, t)))
  }
}

export type CompiledExpr = (t: number) => number

const cache = new Map<string, CompiledExpr>()

/** Phân tích biểu thức 1 lần (có cache) → hàm tính theo t. Báo lỗi nếu có tên/ký tự lạ. */
export function compileExpr(expr: string): CompiledExpr {
  const hit = cache.get(expr)
  if (hit) return hit
  const tree = parse(expr)
  const compiled: CompiledExpr = (t) => run(tree, t)
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
