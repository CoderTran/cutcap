// File âm thanh do Cutcap tạo ra từ một file khác (FFmpeg): trích xuất tiếng của video, xóa giọng hát.
// Tên file: "<tên gốc> (<nhãn> <6 ký tự băm>).m4a" – băm theo file gốc để làm lại thì dùng lại file cũ.

export type AudioDerive = 'extract' | 'karaoke'

/** Nhãn ghi trong tên file tạo ra (cũng dùng để nhận ra file đã xóa giọng). */
export const DERIVED_LABEL: Record<AudioDerive, string> = { extract: 'âm thanh', karaoke: 'bỏ giọng' }

export function derivedFileName(sourceName: string, kind: AudioDerive, hash: string): string {
  return `${sourceName.replace(/\.[^.]+$/, '')} (${DERIVED_LABEL[kind]} ${hash.slice(0, 6)}).m4a`
}

/** File này là bản đã xóa giọng hát do Cutcap tạo ra? */
export function isKaraokeFile(path: string): boolean {
  return new RegExp(`\\(${DERIVED_LABEL.karaoke} [0-9a-f]{6}\\)\\.m4a$`, 'i').test(path)
}
