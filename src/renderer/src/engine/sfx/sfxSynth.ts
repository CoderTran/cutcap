// Tổng hợp Hiệu ứng âm thanh bằng Web Audio (OfflineAudioContext): dao động, tiếng ồn, bộ lọc, đường bao.
// Tiếng ồn dùng bộ sinh số ngẫu nhiên có hạt giống → mỗi lần tạo ra đúng cùng một âm thanh.
import { sfxById, type SfxId } from '@shared/audio/sfxCatalog'

const SAMPLE_RATE = 44100
/** Âm lượng đỉnh sau khi chuẩn hóa (≈ −1 dBFS). */
const PEAK = 0.89
/** Độ to trung bình tối đa (≈ −12 dBFS RMS): tiếng kéo dài (huýt sáo, còi) không to hơn hẳn tiếng ngắn. */
const MAX_RMS = 0.25

type Points = [time: number, value: number][]

/** Số ngẫu nhiên có hạt giống (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Synth {
  readonly out: GainNode
  constructor(readonly ctx: OfflineAudioContext) {
    this.out = ctx.createGain()
    this.out.connect(ctx.destination)
  }

  /** Đặt đường đi của một tham số: giá trị đầu đặt ngay, các điểm sau nối tuyến tính (exp = nối hàm mũ). */
  private path(param: AudioParam, points: Points, exp = false): void {
    const [[t0, v0], ...rest] = points
    param.setValueAtTime(v0, t0)
    for (const [t, v] of rest) {
      if (exp) param.exponentialRampToValueAtTime(Math.max(1e-4, v), t)
      else param.linearRampToValueAtTime(v, t)
    }
  }

  /** Đường bao âm lượng → trả về nút gain để nối nguồn vào. */
  env(points: Points, dest: AudioNode = this.out): GainNode {
    const g = this.ctx.createGain()
    g.gain.value = 0
    this.path(g.gain, points)
    g.connect(dest)
    return g
  }

  /** Bộ lọc với tần số thay đổi theo thời gian. */
  filter(type: BiquadFilterType, freq: Points, q: number, dest: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.Q.value = q
    this.path(f.frequency, freq, true)
    f.connect(dest)
    return f
  }

  /** Dao động (sine / square / sawtooth / triangle) với cao độ và âm lượng theo thời gian. */
  tone(type: OscillatorType, freq: Points, gain: Points, dest: AudioNode = this.out, vibrato?: { rate: number; depth: number }): void {
    const o = this.ctx.createOscillator()
    o.type = type
    this.path(o.frequency, freq, true)
    const end = gain[gain.length - 1][0] + 0.05
    if (vibrato) {
      const lfo = this.ctx.createOscillator()
      const amount = this.ctx.createGain()
      lfo.frequency.value = vibrato.rate
      amount.gain.value = vibrato.depth
      lfo.connect(amount).connect(o.frequency)
      lfo.start(freq[0][0])
      lfo.stop(end)
    }
    o.connect(this.env(gain, dest))
    o.start(freq[0][0])
    o.stop(end)
  }

  /** Tiếng ồn trắng trong [start, start + dur]. */
  noise(start: number, dur: number, gain: Points, dest: AudioNode = this.out, seed = 1): void {
    const random = rng(seed)
    const buffer = this.ctx.createBuffer(1, Math.max(1, Math.ceil(dur * SAMPLE_RATE)), SAMPLE_RATE)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.env(gain, dest))
    src.start(start)
  }

  /** Tiếng "tách" ngắn (gõ phím, bấm chuột, kim đồng hồ). */
  tick(at: number, freq: number, level: number, seed: number, length = 0.03): void {
    const bp = this.filter('bandpass', [[at, freq]], 1.2, this.out)
    this.noise(at, length + 0.01, [[at, 0], [at + 0.001, level], [at + length, 0]], bp, seed)
  }

  /** Tiếng chuông: nhiều họa âm, mỗi họa âm tắt dần với tốc độ khác nhau. */
  bell(at: number, base: number, partials: [ratio: number, level: number, decay: number][]): void {
    for (const [ratio, level, decay] of partials) {
      this.tone('sine', [[at, base * ratio]], [[at, 0], [at + 0.004, level], [at + decay, 0]])
    }
  }
}

