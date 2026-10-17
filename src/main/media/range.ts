// Đọc header HTTP "Range" – cần để thẻ <video> tua được tới giữa file
// mà không phải tải lại toàn bộ file từ đầu.

export interface ByteRange {
  start: number
  /** Byte cuối (bao gồm). */
  end: number
}

/**
 * "bytes=100-199" → { start: 100, end: 199 }
 * "bytes=100-"    → từ 100 tới cuối file
 * "bytes=-500"    → 500 byte cuối
 * @returns null nếu không có Range; "invalid" nếu Range sai/ngoài file
 */
export function parseRange(header: string | null, size: number): ByteRange | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid'

  let start: number
  let end: number
  if (match[1] === '') {
    // Dạng "-500": lấy N byte cuối
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  if (start > end || start >= size) return 'invalid'
  return { start, end }
}
