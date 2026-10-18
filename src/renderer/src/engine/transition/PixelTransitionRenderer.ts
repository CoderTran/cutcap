// Chuyển cảnh làm méo điểm ảnh trên khung Xem trước (WebGL2). Mã shader SINH RA từ cùng công thức với lệnh
// FFmpeg lúc xuất (shared/render/pixelTransitions.ts) → khung Xem trước và video xuất ra giống nhau.
import { glslBody, PIXEL_TRANSITIONS, pixelRecipe, type PxRole } from '@shared/render/pixelTransitions'

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

const frag = (body: string): string => `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uP, uAspect;
uniform vec2 uSize;
out vec4 o;
// Lấy mẫu theo toạ độ chuẩn hoá (y hướng xuống); ngoài khung → trong suốt
vec4 sampleAt(vec2 q) {
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(0.0);
  return texture(uTex, q);
}
void main() {
  vec2 uv = vec2(gl_FragCoord.x / uSize.x, 1.0 - gl_FragCoord.y / uSize.y);
  ${body}
}`

export class PixelTransitionRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly tex: WebGLTexture
  private readonly programs = new Map<string, WebGLProgram>()

  constructor() {
    this.canvas = document.createElement('canvas')
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 không khả dụng')
    this.gl = gl
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    this.tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  private program(kind: string, role: PxRole): WebGLProgram | null {
    const key = `${kind}|${role}`
    const hit = this.programs.get(key)
    if (hit) return hit
    const recipe = pixelRecipe(kind, role)
    if (!recipe) return null
    const gl = this.gl
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader')
      return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag(glslBody(recipe))))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link')
    this.programs.set(key, prog)
    return prog
  }

  /** Dịch sẵn shader của mọi chuyển cảnh lúc rảnh (mỗi lần một cái) – lần đầu phát chuyển cảnh không bị khựng. */
  warmUp(): void {
    const keys = PIXEL_TRANSITIONS.flatMap((k) => (['out', 'in'] as const).map((r) => [k, r] as const))
    const next = (): void => {
      const item = keys.shift()
      if (!item) return
      try {
        this.program(item[0], item[1])
      } catch {
        // lỗi dịch shader: để lần vẽ thật báo / bỏ qua
      }
      requestIdleCallback(next)
    }
    requestIdleCallback(next)
  }

  /** Vẽ nguồn đã biến đổi lên canvas w×h của renderer (null nếu không biết chuyển cảnh). */
  render(source: TexImageSource, w: number, h: number, kind: string, role: PxRole, p: number): HTMLCanvasElement | null {
    const prog = this.program(kind, role)
    if (!prog) return null
    const gl = this.gl
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    gl.viewport(0, 0, w, h)
    gl.useProgram(prog)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'uP'), p)
    gl.uniform1f(gl.getUniformLocation(prog, 'uAspect'), w / h)
    gl.uniform2f(gl.getUniformLocation(prog, 'uSize'), w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    return this.canvas
  }
}

let shared: PixelTransitionRenderer | null = null
let unavailable = false
/**
 * Bộ vẽ dùng chung cho ô xem thử và khung Xem trước: shader đã dịch khi hiện ô → lúc phát không bị khựng.
 * @returns null nếu máy không có WebGL2
 */
export function sharedPixelRenderer(): PixelTransitionRenderer | null {
  if (shared || unavailable) return shared
  try {
    shared = new PixelTransitionRenderer()
  } catch {
    unavailable = true
  }
  return shared
}