/** Công thức của từng hiệu ứng (TypeScript bắt buộc đủ mọi id trong sfxCatalog). */
const RECIPES: Record<SfxId, (s: Synth) => void> = {
  ding: (s) => s.bell(0, 1318, [[1, 0.6, 1.3], [2, 0.25, 0.8], [3, 0.1, 0.4], [4.2, 0.05, 0.2]]),
  bell: (s) => s.bell(0, 523, [[0.5, 0.25, 2.4], [1, 0.5, 2.2], [2, 0.3, 1.6], [2.76, 0.25, 1.1], [5.4, 0.12, 0.6], [8.9, 0.06, 0.3]]),
  chime: (s) => {
    s.bell(0, 1046, [[1, 0.5, 0.7], [2, 0.15, 0.4]])
    s.bell(0.18, 1568, [[1, 0.5, 1], [2, 0.15, 0.5]])
  },
  notify: (s) => {
    s.bell(0, 880, [[1, 0.5, 0.35], [2, 0.12, 0.2]])
    s.bell(0.12, 1320, [[1, 0.5, 0.6], [2, 0.12, 0.3]])
  },
  magic: (s) => {
    // Lấp lánh: nhiều nốt cao ngẫu nhiên đi lên + tiếng ồn nhẹ
    const r = rng(7)
    for (let i = 0; i < 26; i++) {
      const at = i * 0.045 + r() * 0.02
      const f = 1800 + i * 110 + r() * 600
      s.tone('sine', [[at, f]], [[at, 0], [at + 0.005, 0.18], [at + 0.25, 0]])
    }
    const bp = s.filter('bandpass', [[0, 3000], [1.2, 8000]], 2, s.out)
    s.noise(0, 1.4, [[0, 0], [0.3, 0.12], [1.4, 0]], bp, 3)
  },
  whoosh: (s) => {
    const bp = s.filter('bandpass', [[0, 300], [0.45, 2600], [0.9, 400]], 1.4, s.out)
    s.noise(0, 0.9, [[0, 0], [0.45, 0.9], [0.9, 0]], bp, 11)
  },
  swoosh: (s) => {
    const bp = s.filter('bandpass', [[0, 800], [0.15, 4500], [0.4, 1200]], 1.8, s.out)
    s.noise(0, 0.4, [[0, 0], [0.12, 0.9], [0.4, 0]], bp, 12)
  },
  riser: (s) => {
    const bp = s.filter('bandpass', [[0, 300], [2.1, 6000]], 1.5, s.out)
    s.noise(0, 2.2, [[0, 0], [2.0, 0.7], [2.2, 0]], bp, 13)
    s.tone('sawtooth', [[0, 110], [2.1, 880]], [[0, 0], [2.0, 0.12], [2.2, 0]])
  },
  impact: (s) => {
    s.tone('sine', [[0, 120], [0.4, 38]], [[0, 0], [0.005, 1], [1.5, 0]])
    const lp = s.filter('lowpass', [[0, 3000], [0.5, 200]], 0.7, s.out)
    s.noise(0, 0.8, [[0, 0], [0.003, 0.8], [0.6, 0]], lp, 14)
  },
  explosion: (s) => {
    const lp = s.filter('lowpass', [[0, 2500], [2.3, 120]], 0.8, s.out)
    s.noise(0, 2.4, [[0, 0], [0.01, 1], [0.3, 0.6], [2.4, 0]], lp, 15)
    s.tone('sine', [[0, 70], [1.5, 30]], [[0, 0], [0.01, 0.8], [2, 0]])
  },
  heartbeat: (s) => {
    for (const beat of [0, 1]) {
      for (const [dt, level] of [[0, 1], [0.24, 0.7]] as const) {
        const at = beat + dt
        s.tone('sine', [[at, 70], [at + 0.12, 40]], [[at, 0], [at + 0.01, level], [at + 0.2, 0]])
      }
    }
  },
  clock: (s) => {
    for (let i = 0; i < 4; i++) s.tick(i * 0.5, i % 2 ? 2600 : 3200, 0.9, 20 + i, 0.02)
  },
  click: (s) => {
    s.tick(0, 3500, 1, 30, 0.012)
    s.tone('sine', [[0, 1800]], [[0, 0], [0.002, 0.3], [0.03, 0]])
  },
  typing: (s) => {
    const r = rng(31)
    let at = 0
    for (let i = 0; i < 14; i++) {
      s.tick(at, 2000 + r() * 2500, 0.7 + r() * 0.3, 40 + i, 0.025)
      at += 0.07 + r() * 0.06
    }
  },
  shutter: (s) => {
    s.tick(0, 2500, 1, 50, 0.04)
    s.tick(0.12, 1800, 0.8, 51, 0.05)
  },
  correct: (s) => {
    s.tone('triangle', [[0, 660]], [[0, 0], [0.01, 0.5], [0.18, 0]])
    s.tone('triangle', [[0.15, 990]], [[0.15, 0], [0.16, 0.5], [0.55, 0]])
  },
  wrong: (s) => {
    const lp = s.filter('lowpass', [[0, 1200]], 0.7, s.out)
    s.tone('square', [[0, 180], [0.55, 150]], [[0, 0], [0.01, 0.4], [0.45, 0.4], [0.58, 0]], lp)
  },
  pop: (s) => s.tone('sine', [[0, 350], [0.06, 1100]], [[0, 0], [0.004, 0.9], [0.15, 0]]),
  bubbles: (s) => {
    const r = rng(60)
    for (let i = 0; i < 9; i++) {
      const at = i * 0.12 + r() * 0.05
      const f = 300 + r() * 500
      s.tone('sine', [[at, f], [at + 0.05, f * 3]], [[at, 0], [at + 0.004, 0.6], [at + 0.08, 0]])
    }
  },
  boing: (s) => s.tone('sine', [[0, 120], [0.08, 300], [0.85, 220]], [[0, 0], [0.01, 0.9], [0.85, 0]], s.out, { rate: 14, depth: 70 }),
  slideUp: (s) => s.tone('sine', [[0, 350], [0.75, 1500]], [[0, 0], [0.03, 0.7], [0.65, 0.7], [0.8, 0]], s.out, { rate: 6, depth: 20 }),
  slideDown: (s) => s.tone('sine', [[0, 1500], [0.75, 300]], [[0, 0], [0.03, 0.7], [0.65, 0.7], [0.8, 0]], s.out, { rate: 6, depth: 20 }),
  coin: (s) => {
    const lp = s.filter('lowpass', [[0, 5000]], 0.7, s.out)
    s.tone('square', [[0, 988]], [[0, 0], [0.005, 0.3], [0.08, 0.3], [0.09, 0]], lp)
    s.tone('square', [[0.08, 1319]], [[0.08, 0], [0.09, 0.3], [0.55, 0]], lp)
  },
  laser: (s) => s.tone('sawtooth', [[0, 1800], [0.35, 150]], [[0, 0], [0.005, 0.35], [0.38, 0]]),
  glitch: (s) => {
    const r = rng(70)
    for (let i = 0; i < 10; i++) {
      const at = i * 0.07 + r() * 0.03
      const f = 200 + r() * 2000
      s.tone(r() > 0.5 ? 'square' : 'sawtooth', [[at, f]], [[at, 0], [at + 0.002, 0.25], [at + 0.05, 0.25], [at + 0.055, 0]])
      if (r() > 0.5) s.noise(at, 0.04, [[at, 0.4], [at + 0.04, 0]], s.out, 80 + i)
    }
  }
}

