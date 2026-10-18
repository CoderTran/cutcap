// Yêu thích (★ trên các ô bộ lọc, hiệu ứng, chuyển tiếp, mẫu chữ, hiệu ứng động, âm thanh): lưu theo MÁY
// (thư mục dữ liệu của app), không theo dự án → mở dự án nào cũng thấy cùng một danh sách.

export const FAVORITE_KINDS = ['filter', 'effect', 'transition', 'text', 'anim', 'sfx', 'sound'] as const
export type FavoriteKind = (typeof FAVORITE_KINDS)[number]

/** Mã các mục yêu thích theo loại, mới thêm đứng trước. anim: "in:fade"…; sound: đường dẫn file trong Thư viện của bạn. */
export type Favorites = Record<FavoriteKind, string[]>

/** Giới hạn mỗi loại (tránh file phình to bất thường). */
const MAX_PER_KIND = 500

export const emptyFavorites = (): Favorites => Object.fromEntries(FAVORITE_KINDS.map((k) => [k, [] as string[]])) as unknown as Favorites

/** Đọc dữ liệu từ file (không tin dữ liệu: bỏ loại lạ, mục không phải chuỗi, trùng lặp). */
export function parseFavorites(raw: unknown): Favorites {
  const out = emptyFavorites()
  if (typeof raw !== 'object' || raw === null) return out
  for (const k of FAVORITE_KINDS) {
    const list = (raw as Record<string, unknown>)[k]
    if (!Array.isArray(list)) continue
    out[k] = [...new Set(list.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 1000))].slice(0, MAX_PER_KIND)
  }
  return out
}

/** Bật / tắt yêu thích một mục (mục mới lên đầu danh sách). */
export function toggleFavoriteIn(favs: Favorites, kind: FavoriteKind, id: string): Favorites {
  const list = favs[kind]
  return { ...favs, [kind]: list.includes(id) ? list.filter((x) => x !== id) : [id, ...list].slice(0, MAX_PER_KIND) }
}
