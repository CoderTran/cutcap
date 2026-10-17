// Tiện ích thời gian dùng chung cho toàn bộ ứng dụng.
//
// Quy ước: mọi mốc thời gian trong dự án được lưu bằng SỐ NGUYÊN micro-giây (µs).
// Lý do: số thực giây (0.1 + 0.2 = 0.30000000000000004) gây sai số tích lũy
// sau nhiều lần cắt/ghép clip; số nguyên thì không.

/** Kiểu thời gian tính bằng micro-giây (số nguyên). */
export type Micros = number

export const MICROS_PER_SECOND = 1_000_000

/** Đổi giây (có thể lẻ) sang micro-giây, làm tròn về số nguyên gần nhất. */
export function secondsToMicros(seconds: number): Micros {
  return Math.round(seconds * MICROS_PER_SECOND)
}

/** Đổi micro-giây sang giây (số thực) – dùng khi đưa vào <video> hoặc FFmpeg. */
export function microsToSeconds(us: Micros): number {
  return us / MICROS_PER_SECOND
}

/**
 * Định dạng thời gian để hiển thị: "mm:ss.ff" hoặc "h:mm:ss.ff" (ff = số frame).
 * @param us  thời gian (µs)
 * @param fps số khung hình/giây của dự án
 */
export function formatTimecode(us: Micros, fps = 30): string {
  const safe = Math.max(0, us)
  const totalFrames = Math.floor((safe * fps) / MICROS_PER_SECOND)
  const frames = totalFrames % fps
  const totalSeconds = Math.floor(totalFrames / fps)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)

  const pad = (n: number): string => n.toString().padStart(2, '0')
  const core = `${pad(m)}:${pad(s)}.${pad(frames)}`
  return h > 0 ? `${h}:${core}` : core
}

/** Thời lượng ngắn gọn cho thẻ media: "0:05", "12:34", "1:02:03". */
export function formatDuration(us: Micros): string {
  const total = Math.max(0, Math.round(us / MICROS_PER_SECOND))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
