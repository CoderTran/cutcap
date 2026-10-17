// Kích thước cố định của timeline (pixel). Đặt chung một chỗ để các component khớp nhau.
import type { Track, TrackKind } from '@shared/project/schema'

/** Bề rộng cột tiêu đề track bên trái. */
export const HEADER_WIDTH = 210
export const RULER_HEIGHT = 28
/** Vùng trống dưới các track để thả media tạo track mới. */
export const DROP_ZONE_HEIGHT = 56
/** Chừa thêm khoảng trống sau clip cuối để còn chỗ kéo thả tiếp. */
export const TAIL_PADDING_PX = 600
/** Kéo/thả cách mốc dưới bấy nhiêu pixel thì tự hít vào mốc đó. */
export const SNAP_PX = 8

const TRACK_HEIGHT: Record<TrackKind, number> = { video: 64, audio: 44, text: 36, sticker: 36 }

export function trackHeight(track: Pick<Track, 'kind'>): number {
  return TRACK_HEIGHT[track.kind]
}

/** Toạ độ dọc (tính từ dưới thước) của mép trên từng track. */
export function trackOffsets(tracks: Track[]): number[] {
  const offsets: number[] = []
  let y = 0
  for (const t of tracks) {
    offsets.push(y)
    y += trackHeight(t)
  }
  return offsets
}
