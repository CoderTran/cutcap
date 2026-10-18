// Làm đẹp (bảng phải → Video → Làm đẹp → Làn da), giống CapCut.
// Mỗi mức 0–100; 0 = tắt. Phần vẽ: renderer/src/engine/beauty (WebGL, dùng chung cho xem trước và lúc xuất).
export const BEAUTY_KEYS = ['smooth', 'whiten', 'teeth', 'spots', 'darkCircles', 'wrinkles', 'evenTone'] as const
export type BeautyKey = (typeof BEAUTY_KEYS)[number]
export type Beauty = Record<BeautyKey, number>

export function emptyBeauty(): Beauty {
  return { smooth: 0, whiten: 0, teeth: 0, spots: 0, darkCircles: 0, wrinkles: 0, evenTone: 0 }
}

export function isBeautyEmpty(b: Beauty | null | undefined): boolean {
  return !b || BEAUTY_KEYS.every((k) => !(b[k] > 0))
}

/** Đọc từ file dự án: thiếu / hỏng → null; mỗi mức kẹp trong 0–100. */
export function parseBeauty(v: unknown): Beauty | null {
  if (typeof v !== 'object' || v === null) return null
  const raw = v as Record<string, unknown>
  const b = emptyBeauty()
  for (const k of BEAUTY_KEYS) {
    const n = raw[k]
    b[k] = typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0
  }
  return isBeautyEmpty(b) ? null : b
}
