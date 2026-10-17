// Quyết định file nào cần bản proxy, và dựng lệnh ffmpeg cho thumbnail / proxy.
// Toàn bộ là hàm thuần (chỉ tạo mảng tham số), nên test được không cần chạy ffmpeg.
import { extensionOf } from '@shared/media/formats'
import type { ProbeInfo } from './probe'

/** Chiều cao (cạnh ngắn) của video proxy. 540p đủ nét cho khung preview mà rất nhẹ. */
export const PROXY_SHORT_SIDE = 540
export const THUMBNAIL_HEIGHT = 180

/** Codec âm thanh mà Chromium phát được trực tiếp. */
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le'])
/** Định dạng ảnh mà Chromium hiển thị được. */
const PLAYABLE_IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'avif'])

export type ProxyKind = 'video' | 'audio' | 'image'

/**
 * File có cần bản proxy để preview không?
 * - Video: chỉ phát trực tiếp nếu là H.264 8-bit trong MP4/MOV và không lớn hơn Full HD.
 *   Còn lại (MKV, HEVC, 10-bit, 4K…) tạo proxy 540p cho preview mượt.
 * - Âm thanh / ảnh: chỉ chuyển đổi khi Chromium không đọc được (WMA, HEIC, TIFF…).
 * @returns loại proxy cần tạo, hoặc null nếu dùng file gốc được
 */
export function proxyNeeded(info: ProbeInfo, filePath: string): ProxyKind | null {
  const ext = extensionOf(filePath)
  switch (info.kind) {
    case 'video': {
      const directlyPlayable =
        ['mp4', 'mov', 'm4v'].includes(ext) &&
        info.videoCodec === 'h264' &&
        info.pixelFormat === 'yuv420p' &&
        (info.audioCodec === null || PLAYABLE_AUDIO.has(info.audioCodec)) &&
        Math.max(info.width ?? 0, info.height ?? 0) <= 1920 &&
        Math.min(info.width ?? 0, info.height ?? 0) <= 1080
      return directlyPlayable ? null : 'video'
    }
    case 'audio':
      return info.audioCodec !== null && PLAYABLE_AUDIO.has(info.audioCodec) && ext !== 'wma' ? null : 'audio'
    case 'image':
      return PLAYABLE_IMAGE_EXT.has(ext) ? null : 'image'
  }
}

/** Đuôi file của bản proxy theo loại. */
export function proxyFileName(kind: ProxyKind): string {
  return kind === 'video' ? 'proxy.mp4' : kind === 'audio' ? 'proxy.m4a' : 'proxy.png'
}

/**
 * Bộ lọc thu nhỏ để cạnh ngắn = `short` px, giữ tỉ lệ, kích thước chẵn (H.264 yêu cầu).
 * Không phóng to nếu video gốc đã nhỏ hơn.
 */
export function scaleShortSide(short: number): string {
  return (
    `scale='if(gte(iw,ih),-2,min(${short},iw))':'if(gte(iw,ih),min(${short},ih),-2)'` +
    ':flags=bicubic'
  )
}

export function thumbnailArgs(info: ProbeInfo, src: string, dest: string): string[] {
  // Lấy khung hình ở 10% thời lượng (tối đa giây thứ 1) – tránh khung đen ở đầu video.
  // "-ss" đặt TRƯỚC "-i" để ffmpeg nhảy nhanh tới vị trí đó thay vì giải mã từ đầu.
  const seekSec = info.kind === 'video' ? Math.min(1, info.durationUs / 1e6 / 10) : 0
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...(seekSec > 0 ? ['-ss', seekSec.toFixed(3)] : []),
    '-i', src,
    '-frames:v', '1',
    '-vf', `scale=-2:${THUMBNAIL_HEIGHT}:flags=bicubic`,
    '-q:v', '4',
    dest
  ]
}

/** Bề rộng ảnh sóng âm (cho cả file). Timeline co giãn ảnh theo mức zoom. */
export const WAVEFORM_WIDTH = 2400
export const WAVEFORM_HEIGHT = 96

/** Lệnh vẽ ảnh sóng âm (nền trong suốt, sóng trắng – giao diện tự tô màu bằng CSS). */
export function waveformArgs(src: string, dest: string): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', src,
    '-filter_complex', `aformat=channel_layouts=mono,showwavespic=s=${WAVEFORM_WIDTH}x${WAVEFORM_HEIGHT}:colors=white:scale=sqrt`,
    '-frames:v', '1', '-update', '1',
    dest
  ]
}

/**
 * Lệnh tạo proxy. Ghi tiến trình ra stdout ("-progress pipe:1") để hiện thanh phần trăm.
 * @param dest đường dẫn file tạm; caller đổi tên sau khi xong (để không bao giờ dùng nhầm file dở dang)
 */
export function proxyArgs(kind: ProxyKind, src: string, dest: string): string[] {
  const common = ['-hide_banner', '-loglevel', 'error', '-y', '-nostats', '-progress', 'pipe:1', '-i', src]
  switch (kind) {
    case 'video':
      return [
        ...common,
        '-map', '0:v:0',
        '-map', '0:a:0?', // "?" = có âm thanh thì lấy, không có cũng không lỗi
        '-vf', scaleShortSide(PROXY_SHORT_SIDE),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '26',
        '-pix_fmt', 'yuv420p', // 8-bit: Chromium phát được cả khi gốc là 10-bit/HDR
        '-g', '15', // keyframe dày → tua (seek) trong preview nhanh
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-movflags', '+faststart',
        '-f', 'mp4',
        dest
      ]
    case 'audio':
      return [...common, '-vn', '-c:a', 'aac', '-b:a', '192k', '-f', 'ipod', dest]
    case 'image':
      return [...common, '-frames:v', '1', '-update', '1', '-f', 'image2', '-c:v', 'png', dest]
  }
}
