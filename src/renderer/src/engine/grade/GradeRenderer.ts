// Điều chỉnh màu trên khung Xem trước (WebGL2). Cùng thứ tự & công thức với lúc xuất (gradeStatements
// trong main/export/graphBuilder.ts): làm mờ → sắc nét → rõ nét (A + k·(A − mờ(A))) → bảng màu 3D (cùng LUT
// với file .cube) → hạt nhỏ → viền mờ dần (công thức của bộ lọc vignette của FFmpeg: cos⁴).
import { buildLut, hasColorChanges, LUT_SIZE, spatialParams, type ColorGrade } from '@shared/render/grade'

const VERT = `#version 300 es
in vec2 aPos;
uniform float uFlip;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, mix(aPos.y * 0.5 + 0.5, 0.5 - aPos.y * 0.5, uFlip));
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

/** Gauss 13 điểm theo 1 hướng; uStep = sigma/2.5 (đơn vị toạ độ). */
const BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uStep;
out vec4 o;
void main() {
  float w[7] = float[7](0.1596, 0.1473, 0.1159, 0.0776, 0.0443, 0.0215, 0.0089);
  vec3 c = texture(uTex, vUv).rgb * w[0];
  for (int i = 1; i < 7; i++) c += (texture(uTex, vUv + uStep * float(i)).rgb + texture(uTex, vUv - uStep * float(i)).rgb) * w[i];
  o = vec4(c / 0.9908, 1.0);
}`

