// File âm thanh do Cutcap tạo ra từ một file khác (FFmpeg): trích xuất tiếng của video, xóa giọng hát,
// xử lý âm thanh – giảm ồn / cải thiện giọng / đổi giọng ("fx:<khóa>", xem voices.ts).
// Tên file: "<tên gốc> (<nhãn> <6 ký tự băm>).m4a" – băm theo file gốc để làm lại thì dùng lại file cũ.

export type AudioDerive = 'extract' | 'karaoke' | `fx:${string}`

/** Nhãn ghi trong tên file tạo ra (cũng dùng để nhận ra file đã xóa giọng). */
export const DERIVED_LABEL = { extract: 'âm thanh', karaoke: 'bỏ giọng' } as const

/** Khóa thiết lập nếu là chế độ xử lý âm thanh ("fx:…"), ngược lại null. */
export function fxKeyOf(kind: AudioDerive): string | null {
  return kind.startsWith('fx:') ? kind.slice(3) : null
}

export function derivedFileName(sourceName: string, kind: AudioDerive, hash: string): string {
  const label = fxKeyOf(kind) !== null ? 'xử lý' : DERIVED_LABEL[kind as 'extract' | 'karaoke']
  return `${sourceName.replace(/\.[^.]+$/, '')} (${label} ${hash.slice(0, 6)}).m4a`
}

/** File này là bản đã xóa giọng hát do Cutcap tạo ra? */
export function isKaraokeFile(path: string): boolean {
  return new RegExp(`\\(${DERIVED_LABEL.karaoke} [0-9a-f]{6}\\)\\.m4a$`, 'i').test(path)
}
