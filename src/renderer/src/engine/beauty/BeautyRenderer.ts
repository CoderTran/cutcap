// Làm đẹp – Làn da, vẽ bằng WebGL2 (card đồ họa). Dùng CHUNG cho khung Xem trước và lúc xuất video
// → video xuất ra giống hệt bản xem trước.
//
// Các bước cho mỗi khung hình:
//   1. Đưa khung hình lên GPU
//   2. Làm mờ 2 mức (nhỏ / lớn) – bán kính tính theo CỠ KHUÔN MẶT nên giống nhau ở mọi độ phân giải
//   3. Mặt nạ da / quầng mắt / răng vẽ từ 478 điểm khuôn mặt (faceMasks.ts)
//   4. Shader cuối (tách lớp tần số): xóa nhăn (nét tối mảnh) → xóa vết thâm (đốm tối cỡ vừa, giữ khối mặt)
//      → làm mịn (giữ đường nét) → đều màu (bớt đỏ) → quầng thâm → trắng da (chỉ độ sáng) → trắng răng
import { isBeautyEmpty, type Beauty } from '@shared/render/beauty'
import { isFaceShapeEmpty, MAX_PUSHES, warpPushes, type FaceShape } from '@shared/render/faceShape'
import type { Face } from './faceDetector'
import { eyeToCheekOffset, FaceMaskPainter, faceSizePx } from './faceMasks'

const VERT = `#version 300 es
in vec2 aPos;
uniform float uFlip;
out vec2 vUv;
void main() {
  // uFlip = 1: vẽ ra canvas để HIỂN THỊ (hàng 0 của canvas là đáy) · 0: giữ hàng 0 = đỉnh ảnh (FBO, đọc pixel)
  vUv = vec2(aPos.x * 0.5 + 0.5, mix(aPos.y * 0.5 + 0.5, 0.5 - aPos.y * 0.5, uFlip));
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

/** Làm mờ Gauss 13 điểm theo 1 hướng (chạy 2 lần: ngang rồi dọc). */
const BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uStep;
out vec4 o;
void main() {
  float w[7] = float[7](0.1596, 0.1473, 0.1159, 0.0776, 0.0443, 0.0215, 0.0089);
  vec3 c = texture(uTex, vUv).rgb * w[0];
  for (int i = 1; i < 7; i++) {
    c += (texture(uTex, vUv + uStep * float(i)).rgb + texture(uTex, vUv - uStep * float(i)).rgb) * w[i];
  }
  o = vec4(c / 0.9908, 1.0);
}`

const BEAUTY = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc, uBlurS, uBlurL, uSkin, uUnder, uTeeth;
uniform float uSmooth, uWhiten, uTeethAmt, uSpots, uDark, uWrinkles, uEven, uCheek;
out vec4 o;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 toYcc(vec3 c) { float y = luma(c); return vec3(y, (c.b - y) * 0.564 + 0.5, (c.r - y) * 0.713 + 0.5); }
vec3 toRgb(vec3 q) { float cb = q.y - 0.5, cr = q.z - 0.5; return vec3(q.x + 1.403 * cr, q.x - 0.344 * cb - 0.714 * cr, q.x + 1.773 * cb); }
/** Khả năng là màu da (theo YCbCr) – để không làm mịn tóc, kính, nền lọt vào viền mặt. */
float skinProb(vec3 c) {
  vec3 q = toYcc(c);
  return smoothstep(0.27, 0.33, q.y) * (1.0 - smoothstep(0.50, 0.56, q.y)) * smoothstep(0.50, 0.54, q.z) * (1.0 - smoothstep(0.69, 0.74, q.z));
}

