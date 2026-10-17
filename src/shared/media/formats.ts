// Các định dạng file mà Cutcap nhập được, và cách nhận diện loại media theo đuôi file.
import type { MediaKind } from '../project/schema'

export const VIDEO_EXTENSIONS = [
  'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mts', 'm2ts', 'ts', '3gp', 'mpg', 'mpeg'
] as const
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'heic', 'avif'] as const
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma'] as const

const KIND_BY_EXTENSION = new Map<string, MediaKind>([
  ...VIDEO_EXTENSIONS.map((e) => [e, 'video'] as const),
  ...IMAGE_EXTENSIONS.map((e) => [e, 'image'] as const),
  ...AUDIO_EXTENSIONS.map((e) => [e, 'audio'] as const)
])

/** Đuôi file viết thường, không có dấu chấm. "C:\a\B.MP4" → "mp4". */
export function extensionOf(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** Tên file kèm đuôi. "C:\Videos\bien.mp4" → "bien.mp4". */
export function fileNameOf(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

/** Loại media dựa theo đuôi file; null = không hỗ trợ. */
export function mediaKindFromPath(filePath: string): MediaKind | null {
  return KIND_BY_EXTENSION.get(extensionOf(filePath)) ?? null
}

/** Kiểu MIME để trình duyệt biết cách phát file (dùng trong giao thức cutcap-media). */
export function contentTypeFor(filePath: string): string {
  const ext = extensionOf(filePath)
  const map: Record<string, string> = {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp',
    gif: 'image/gif', avif: 'image/avif',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
    ogg: 'audio/ogg', opus: 'audio/ogg'
  }
  return map[ext] ?? 'application/octet-stream'
}

/** So sánh đường dẫn trên Windows: không phân biệt hoa/thường, "/" và "\" như nhau. */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string): string => p.replace(/\//g, '\\').toLowerCase()
  return norm(a) === norm(b)
}
