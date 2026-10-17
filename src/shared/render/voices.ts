// "Trình thay đổi giọng nói" (bảng phải → Âm thanh, giống CapCut). Mọi giọng đều miễn phí.
//
// Mỗi giọng = một chuỗi bộ lọc âm thanh FFmpeg. Khi chọn, FFmpeg xử lý ra một file .m4a mới và clip
// chuyển sang dùng file đó → nghe thử trong app và video xuất ra GIỐNG HỆT nhau (cùng một file).
// Clip nhớ file gốc → chọn "Bản gốc" là trả lại giọng thật.
//
// Đổi cao độ dùng rubberband (giữ nguyên tốc độ nói); "formant=preserved" giữ âm sắc tự nhiên hơn,
// "shifted" cho giọng kiểu hoạt hình (sóc chuột, quái vật). Cuối mỗi chuỗi có alimiter chống vỡ tiếng.
//
// Thêm giọng mới: thêm 1 mục vào VOICES + tên trong file ngôn ngữ (voices.names.<id>).

export interface VoiceDef {
  id: string
  /** Chuỗi bộ lọc FFmpeg (-af), chưa gồm alimiter cuối. */
  af: string
}

const pitch = (semitones: number, formant: 'preserved' | 'shifted' = 'preserved'): string =>
  `rubberband=pitch=${Number(Math.pow(2, semitones / 12).toFixed(5))}:formant=${formant}`

/** "Robot": giữ biên độ, bỏ pha trong miền tần số (ví dụ chuẩn của FFmpeg). */
const ROBOT = "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75"
/** "Thì thầm": pha ngẫu nhiên. */
const WHISPER =
  "afftfilt=real='hypot(re,im)*cos((random(0)*2-1)*2*3.14)':imag='hypot(re,im)*sin((random(1)*2-1)*2*3.14)':win_size=128:overlap=0.8"

export const VOICES: VoiceDef[] = [
  { id: 'sweet', af: `${pitch(3)},treble=g=3` },
  { id: 'full', af: 'bass=g=5:f=150,acompressor=threshold=-18dB:ratio=3,volume=1.2' },
  { id: 'crisp', af: 'highpass=f=120,treble=g=6:f=4000' },
  { id: 'elf', af: `${pitch(7)},aphaser=type=t:speed=0.7` },
  { id: 'robot', af: `${ROBOT},volume=1.3` },
  { id: 'helium', af: pitch(10, 'shifted') },
  { id: 'echo', af: 'aecho=0.8:0.85:300:0.45' },
  { id: 'mic', af: 'highpass=f=300,lowpass=f=5000,acompressor=threshold=-20dB:ratio=4' },
  { id: 'clear', af: 'highpass=f=90,equalizer=f=3000:t=q:w=1:g=4,acompressor=threshold=-20dB:ratio=3' },
  { id: 'noisy', af: 'highpass=f=200,acrusher=bits=8:mode=log:aa=1:mix=0.6' },
  { id: 'teen', af: pitch(2) },
  { id: 'soft', af: 'lowpass=f=5000,acompressor=threshold=-22dB:ratio=3,volume=0.85' },
  { id: 'studio', af: 'acompressor=threshold=-20dB:ratio=3,equalizer=f=200:t=q:w=1:g=2,aecho=0.8:0.6:40:0.2' },
  { id: 'pa', af: 'highpass=f=400,lowpass=f=4000,aecho=0.8:0.7:120:0.3' },
  { id: 'micEcho', af: 'aecho=0.8:0.8:80|160:0.4|0.25' },
  { id: 'brokenMic', af: 'highpass=f=500,lowpass=f=3000,acrusher=bits=5:mode=log:aa=1' },
  { id: 'intense', af: `${pitch(-2)},acompressor=threshold=-24dB:ratio=6,volume=1.4` },
  { id: 'electronic', af: 'flanger=delay=3:depth=4:speed=1.2,vibrato=f=8:d=0.3' },
  { id: 'ghost', af: `${pitch(-3)},flanger,aecho=0.8:0.9:500|1000:0.4|0.3` },
  { id: 'deep', af: pitch(-4, 'shifted') },
  { id: 'cuteRobot', af: `${pitch(5, 'shifted')},${ROBOT}` },
  { id: 'spaceRobot', af: `${ROBOT},aecho=0.8:0.8:200:0.4` },
  { id: 'tremolo', af: 'tremolo=f=7:d=0.7' },
  { id: 'superEcho', af: 'aecho=0.8:0.9:400|800|1200:0.5|0.35|0.2' },
  { id: 'bassBoost', af: 'bass=g=12:f=120' },
  { id: 'cyber', af: 'chorus=0.6:0.9:50|60:0.4|0.32:0.25|0.4:2|2.3,flanger=delay=2:depth=3' },
  { id: 'lowMic', af: 'lowpass=f=2500,bass=g=6' },
  { id: 'muffled', af: 'lowpass=f=700' },
  { id: 'superDeep', af: pitch(-8, 'shifted') },
  { id: 'underwater', af: 'lowpass=f=450,vibrato=f=4:d=0.5,aecho=0.8:0.7:100:0.4' },
  { id: 'bathroom', af: 'aecho=0.8:0.85:20|35|55:0.5|0.4|0.3' },
  { id: 'cathedral', af: 'aecho=0.8:0.9:1000|1800|2600:0.4|0.3|0.2,lowpass=f=7000' },
  { id: 'megaphone', af: 'highpass=f=700,lowpass=f=3200,acrusher=bits=10:mode=log:mix=0.4,volume=1.5' },
  { id: 'phone', af: 'highpass=f=300,lowpass=f=3400' },
  { id: 'oldRadio', af: 'highpass=f=500,lowpass=f=3000,acrusher=bits=7:mode=log:mix=0.3' },
  { id: 'monster', af: `${pitch(-10, 'shifted')},aecho=0.8:0.8:60:0.3` },
  { id: 'chipmunk', af: pitch(12, 'shifted') },
  { id: 'whisper', af: `${WHISPER},highpass=f=300` }
]

