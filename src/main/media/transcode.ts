// Quyết định file nào cần bản proxy, và dựng lệnh ffmpeg cho thumbnail / proxy.
// Toàn bộ là hàm thuần (chỉ tạo mảng tham số), nên test được không cần chạy ffmpeg.
import type { PreviewQuality } from '@shared/ipc'
import { extensionOf } from '@shared/media/formats'
import type { ProbeInfo } from './probe'

/** Cạnh ngắn mặc định của video proxy (mức "Thấp"): 540p rất nhẹ, phát mượt nhất. */
export const PROXY_SHORT_SIDE = 540
/** Cạnh ngắn của bản proxy theo chất lượng Xem trước ("Đầy đủ" mà file gốc không phát được → dùng 1080p). */
export const PROXY_SHORT_SIDES: Record<PreviewQuality, number> = { full: 1080, high: 1080, medium: 720, low: 540 }
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

/**
 * Chất lượng "Đầy đủ": phát thẳng file gốc kể cả 4K, miễn là Chromium giải mã được
 * (H.264 8-bit trong MP4/MOV, âm thanh phát được). yuvj420p = yuv420p "dải màu đầy đủ" của máy ảnh / điện thoại.
 */
export function canPlayOriginal(info: ProbeInfo, filePath: string): boolean {
  return (
    info.kind === 'video' &&
    ['mp4', 'mov', 'm4v'].includes(extensionOf(filePath)) &&
    info.videoCodec === 'h264' &&
    (info.pixelFormat === 'yuv420p' || info.pixelFormat === 'yuvj420p') &&
    (info.audioCodec === null || PLAYABLE_AUDIO.has(info.audioCodec))
  )
}

/** Tên file proxy. Video 540p giữ tên cũ "proxy.mp4" để dùng lại cache đã tạo trước đây. */
export function proxyFileName(kind: ProxyKind, shortSide = PROXY_SHORT_SIDE): string {
  if (kind === 'video') return shortSide === PROXY_SHORT_SIDE ? 'proxy.mp4' : `proxy-${shortSide}.mp4`
  return kind === 'audio' ? 'proxy.m4a' : 'proxy.png'
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
 * Lệnh trích xuất âm thanh từ video ra file .m4a.
 * Tiếng gốc đã là AAC → chép nguyên (nhanh, không giảm chất lượng); codec khác → mã hóa AAC 192 kbps.
 * Ghi ra định dạng mp4 tường minh vì file tạm có đuôi ".part" (ffmpeg không đoán được định dạng).
 */
export function extractAudioArgs(src: string, dest: string, audioCodec: string | null): string[] {
  const copy = audioCodec === 'aac'
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', src,
    '-map', '0:a:0', '-vn', '-sn', '-dn',
    ...(copy ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']),
    '-movflags', '+faststart',
    '-f', 'mp4',
    dest
  ]
}

/**
 * Phiên bản bộ lọc xóa giọng – tăng lên mỗi khi đổi karaokeArgs để file đã tạo bằng bộ lọc cũ
 * không bị dùng lại (tên file chứa mã băm có tính cả số này).
 */
export const KARAOKE_VERSION = 2

/** Dưới tần số này coi là âm trầm (bass, trống kick) – giữ nguyên khi xóa giọng để nhạc không bị mỏng. */
const KARAOKE_BASS_HZ = 150

/**
 * Lệnh "Xóa giọng hát" (karaoke) kiểu đơn giản, không dùng AI.
 * Giọng hát thường nằm GIỮA (giống nhau ở 2 kênh) → phần "hai bên" S = (trái − phải)/√2 không còn giọng.
 *  - Đưa S vào CẢ HAI kênh cùng pha. (Bản đầu dùng trái−phải / phải−trái: 2 kênh ngược pha nhau,
 *    nghe tai nghe rất khó chịu, "xoáy" trong đầu.)
 *  - Hệ số 1/√2 giữ nhạc cụ ở 2 bên to gần bằng bản gốc.
 *  - Cộng lại phần âm trầm của bản gốc; giới hạn đỉnh ở cuối để không bị vỡ tiếng khi cộng.
 * Đo trên bài thử (giọng có tiếng vang lệch 2 kênh như bản thu thật): giọng giảm ~13 dB, nhạc cụ giữ nguyên.
 * Hạn chế: chỉ có tác dụng với nhạc stereo; nhạc cụ đặt ở giữa cũng bị giảm; kết quả gần như mono.
 */
export function karaokeArgs(src: string, dest: string): string[] {
  const graph = [
    '[0:a:0]aformat=channel_layouts=stereo,asplit=2[full][mid]',
    `[full]lowpass=f=${KARAOKE_BASS_HZ},lowpass=f=${KARAOKE_BASS_HZ}[bass]`,
    `[mid]pan=stereo|c0=0.707*c0-0.707*c1|c1=0.707*c0-0.707*c1,highpass=f=${KARAOKE_BASS_HZ}[side]`,
    '[bass][side]amix=inputs=2:normalize=0,alimiter=limit=0.95:level=disabled[out]'
  ].join(';')
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', src,
    '-filter_complex', graph,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-f', 'mp4',
    dest
  ]
}

