// Đổi qua lại giữa hệ số âm lượng (1 = gốc, 2 = gấp đôi) và decibel (0 dB = gốc), như thanh Âm lượng của CapCut.
// Chuẩn hóa âm lượng: đưa độ to (LUFS, chuẩn EBU R128) về mức mục tiêu.

/** Thanh trượt dB: từ đây trở xuống coi là tắt tiếng. */
export const MIN_DB = -40
/** Tối đa +6 dB ≈ hệ số 2 (200%) – giới hạn âm lượng của clip. */
export const MAX_DB = 20 * Math.log10(2)

export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain)
}

export function dbToGain(db: number): number {
  return db <= MIN_DB ? 0 : Math.pow(10, db / 20)
}

/** Mức độ to mục tiêu khi chuẩn hóa (LUFS) – mức phổ biến của video trên mạng xã hội. */
export const LOUDNESS_TARGET = -14

/** Hệ số âm lượng để đưa độ to `measured` (LUFS) về mục tiêu – kẹp trong 0…2 (tối đa +6 dB). */
export function normalizeGain(measured: number, target = LOUDNESS_TARGET): number {
  return Math.min(2, Math.max(0.01, Math.pow(10, (target - measured) / 20)))
}