const LIMIT = 'alimiter=limit=0.95:level=disabled'

/** Chuỗi bộ lọc của một giọng (thêm giới hạn đỉnh cuối cùng để không bị vỡ tiếng). */
export function voiceFilter(id: string): string | null {
  const v = VOICES.find((x) => x.id === id)
  return v ? `${v.af},${LIMIT}` : null
}

// ───────── Xử lý âm thanh gộp: Giảm tiếng ồn → Cải thiện giọng nói → Đổi giọng ─────────
// Cả 3 đều tạo file mới từ BẢN GỐC theo một chuỗi duy nhất → bật/tắt từng cái không bị chồng hiệu ứng.

/** File mô hình AI khử ồn (RNNoise) trong thư mục resources/models – xem README ở đó. */
export const DENOISE_MODEL = 'rnnoise-mp.rnnn'
/**
 * Giảm tiếng ồn bằng AI (RNNoise, bộ lọc arnndn của FFmpeg): giữ giọng nói, bỏ ồn nền kể cả ồn
 * đường phố / đám đông. FFmpeg chạy trong thư mục chứa mô hình nên chỉ cần tên file (không phải
 * thoát ký tự đường dẫn Windows trong chuỗi bộ lọc).
 * Đo thử (giọng đọc + ồn hồng/nâu): ồn nền −32 → −61 dB, giọng chỉ nhỏ đi ~1 dB.
 * Các cách cũ không dùng được: afftdn chỉ giảm ~2 dB; afwtdn adaptive làm tụt cả tiếng sau vài giây.
 */
export const DENOISE_AF = `aresample=48000,arnndn=m=${DENOISE_MODEL}`
/** Cải thiện giọng nói: bỏ tiếng ù, giảm "đục", làm rõ dải giọng 3–4 kHz, nén cho đều. */
export const ENHANCE_AF =
  'highpass=f=80,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1.2:g=4,acompressor=threshold=-20dB:ratio=3:attack=10:release=150'

export interface AudioFxSettings {
  voice: string | null
  enhance: boolean
  denoise: boolean
}

export function isAudioFxEmpty(s: AudioFxSettings): boolean {
  return !s.voice && !s.enhance && !s.denoise
}

/** Khóa ngắn mô tả thiết lập (dùng trong tên chế độ "fx:<khóa>" gửi sang tiến trình chính). */
export function audioFxKey(s: AudioFxSettings): string {
  return `d${s.denoise ? 1 : 0}e${s.enhance ? 1 : 0}v${s.voice ?? ''}`
}

export function parseAudioFxKey(key: string): AudioFxSettings | null {
  const m = /^d([01])e([01])v(\w*)$/.exec(key)
  if (!m) return null
  return { denoise: m[1] === '1', enhance: m[2] === '1', voice: m[3] || null }
}

/** Chuỗi bộ lọc FFmpeg cho thiết lập; null nếu không bật gì hoặc giọng không tồn tại. */
export function audioFxChain(s: AudioFxSettings): string | null {
  const parts: string[] = []
  if (s.denoise) parts.push(DENOISE_AF)
  if (s.enhance) parts.push(ENHANCE_AF)
  if (s.voice) {
    const v = VOICES.find((x) => x.id === s.voice)
    if (!v) return null
    parts.push(v.af)
  }
  return parts.length > 0 ? `${parts.join(',')},${LIMIT}` : null
}