/**
 * Lệnh đo độ to (chuẩn EBU R128) của đoạn [start, start+duration) giây – kết quả ở stderr (xem parseIntegratedLoudness).
 */
export function loudnessArgs(src: string, startSec: number, durationSec: number): string[] {
  return [
    '-hide_banner', '-nostats',
    '-ss', startSec.toFixed(3), '-t', durationSec.toFixed(3),
    '-i', src,
    '-map', '0:a:0', '-vn',
    '-af', 'ebur128=framelog=quiet',
    '-f', 'null', '-'
  ]
}

/**
 * Lấy "Integrated loudness" (LUFS) từ phần tổng kết của bộ lọc ebur128.
 * @returns null nếu không đo được (vd. đoạn quá ngắn / im lặng hoàn toàn → -70 LUFS trở xuống)
 */
export function parseIntegratedLoudness(stderr: string): number | null {
  const block = stderr.slice(stderr.lastIndexOf('Integrated loudness'))
  const m = /I:\s+(-?[\d.]+)\s+LUFS/.exec(block)
  if (!m) return null
  const v = Number(m[1])
  return Number.isFinite(v) && v > -70 ? v : null
}

/** Lệnh "thay đổi giọng nói": chạy chuỗi bộ lọc âm thanh `af` (xem shared/render/voices.ts) ra file .m4a. */
export function voiceArgs(src: string, dest: string, af: string): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', src,
    '-map', '0:a:0', '-vn', '-sn', '-dn',
    '-af', af,
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-f', 'mp4',
    dest
  ]
}

/**
 * Lệnh tạo proxy. Ghi tiến trình ra stdout ("-progress pipe:1") để hiện thanh phần trăm.
 * @param dest đường dẫn file tạm; caller đổi tên sau khi xong (để không bao giờ dùng nhầm file dở dang)
 */
export function proxyArgs(kind: ProxyKind, src: string, dest: string, shortSide = PROXY_SHORT_SIDE): string[] {
  const common = ['-hide_banner', '-loglevel', 'error', '-y', '-nostats', '-progress', 'pipe:1', '-i', src]
  switch (kind) {
    case 'video':
      return [
        ...common,
        '-map', '0:v:0',
        '-map', '0:a:0?', // "?" = có âm thanh thì lấy, không có cũng không lỗi
        '-vf', scaleShortSide(shortSide),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        // Bản nét hơn (720p/1080p) thì giữ chất lượng cao hơn; 540p ưu tiên nhẹ
        '-crf', shortSide > PROXY_SHORT_SIDE ? '22' : '26',
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
