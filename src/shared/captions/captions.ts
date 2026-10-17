// Phụ đề tự động – phần xử lý thuần (không gọi chương trình ngoài, test được).
//
// Quy trình (xem src/main/captions/captionService.ts):
//   1. Trộn tiếng cả timeline → WAV 16 kHz mono
//   2. whisper-vad-speech-segments: tìm các đoạn có người nói  → parseVadSegments
//   3. Gộp / nới các đoạn thành "khúc" để nhận dạng              → planChunks
//   4. whisper-cli nhận dạng TỪNG khúc (mỗi khúc 1 file WAV)
//      → thời gian luôn đúng (whisper hay gộp/lệch giờ khi đưa cả file dài có nhiều đoạn im lặng)
//   5. Đọc kết quả JSON, cộng thời điểm đầu khúc, bỏ câu "ảo giác" → parseWhisperJson
import type { Micros } from '../project/time'

export interface Caption {
  /** Thời điểm trên timeline (µs). */
  start: Micros
  end: Micros
  text: string
}

export interface Span {
  start: Micros
  end: Micros
}

/** Ngôn ngữ nói (mã ISO của Whisper). "auto" = tự nhận ra. */
export const CAPTION_LANGUAGES = ['vi', 'en', 'auto', 'zh', 'ja', 'ko', 'th', 'fr', 'es', 'de', 'ru', 'id'] as const
export type CaptionLanguage = (typeof CAPTION_LANGUAGES)[number]

/**
 * Đọc kết quả của whisper-vad-speech-segments.exe, dạng:
 *   "Speech segment 0: start = 1079.00, end = 1110.00"   (đơn vị: phần trăm giây)
 */
export function parseVadSegments(stdout: string): Span[] {
  const spans: Span[] = []
  for (const m of stdout.matchAll(/Speech segment \d+: start = ([\d.]+), end = ([\d.]+)/g)) {
    const start = Math.round(Number(m[1]) * 10_000)
    const end = Math.round(Number(m[2]) * 10_000)
    if (end > start) spans.push({ start, end })
  }
  return spans
}

export interface ChunkOptions {
  /** Nới mỗi đoạn ra 2 bên (đỡ mất âm đầu/cuối câu). */
  pad: Micros
  /** Hai đoạn cách nhau ít hơn → gộp thành 1 khúc (cùng một câu nói). */
  mergeGap: Micros
  /** Khúc dài quá → không gộp thêm (whisper tự chia câu bên trong, có giờ riêng). */
  maxLength: Micros
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { pad: 300_000, mergeGap: 600_000, maxLength: 25_000_000 }

/** Gộp các đoạn có tiếng nói gần nhau, nới 2 đầu, giới hạn trong [0, total]. */
export function planChunks(spans: Span[], total: Micros, opts: ChunkOptions = DEFAULT_CHUNK_OPTIONS): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const merged: Span[] = []
  for (const s of sorted) {
    const last = merged[merged.length - 1]
    if (last && s.start - last.end < opts.mergeGap && s.end - last.start <= opts.maxLength) last.end = Math.max(last.end, s.end)
    else merged.push({ ...s })
  }
  return merged
    .map((s) => ({ start: Math.max(0, s.start - opts.pad), end: Math.min(total, s.end + opts.pad) }))
    .filter((s) => s.end > s.start)
}

/**
 * Câu Whisper hay "bịa" khi gặp tiếng ồn / im lặng (học từ phụ đề video trên mạng).
 * Chỉ bỏ khi CẢ câu là những câu kiểu này – nói thật mà có chữ "subscribe" ở giữa câu vẫn giữ.
 */
const HALLUCINATIONS = [
  /hãy (subscribe|đăng ký)/i,
  /đăng ký kênh/i,
  /ghiền mì gõ/i,
  /không bỏ lỡ những video/i,
  /cảm ơn (các bạn )?đã (theo dõi|xem)/i,
  /(thanks|thank you) for watching/i,
  /subtitles? by/i,
  /amara\.org/i,
  /^[\s.,!?♪…-]*$/
]

export function isHallucination(text: string): boolean {
  return HALLUCINATIONS.some((re) => re.test(text.trim()))
}

/** "00:00:02,390" → µs */
function timestampUs(ts: string): number {
  const m = /^(\d+):(\d+):(\d+)[,.](\d+)$/.exec(ts.trim())
  if (!m) return NaN
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1_000_000 + Number(m[4].padEnd(3, '0').slice(0, 3)) * 1000
}

interface WhisperJson {
  transcription?: { timestamps?: { from?: string; to?: string }; offsets?: { from?: number; to?: number }; text?: string }[]
}

/**
 * Đọc file JSON của whisper-cli (-oj) cho một khúc bắt đầu ở `chunk.start` trên timeline.
 * Giờ trong file tính từ đầu khúc → cộng thêm; cắt gọn trong khúc; bỏ câu rỗng / ảo giác.
 */
export function parseWhisperJson(json: string, chunk: Span): Caption[] {
  let data: WhisperJson
  try {
    data = JSON.parse(json) as WhisperJson
  } catch {
    return []
  }
  const out: Caption[] = []
  for (const seg of data.transcription ?? []) {
    const text = (seg.text ?? '').replace(/\s+/g, ' ').trim()
    if (!text || isHallucination(text)) continue
    const from = seg.offsets?.from !== undefined ? seg.offsets.from * 1000 : timestampUs(seg.timestamps?.from ?? '')
    const to = seg.offsets?.to !== undefined ? seg.offsets.to * 1000 : timestampUs(seg.timestamps?.to ?? '')
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue
    const start = Math.max(chunk.start, chunk.start + from)
    const end = Math.min(chunk.end, chunk.start + Math.max(to, from))
    if (end - start < 100_000) continue
    out.push({ start, end, text })
  }
  return out
}

/** Phụ đề kề nhau không được chồng lên nhau (để nằm chung 1 track). */
export function fixOverlaps(captions: Caption[]): Caption[] {
  const sorted = [...captions].sort((a, b) => a.start - b.start)
  const out: Caption[] = []
  for (const c of sorted) {
    const prev = out[out.length - 1]
    const start = prev ? Math.max(c.start, prev.end) : c.start
    if (c.end - start >= 100_000) out.push({ ...c, start })
  }
  return out
}