/** A + k·(A − B) (sắc nét / rõ nét). */
const UNSHARP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uA, uB;
uniform float uK;
out vec4 o;
void main() {
  vec3 a = texture(uA, vUv).rgb;
  o = vec4(clamp(a + (a - texture(uB, vUv).rgb) * uK, 0.0, 1.0), 1.0);
}`

const FINAL = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex, uLut;
uniform float uUseLut, uGrain, uVignette, uSeed;
uniform vec2 uSize;
out vec4 o;
const float N = ${LUT_SIZE}.0;

vec3 lut(vec3 c) {
  // Bảng 3D trải thành dải 2D: x = r + b·N, y = g – tra 2 lát b kề nhau rồi trộn (tuyến tính 3 chiều)
  float b = c.b * (N - 1.0);
  float b0 = floor(b);
  float b1 = min(b0 + 1.0, N - 1.0);
  vec2 rg = (c.rg * (N - 1.0) + 0.5) / vec2(N * N, N);
  vec3 s0 = texture(uLut, rg + vec2(b0 / N, 0.0)).rgb;
  vec3 s1 = texture(uLut, rg + vec2(b1 / N, 0.0)).rgb;
  return mix(s0, s1, b - b0);
}

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec3 c = texture(uTex, vUv).rgb;
  if (uUseLut > 0.5) c = lut(clamp(c, 0.0, 1.0));
  if (uGrain > 0.0) {
    vec2 px = floor(vUv * uSize);
    c += (vec3(hash(px + uSeed), hash(px + uSeed + 17.0), hash(px + uSeed + 31.0)) - 0.5) * 2.0 * uGrain;
  }
  if (uVignette != 0.0) {
    vec2 d = (vUv - 0.5) * uSize;
    float dn = length(d) / length(uSize * 0.5);
    float f = dn > 1.0 ? 0.0 : pow(cos(abs(uVignette) * dn), 4.0);
    c = uVignette > 0.0 ? c * f : c / max(f, 1e-3);
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

interface Target {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
}

export class GradeRenderer {
  readonly canvas = document.createElement('canvas')
  private readonly gl: WebGL2RenderingContext
  private readonly progs: Record<'blur' | 'unsharp' | 'final', WebGLProgram>
  private readonly srcTex: WebGLTexture
  private readonly lutTex: WebGLTexture
  private lutFor: ColorGrade | null = null
  private targets: Target[] = []
  private size = { w: 0, h: 0 }

  constructor() {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false })
    if (!gl) throw new Error('WebGL2 không khả dụng')
    this.gl = gl
    this.progs = { blur: program(gl, VERT, BLUR), unsharp: program(gl, VERT, UNSHARP), final: program(gl, VERT, FINAL) }
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    for (const p of Object.values(this.progs)) {
      const loc = gl.getAttribLocation(p, 'aPos')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    }
    this.srcTex = texture(gl)
    this.lutTex = texture(gl)
  }

  /**
   * @param seed thay đổi theo khung hình → hạt nhỏ "chạy" như phim
   * @param forReadback true = hàng đầu tiên của dữ liệu là đỉnh ảnh (đọc pixel)
   */
  render(source: TexImageSource, w: number, h: number, grade: ColorGrade, seed: number, forReadback = false): HTMLCanvasElement {
    const gl = this.gl
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.ensureTargets(w, h)
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

    const sp = spatialParams(grade)
    const [scratchH, scratchV] = [this.targets[0], this.targets[1]]
    const outs = [this.targets[2], this.targets[3]]
    let cur = this.srcTex
    let flip = 0
    /** Đích tiếp theo: luân phiên 2 bộ đệm, không bao giờ trùng ảnh đang đọc. */
    const nextOut = (): Target => outs[flip++ % 2]
    const blurInto = (src: WebGLTexture, rel: number, dst: Target): void => {
      this.blur(src, scratchH, [(rel * h) / 2.5 / w, 0])
      this.blur(scratchH.tex, dst, [0, rel / 2.5])
    }
    // Làm mờ
    if (sp.blurSigma > 0) {
      const dst = nextOut()
      blurInto(cur, sp.blurSigma, dst)
      cur = dst.tex
    }
    // Sắc nét rồi rõ nét: làm mờ ảnh hiện tại (vào scratchV) rồi A + k·(A − mờ)
    for (const [amount, rel] of [
      [sp.sharpenAmount, sp.sharpenSigma],
      [sp.clarityAmount, sp.claritySigma]
    ]) {
      if (amount <= 0) continue
      blurInto(cur, rel, scratchV)
      const dst = nextOut()
      this.unsharp(cur, scratchV.tex, amount, dst)
      cur = dst.tex
    }

    const useLut = hasColorChanges(grade)
    if (useLut && this.lutFor !== grade) {
      const data = buildLut(grade)
      gl.bindTexture(gl.TEXTURE_2D, this.lutTex)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      // Bảng 33×33×33 trải thành ảnh (33·33)×33, số thực 16 bit → không bị dải màu
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16F, LUT_SIZE * LUT_SIZE, LUT_SIZE, 0, gl.RGB, gl.FLOAT, stripLayout(data))
      this.lutFor = grade
    }

    const p = this.progs.final
    gl.useProgram(p)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, cur)
    gl.uniform1i(gl.getUniformLocation(p, 'uTex'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex)
    gl.uniform1i(gl.getUniformLocation(p, 'uLut'), 1)
    gl.uniform1f(gl.getUniformLocation(p, 'uFlip'), forReadback ? 0 : 1)
    gl.uniform1f(gl.getUniformLocation(p, 'uUseLut'), useLut ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(p, 'uGrain'), sp.grain)
    gl.uniform1f(gl.getUniformLocation(p, 'uVignette'), sp.vignette)
    gl.uniform1f(gl.getUniformLocation(p, 'uSeed'), seed % 997)
    gl.uniform2f(gl.getUniformLocation(p, 'uSize'), w, h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.activeTexture(gl.TEXTURE0)
    return this.canvas
  }

  readPixels(): Uint8Array {
    const { width: w, height: h } = this.canvas
    const out = new Uint8Array(w * h * 4)
    this.gl.readPixels(0, 0, w, h, this.gl.RGBA, this.gl.UNSIGNED_BYTE, out)
    return out
  }

  private blur(src: WebGLTexture, dst: Target, step: [number, number]): void {
    const gl = this.gl
    const p = this.progs.blur
    gl.useProgram(p)
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo)
    gl.viewport(0, 0, this.size.w, this.size.h)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, src)
    gl.uniform1i(gl.getUniformLocation(p, 'uTex'), 0)
    gl.uniform1f(gl.getUniformLocation(p, 'uFlip'), 0)
    gl.uniform2f(gl.getUniformLocation(p, 'uStep'), step[0], step[1])
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private unsharp(a: WebGLTexture, b: WebGLTexture, k: number, dst: Target): void {
    const gl = this.gl
    const p = this.progs.unsharp
    gl.useProgram(p)
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo)
    gl.viewport(0, 0, this.size.w, this.size.h)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, a)
    gl.uniform1i(gl.getUniformLocation(p, 'uA'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, b)
    gl.uniform1i(gl.getUniformLocation(p, 'uB'), 1)
    gl.uniform1f(gl.getUniformLocation(p, 'uFlip'), 0)
    gl.uniform1f(gl.getUniformLocation(p, 'uK'), k)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.activeTexture(gl.TEXTURE0)
  }

  private ensureTargets(w: number, h: number): void {
    if (this.size.w === w && this.size.h === h && this.targets.length === 4) return
    const gl = this.gl
    for (const t of this.targets) {
      gl.deleteTexture(t.tex)
      gl.deleteFramebuffer(t.fbo)
    }
    this.targets = Array.from({ length: 4 }, () => {
      const tex = texture(gl)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fbo = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      return { tex, fbo }
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.size = { w, h }
  }
}

/** LUT (r nhanh nhất, rồi g, rồi b) → ảnh N²×N: hàng = g, cột = r + b·N. */
function stripLayout(lut: Float32Array): Float32Array {
  const N = LUT_SIZE
  const out = new Float32Array(N * N * N * 3)
  for (let b = 0; b < N; b++) {
    for (let g = 0; g < N; g++) {
      for (let r = 0; r < N; r++) {
        const src = ((b * N + g) * N + r) * 3
        const dst = (g * N * N + b * N + r) * 3
        out[dst] = lut[src]
        out[dst + 1] = lut[src + 1]
        out[dst + 2] = lut[src + 2]
      }
    }
  }
  return out
}

function texture(gl: WebGL2RenderingContext): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader lỗi: ${gl.getShaderInfoLog(s)}`)
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Liên kết shader lỗi: ${gl.getProgramInfoLog(p)}`)
  return p
}