void main() {
  vec3 c = texture(uSrc, vUv).rgb;
  vec3 bs = texture(uBlurS, vUv).rgb;
  vec3 bl = texture(uBlurL, vUv).rgb;
  // Vùng da: trong mặt nạ khuôn mặt VÀ có màu da (tóc, lông mày, nền tối lọt vào viền mặt bị loại)
  float skin = texture(uSkin, vUv).r * mix(0.08, 1.0, skinProb(c)) * smoothstep(0.08, 0.18, luma(c));

  // Tách lớp tần số: chi tiết nhỏ (c − bs) và chi tiết vừa (bs − bl)
  vec3 fine = c - bs;
  vec3 mid = bs - bl;
  float fineL = luma(fine);
  float midL = luma(mid);

  // Xóa nhăn: bớt nét TỐI mảnh (chi tiết nhỏ âm); nét sáng (lỗ chân lông sáng, ánh đèn) giữ nguyên
  c -= fine * uWrinkles * skin * 0.85 * (1.0 - smoothstep(-0.035, 0.0, fineL));

  // Xóa vết thâm: bớt đốm tối CỠ VỪA; mảng tối quá lớn/đậm (bóng mũi, hốc mắt) là khối mặt → giữ lại
  float spot = (1.0 - smoothstep(-0.04, -0.005, midL)) * smoothstep(-0.16, -0.10, midL);
  c -= mid * uSpots * skin * 0.8 * spot;

  // Làm mịn: kéo về bản mờ nhỏ, chỗ khác biệt lớn (mép mắt, môi, mũi) giữ lại nhiều hơn
  vec3 d = c - bs;
  float keep = exp(-dot(d, d) / 0.004);
  c = mix(c, bs, uSmooth * skin * mix(0.25, 0.8, keep));

  // Làm đều màu da: chỉ bớt chỗ ĐỎ / sạm hơn xung quanh (không kéo màu da về xám)
  vec3 q = toYcc(c);
  vec3 qb = toYcc(bl);
  float e = uEven * skin * 0.8;
  q.z = mix(q.z, min(q.z, qb.z), e);
  q.y = mix(q.y, max(q.y, qb.y), e * 0.5);
  c = toRgb(q);

  // Quầng thâm mắt: sáng & màu lấy theo da má ngay bên dưới
  float u = texture(uUnder, vUv).r * mix(0.2, 1.0, skinProb(c));
  vec3 qc = toYcc(c);
  vec3 qr = toYcc(texture(uBlurL, vUv + vec2(0.0, uCheek)).rgb);
  qc.x += max(qr.x - qc.x, 0.0) * uDark * u * 0.85;
  qc.yz = mix(qc.yz, qr.yz, uDark * u * 0.5);
  c = toRgb(qc);

  // Làm trắng da: chỉ tăng độ sáng (nhiều ở vùng tối, ít ở vùng đã sáng), giữ nguyên màu da
  vec3 qw = toYcc(c);
  qw.x = mix(qw.x, 1.0 - (1.0 - qw.x) * 0.78, uWhiten * skin);
  c = toRgb(qw);

  // Làm trắng răng: điểm sáng, ít màu trong miệng → bỏ ngả vàng, sáng thêm
  vec3 qt = toYcc(c);
  float sat = length(qt.yz - 0.5);
  float tooth = texture(uTeeth, vUv).r * smoothstep(0.26, 0.45, qt.x) * (1.0 - smoothstep(0.10, 0.19, sat));
  float k = uTeethAmt * tooth;
  qt.y = mix(qt.y, max(qt.y, 0.5), k);
  qt.yz = mix(qt.yz, vec2(0.5), k * 0.6);
  qt.x += (1.0 - qt.x) * 0.25 * k;
  c = toRgb(qt);

  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

/**
 * Chỉnh khuôn mặt: mỗi điểm ảnh lấy màu từ chỗ đã "đẩy" ngược lại (cộng mọi lực đẩy hình chuông).
 * Cùng công thức với warpSource() trong shared/render/faceShape.ts.
 */
const WARP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform int uCount;
uniform vec4 uP[${MAX_PUSHES}];
uniform vec2 uD[${MAX_PUSHES}];
out vec4 o;
void main() {
  vec2 p = vUv * uSize;
  vec2 sum = vec2(0.0);
  float weight = 0.0;
  for (int i = 0; i < ${MAX_PUSHES}; i++) {
    if (i >= uCount) break;
    vec2 d = p - uP[i].xy;
    float w = uP[i].w * exp(-dot(d, d) / (uP[i].z * uP[i].z));
    sum += uD[i] * w;
    weight += w;
  }
  // Nhiều lực chồng nhau → lấy trung bình (không cộng dồn); xa các lực → giảm dần về 0
  o = texture(uTex, (p - sum / max(1.0, weight)) / uSize);
}`

interface Target {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  w: number
  h: number
}

export class BeautyRenderer {
  readonly canvas = document.createElement('canvas')
  private readonly gl: WebGL2RenderingContext
  private readonly blurProg: WebGLProgram
  private readonly beautyProg: WebGLProgram
  private readonly warpProg: WebGLProgram
  /** Kết quả làm đẹp da (cỡ đầy đủ) khi còn bước chỉnh khuôn mặt phía sau. */
  private skinOut: Target | null = null
  private readonly srcTex: WebGLTexture
  private readonly maskTex: WebGLTexture[]
  private targets: Target[] = []
  private readonly masks = new FaceMaskPainter()

  constructor() {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false })
    if (!gl) throw new Error('WebGL2 không khả dụng')
    this.gl = gl
    this.blurProg = program(gl, VERT, BLUR)
    this.beautyProg = program(gl, VERT, BEAUTY)
    this.warpProg = program(gl, VERT, WARP)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    for (const p of [this.blurProg, this.beautyProg, this.warpProg]) {
      const loc = gl.getAttribLocation(p, 'aPos')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    }
    this.srcTex = texture(gl)
    this.maskTex = [texture(gl), texture(gl), texture(gl)]
  }

  /**
   * Áp làm đẹp (làn da, rồi khuôn mặt) lên một khung hình cỡ w×h.
   * @param forReadback true = để đọc pixel (xuất video): hàng đầu tiên của dữ liệu là đỉnh ảnh
   * @returns canvas kết quả (cỡ w×h), hoặc null nếu không có khuôn mặt / không có gì để làm
   */
  render(
    source: TexImageSource,
    w: number,
    h: number,
    faces: Face[],
    beauty: Beauty | null,
    shape: FaceShape | null,
    forReadback = false
  ): HTMLCanvasElement | null {
    const skin = !isBeautyEmpty(beauty)
    const reshape = !isFaceShapeEmpty(shape)
    if (faces.length === 0 || (!skin && !reshape)) return null
    const gl = this.gl
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.ensureTargets(w, h)

    gl.bindTexture(gl.TEXTURE_2D, this.srcTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

    let input = this.srcTex
    if (skin) {
      // Có bước chỉnh khuôn mặt phía sau → làm đẹp da vào ảnh trung gian, ngược lại vẽ thẳng ra canvas
      if (reshape) this.skinOut = this.ensureTarget(this.skinOut, w, h)
      this.renderSkin(w, h, faces, beauty!, reshape ? this.skinOut : null, forReadback)
      if (reshape) input = this.skinOut!.tex
    }
    if (reshape) this.renderWarp(input, w, h, faces, shape!, forReadback)
    gl.activeTexture(gl.TEXTURE0)
    return this.canvas
  }

  /** Làn da: làm mờ 2 mức + mặt nạ + shader làm đẹp. dst = null → vẽ ra canvas. */
  private renderSkin(w: number, h: number, faces: Face[], beauty: Beauty, dst: Target | null, forReadback: boolean): void {
    const gl = this.gl
    // Bán kính làm mờ theo cỡ mặt (pixel) → đổi ra đơn vị tọa độ 0–1
    const face = Math.max(40, faceSizePx(faces, w, h))
    const small = face * 0.011
    const large = face * 0.05
    const [hS, vS, hL, vL] = this.targets
    this.blur(this.srcTex, hS, [small / 2.5 / w, 0])
    this.blur(hS.tex, vS, [0, small / 2.5 / h])
    this.blur(this.srcTex, hL, [large / 2.5 / w, 0])
    this.blur(hL.tex, vL, [0, large / 2.5 / h])

    const m = this.masks.paint(faces, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)))
    ;[m.skin, m.under, m.teeth].forEach((c, i) => {
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex[i])
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
    })

    const p = this.beautyProg
    gl.useProgram(p)
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null)
    gl.viewport(0, 0, w, h)
    const bind = (name: string, tex: WebGLTexture, unit: number): void => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(gl.getUniformLocation(p, name), unit)
    }
    bind('uSrc', this.srcTex, 0)
    bind('uBlurS', vS.tex, 1)
    bind('uBlurL', vL.tex, 2)
    bind('uSkin', this.maskTex[0], 3)
    bind('uUnder', this.maskTex[1], 4)
    bind('uTeeth', this.maskTex[2], 5)
    const set = (name: string, v: number): void => gl.uniform1f(gl.getUniformLocation(p, name), v)
    // Ảnh trung gian luôn giữ hàng 0 = đỉnh ảnh; chỉ lần vẽ cuối ra canvas để hiển thị mới lật
    set('uFlip', dst || forReadback ? 0 : 1)
    set('uSmooth', beauty.smooth / 100)
    set('uWhiten', beauty.whiten / 100)
    set('uTeethAmt', beauty.teeth / 100)
    set('uSpots', beauty.spots / 100)
    set('uDark', beauty.darkCircles / 100)
    set('uWrinkles', beauty.wrinkles / 100)
    set('uEven', beauty.evenTone / 100)
    set('uCheek', eyeToCheekOffset(faces))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /** Khuôn mặt: kéo hình theo các lực đẩy tính từ điểm khuôn mặt (pixel). */
  private renderWarp(input: WebGLTexture, w: number, h: number, faces: Face[], shape: FaceShape, forReadback: boolean): void {
    const gl = this.gl
    const pushes = warpPushes(
      faces.map((f) => f.map((q) => ({ x: q.x * w, y: q.y * h }))),
      shape
    )
    const pos = new Float32Array(MAX_PUSHES * 4)
    const disp = new Float32Array(MAX_PUSHES * 2)
    pushes.forEach((q, i) => {
      pos.set([q.x, q.y, Math.max(1, q.r), q.weight ?? 1], i * 4)
      disp.set([q.dx, q.dy], i * 2)
    })
    const p = this.warpProg
    gl.useProgram(p)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, input)
    gl.uniform1i(gl.getUniformLocation(p, 'uTex'), 0)
    gl.uniform1f(gl.getUniformLocation(p, 'uFlip'), forReadback ? 0 : 1)
    gl.uniform2f(gl.getUniformLocation(p, 'uSize'), w, h)
    gl.uniform1i(gl.getUniformLocation(p, 'uCount'), pushes.length)
    gl.uniform4fv(gl.getUniformLocation(p, 'uP'), pos)
    gl.uniform2fv(gl.getUniformLocation(p, 'uD'), disp)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /** Ảnh trung gian cỡ w×h (tạo lại khi đổi cỡ). */
  private ensureTarget(t: Target | null, w: number, h: number): Target {
    if (t && t.w === w && t.h === h) return t
    const gl = this.gl
    if (t) {
      gl.deleteTexture(t.tex)
      gl.deleteFramebuffer(t.fbo)
    }
    const tex = texture(gl)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { tex, fbo, w, h }
  }

  /** Đọc kết quả vừa vẽ (gọi sau render(…, forReadback = true)): RGBA, hàng đầu là đỉnh ảnh. */
  readPixels(): Uint8Array {
    const { width: w, height: h } = this.canvas
    const out = new Uint8Array(w * h * 4)
    this.gl.readPixels(0, 0, w, h, this.gl.RGBA, this.gl.UNSIGNED_BYTE, out)
    return out
  }

  private blur(src: WebGLTexture, dst: Target, step: [number, number]): void {
    const gl = this.gl
    gl.useProgram(this.blurProg)
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo)
    gl.viewport(0, 0, dst.w, dst.h)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, src)
    gl.uniform1i(gl.getUniformLocation(this.blurProg, 'uTex'), 0)
    gl.uniform1f(gl.getUniformLocation(this.blurProg, 'uFlip'), 0)
    gl.uniform2f(gl.getUniformLocation(this.blurProg, 'uStep'), step[0], step[1])
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /** Ảnh trung gian: mờ nhỏ ở 1/2 kích thước, mờ lớn ở 1/4 (đủ mịn, nhẹ hơn nhiều). */
  private ensureTargets(w: number, h: number): void {
    const sizes: [number, number][] = [
      [w / 2, h / 2],
      [w / 2, h / 2],
      [w / 4, h / 4],
      [w / 4, h / 4]
    ].map(([a, b]) => [Math.max(1, Math.round(a)), Math.max(1, Math.round(b))])
    if (this.targets.length === 4 && this.targets.every((t, i) => t.w === sizes[i][0] && t.h === sizes[i][1])) return
    const gl = this.gl
    for (const t of this.targets) {
      gl.deleteTexture(t.tex)
      gl.deleteFramebuffer(t.fbo)
    }
    this.targets = sizes.map(([tw, th]) => {
      const tex = texture(gl)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fbo = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      return { tex, fbo, w: tw, h: th }
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
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
