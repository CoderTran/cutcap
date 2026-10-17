// Bộ mã hóa H.264: dò cái nào chạy được trên máy, và tham số chất lượng cho từng loại.
//
// Chỉ kiểm tra "FFmpeg có encoder X" là chưa đủ: máy có thể thiếu GPU tương ứng hoặc driver quá cũ
// (ví dụ: NVENC cần driver NVIDIA ≥ 570). Vì vậy ta MÃ HÓA THỬ 0,2 giây cho từng loại.
import type { EncoderId, ExportQuality } from '@shared/ipc'
import { runProcess } from '../media/processRunner'

/** Thứ tự ưu tiên: GPU NVIDIA → Intel → AMD → CPU. */
export const ENCODER_PRIORITY: EncoderId[] = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264']

/** Định dạng điểm ảnh đầu vào mà mỗi encoder chấp nhận. */
export function pixelFormatFor(encoder: EncoderId): string {
  return encoder === 'h264_qsv' ? 'nv12' : 'yuv420p'
}

/** Mức chất lượng: số càng nhỏ càng đẹp (và file càng nặng). */
const QUALITY_LEVEL: Record<ExportQuality, number> = { high: 18, standard: 21, small: 25 }

export function encoderArgs(encoder: EncoderId, quality: ExportQuality): string[] {
  const q = QUALITY_LEVEL[quality]
  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', String(q), '-b:v', '0']
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', String(q)]
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', String(q), '-qp_p', String(q + 2)]
    case 'libx264':
      return ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(q), '-profile:v', 'high']
  }
}

let cached: Promise<EncoderId[]> | null = null

/** Danh sách encoder dùng được (có cache – chỉ thử 1 lần mỗi lần mở app). */
export function detectEncoders(ffmpegExe: string): Promise<EncoderId[]> {
  cached ??= (async () => {
    // Thử LẦN LƯỢT (không song song): nhiều phiên mã hóa cùng lúc trên một GPU có thể báo lỗi giả
    const available: EncoderId[] = []
    for (const encoder of ENCODER_PRIORITY) {
      try {
        await runProcess(ffmpegExe, [
          '-hide_banner', '-loglevel', 'error',
          '-f', 'lavfi', '-i', 'color=c=black:s=256x256:r=30',
          '-t', '0.2',
          '-pix_fmt', pixelFormatFor(encoder),
          ...encoderArgs(encoder, 'standard'),
          '-f', 'null', '-'
        ])
        available.push(encoder)
      } catch {
        // encoder này không dùng được trên máy – bỏ qua
      }
    }
    return available
  })()
  return cached
}
