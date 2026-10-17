// Đọc thông tin file media bằng ffprobe: loại, thời lượng, kích thước, fps, codec…
import { mediaKindFromPath } from '@shared/media/formats'
import type { MediaKind } from '@shared/project/schema'
import { runProcess } from './processRunner'

export interface ProbeInfo {
  kind: MediaKind
  durationUs: number
  /** Kích thước HIỂN THỊ (đã tính xoay – video quay dọc trên điện thoại). */
  width: number | null
  height: number | null
  fps: number | null
  hasAudio: boolean
  videoCodec: string | null
  pixelFormat: string | null
  audioCodec: string | null
  /** Tên định dạng container theo ffprobe, ví dụ "mov,mp4,m4a,3gp,3g2,mj2". */
  formatName: string
}

/** Lỗi khi file không đọc được hoặc không phải media. */
export class ProbeError extends Error {
  constructor(public readonly code: 'unsupported' | 'unreadable', detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'ProbeError'
  }
}

// Kiểu dữ liệu (một phần) của JSON mà ffprobe trả về
interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  pix_fmt?: string
  avg_frame_rate?: string
  r_frame_rate?: string
  duration?: string
  disposition?: { attached_pic?: number }
  tags?: { rotate?: string }
  side_data_list?: { rotation?: number }[]
}
interface FfprobeOutput {
  streams?: FfprobeStream[]
  format?: { duration?: string; format_name?: string }
}

/** "30000/1001" → 29.97; "0/0" → null */
function parseRate(rate: string | undefined): number | null {
  if (!rate) return null
  const [num, den] = rate.split('/').map(Number)
  if (!num || !den) return null
  return Math.round((num / den) * 1000) / 1000
}

function rotationOf(stream: FfprobeStream): number {
  const fromSideData = stream.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation
  const value = fromSideData ?? Number(stream.tags?.rotate ?? 0)
  return Number.isFinite(value) ? value : 0
}

/**
 * Chuyển JSON của ffprobe thành ProbeInfo. Hàm thuần – test được không cần ffprobe.
 * @param filePath dùng để đoán loại media từ đuôi file
 */
export function parseProbeOutput(output: FfprobeOutput, filePath: string): ProbeInfo {
  const kindByExt = mediaKindFromPath(filePath)
  if (!kindByExt) throw new ProbeError('unsupported', filePath)

  const streams = output.streams ?? []
  // Ảnh bìa trong file nhạc (mp3 có ảnh album) cũng là "video stream" – bỏ qua nó
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const audio = streams.find((s) => s.codec_type === 'audio')

  let kind: MediaKind = kindByExt
  // Đuôi file nói một đằng nhưng nội dung thực tế khác (vd. file .mp4 chỉ có âm thanh)
  if (kind === 'video' && !video && audio) kind = 'audio'
  if ((kind === 'video' || kind === 'image') && !video) throw new ProbeError('unreadable', 'không có hình')
  if (kind === 'audio' && !audio) throw new ProbeError('unreadable', 'không có âm thanh')

  const durationSec = Number(output.format?.duration ?? video?.duration ?? audio?.duration ?? 0)
  const durationUs = kind === 'image' ? 0 : Math.round((Number.isFinite(durationSec) ? durationSec : 0) * 1e6)
  if (kind !== 'image' && durationUs <= 0) throw new ProbeError('unreadable', 'không xác định được thời lượng')

  let width = kind !== 'audio' ? (video?.width ?? null) : null
  let height = kind !== 'audio' ? (video?.height ?? null) : null
  // Video quay dọc bằng điện thoại thường lưu ngang + cờ "xoay 90°" → đổi chỗ rộng/cao
  if (video && Math.abs(rotationOf(video)) % 180 === 90) [width, height] = [height, width]

  return {
    kind,
    durationUs,
    width,
    height,
    fps: kind === 'video' ? (parseRate(video?.avg_frame_rate) ?? parseRate(video?.r_frame_rate)) : null,
    hasAudio: Boolean(audio) && kind !== 'image',
    videoCodec: kind !== 'audio' ? (video?.codec_name ?? null) : null,
    pixelFormat: kind !== 'audio' ? (video?.pix_fmt ?? null) : null,
    audioCodec: audio?.codec_name ?? null,
    formatName: output.format?.format_name ?? ''
  }
}

export async function probeFile(ffprobeExe: string, filePath: string): Promise<ProbeInfo> {
  if (!mediaKindFromPath(filePath)) throw new ProbeError('unsupported', filePath)
  let stdout: string
  try {
    ;({ stdout } = await runProcess(ffprobeExe, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ]))
  } catch (err) {
    throw new ProbeError('unreadable', (err as Error).message)
  }
  return parseProbeOutput(JSON.parse(stdout) as FfprobeOutput, filePath)
}