/** Tạo âm thanh của một hiệu ứng (đã chuẩn hóa âm lượng). */
export async function renderSfx(id: string): Promise<AudioBuffer> {
  const def = sfxById(id)
  if (!def) throw new Error(`unknown sfx ${id}`)
  const ctx = new OfflineAudioContext(1, Math.ceil(def.duration * SAMPLE_RATE), SAMPLE_RATE)
  RECIPES[def.id as SfxId](new Synth(ctx))
  const buffer = await ctx.startRendering()
  const data = buffer.getChannelData(0)
  let peak = 0
  let sum = 0
  for (const v of data) {
    peak = Math.max(peak, Math.abs(v))
    sum += v * v
  }
  const rms = Math.sqrt(sum / data.length)
  if (peak > 0) {
    const k = Math.min(PEAK / peak, MAX_RMS / rms)
    for (let i = 0; i < data.length; i++) data[i] *= k
  }
  // Tắt dần 5 ms cuối để không có tiếng "bụp" khi kết thúc
  const fade = Math.min(data.length, Math.round(0.005 * SAMPLE_RATE))
  for (let i = 0; i < fade; i++) data[data.length - 1 - i] *= i / fade
  return buffer
}

/** AudioBuffer → file WAV 16-bit (mono). */
export function encodeWav(buffer: AudioBuffer): Uint8Array {
  const data = buffer.getChannelData(0)
  const bytes = new ArrayBuffer(44 + data.length * 2)
  const v = new DataView(bytes)
  const text = (at: number, s: string): void => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + data.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, buffer.sampleRate, true)
  v.setUint32(28, buffer.sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, data.length * 2, true)
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true)
  return new Uint8Array(bytes)
}
