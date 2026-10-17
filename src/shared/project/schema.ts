// Mô hình dữ liệu của một dự án Cutcap.
// Đây là "nguồn sự thật" duy nhất: giao diện, preview và engine xuất video đều đọc từ đây.
// Toàn bộ object này được lưu nguyên vẹn thành file JSON (.cutcap).
//
// QUY TẮC KHI SỬA FILE NÀY:
//   - Chỉ dùng dữ liệu thuần (string, number, boolean, null, mảng, object) – không class, không Date.
//   - Thời gian luôn là số nguyên micro-giây (kiểu Micros).
//   - Nếu đổi cấu trúc mà file cũ không còn đọc đúng: tăng PROJECT_FORMAT_VERSION
//     và viết hàm chuyển đổi trong migrate.ts.
import type { Micros } from './time'

/** Phiên bản định dạng file dự án. */
export const PROJECT_FORMAT_VERSION = 1

/** Đuôi file dự án (không có dấu chấm). */
export const PROJECT_FILE_EXTENSION = 'cutcap'

/** Mã định danh duy nhất (UUID). */
export type Id = string

// ───────────────────────── Cài đặt dự án ─────────────────────────

export const ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const
export type AspectRatio = (typeof ASPECT_RATIOS)[number]

export const RESOLUTIONS = ['720p', '1080p', '4k'] as const
export type Resolution = (typeof RESOLUTIONS)[number]

export const FRAME_RATES = [24, 25, 30, 50, 60] as const
export type FrameRate = (typeof FRAME_RATES)[number]

export interface ProjectSettings {
  aspectRatio: AspectRatio
  /** Độ phân giải mặc định khi xuất (có thể đổi lại trong hộp thoại xuất). */
  resolution: Resolution
  fps: FrameRate
  /** Màu nền khi không có video phủ kín khung hình, dạng "#rrggbb". */
  backgroundColor: string
}

// ───────────────────────── Media đã nhập ─────────────────────────

export const MEDIA_KINDS = ['video', 'image', 'audio'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

/** Một file media đã nhập vào dự án (một file có thể dùng cho nhiều clip). */
export interface MediaAsset {
  id: Id
  kind: MediaKind
  /** Đường dẫn tuyệt đối tới file gốc trên máy. */
  path: string
  /** Tên hiển thị (mặc định là tên file). */
  name: string
  /** Thời lượng file gốc. Ảnh tĩnh = 0. */
  durationUs: Micros
  width: number | null
  height: number | null
  fps: number | null
  hasAudio: boolean
}

// ───────────────────────── Track và clip ─────────────────────────

export const TRACK_KINDS = ['video', 'audio', 'text', 'sticker', 'effect'] as const
export type TrackKind = (typeof TRACK_KINDS)[number]

export interface Track {
  id: Id
  kind: TrackKind
  /** Tên do người dùng đặt. Rỗng = giao diện tự hiển thị tên mặc định theo ngôn ngữ. */
  name: string
  muted: boolean
  hidden: boolean
  locked: boolean
  /** Các clip trên track, luôn sắp theo `start` tăng dần, không chồng lên nhau. */
  clips: Clip[]
}

/** Vị trí/kích thước của một lớp hình trên khung hình. */
export interface Transform {
  /** Tâm theo chiều ngang, 0 = mép trái, 1 = mép phải. */
  x: number
  /** Tâm theo chiều dọc, 0 = mép trên, 1 = mép dưới. */
  y: number
  /** 1 = kích thước gốc (vừa khung hình). */
  scale: number
  /** Góc xoay (độ). */
  rotation: number
  /** 0 = trong suốt, 1 = rõ hoàn toàn. */
  opacity: number
}

/** Chỉnh màu cơ bản. Mỗi giá trị từ -100 đến 100, 0 = không đổi. */
export interface ColorAdjust {
  brightness: number
  contrast: number
  saturation: number
}

export const TRANSITION_KINDS = ['fade', 'slide-left', 'slide-right', 'zoom'] as const
export type TransitionKind = (typeof TRANSITION_KINDS)[number]

/** Chuyển cảnh giữa clip này và clip ngay trước nó trên cùng track. */
export interface Transition {
  kind: TransitionKind
  duration: Micros
}

/** Các thuộc tính đặt keyframe được (xem shared/timeline/keyframes.ts). */
export const KEYFRAME_PROPS = ['scale', 'x', 'y', 'rotation', 'opacity', 'volume'] as const
export type KeyframeProp = (typeof KEYFRAME_PROPS)[number]

export interface Keyframe {
  /** Thời điểm, tính từ ĐẦU CLIP (µs trên timeline). */
  time: Micros
  value: number
}

/** Keyframe theo thuộc tính, mỗi danh sách sắp xếp theo thời gian. Thuộc tính không có = không chuyển động. */
export type Keyframes = Partial<Record<KeyframeProp, Keyframe[]>>

interface ClipBase {
  id: Id
  /** Vị trí bắt đầu trên timeline. */
  start: Micros
  /** Độ dài hiển thị trên timeline (đã tính tốc độ). */
  duration: Micros
  keyframes: Keyframes
}

/** Một hiệu ứng động của clip (Vào / Ra / Kết hợp) – xem shared/render/clipAnims.ts. */
export interface ClipAnim {
  id: string
  /** Thời lượng (Kết hợp: thời lượng phần VÀO ở đầu clip). */
  duration: Micros
  /** Chỉ dùng cho Kết hợp: thời lượng phần RA ở cuối clip (không có → bằng `duration`). */
  outDuration?: Micros
}

/** Thiết lập xử lý âm thanh của clip (xem shared/render/voices.ts). */
export interface AudioFx {
  voice: string | null
  enhance: boolean
  denoise: boolean
  original: Id
}

/** Clip video / ảnh / âm thanh lấy từ một MediaAsset. */
export interface MediaClip extends ClipBase {
  type: 'media'
  assetId: Id
  /** Điểm bắt đầu lấy trong file gốc (cắt đầu). */
  sourceIn: Micros
  /** Tốc độ phát: 0.25 – 4. */
  speed: number
  /** Âm lượng: 0 = tắt, 1 = gốc, 2 = gấp đôi. */
  volume: number
  fadeIn: Micros
  fadeOut: Micros
  /** Mã bộ lọc màu (null = không dùng). Xem shared/render/filters.ts */
  filter: string | null
  /** Cường độ bộ lọc: 0 = không tác dụng, 1 = đầy đủ. */
  filterIntensity: number
  adjust: ColorAdjust
  transform: Transform
  transitionIn: Transition | null
  /**
   * Đã "Xóa giọng hát": id media GỐC trước khi xóa (để nút "Khôi phục" đổi lại). null = chưa xóa giọng.
   * Trường mới – file dự án cũ không có → null.
   */
  vocalsRemovedFrom: Id | null
  /** Hiệu ứng động (tab "Hiệu ứng động"); null = không có. Trường mới – file cũ không có → null. */
  animIn: ClipAnim | null
  animOut: ClipAnim | null
  animCombo: ClipAnim | null
  /**
   * Xử lý âm thanh (Giảm tiếng ồn, Cải thiện giọng nói, Trình thay đổi giọng nói) + media GỐC trước khi
   * xử lý (tắt hết / chọn "Bản gốc" là trả lại). null = chưa xử lý. Trường mới – file cũ không có → null.
   */
  audioFx: AudioFx | null
  /**
   * Clip VIDEO đã xử lý âm thanh: file âm thanh đã xử lý phát THAY cho tiếng gốc của video
   * (hình vẫn lấy từ assetId, âm thanh vẫn nằm trong clip – không tách ra track riêng).
   * null = dùng tiếng của chính video. Trường mới – file cũ không có → null.
   */
  audioAssetId: Id | null
  /**
   * "Chuẩn hóa âm lượng": độ to đã đo (LUFS) + âm lượng trước khi chuẩn hóa (bỏ chọn là trả lại).
   * null = chưa chuẩn hóa. Trường mới – file cũ không có → null.
   */
  loudnorm: { measured: number; prevVolume: number } | null
}

export const TEXT_ANIMATIONS = ['none', 'fade', 'slide-up', 'zoom', 'typewriter'] as const
export type TextAnimation = (typeof TEXT_ANIMATIONS)[number]

export interface TextStyle {
  /** Tên font cài trong Windows, ví dụ "Segoe UI". */
  fontFamily: string
  /** Cỡ chữ tính theo khung hình có cạnh ngắn 1080px. */
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  strokeColor: string | null
  strokeWidth: number
  backgroundColor: string | null
}

export interface TextClip extends ClipBase {
  type: 'text'
  text: string
  style: TextStyle
  transform: Transform
  animationIn: TextAnimation
  animationDuration: Micros
  /**
   * Chữ do "Phụ đề tự động" tạo (để "Xóa phụ đề hiện tại" chỉ xóa đúng những chữ này).
   * Trường mới – file cũ không có → false.
   */
  caption: boolean
}

export interface StickerClip extends ClipBase {
  type: 'sticker'
  assetId: Id
  transform: Transform
}

/**
 * Hiệu ứng video (tab "Hiệu ứng"): nằm trên track "Hiệu ứng", tác động lên mọi thứ ở các track
 * bên dưới trong khoảng thời gian của clip. Xem shared/render/effects.ts.
 */
export interface EffectClip extends ClipBase {
  type: 'effect'
  /** Mã hiệu ứng trong EFFECTS (mã lạ – vd. từ phiên bản mới hơn – thì bỏ qua khi vẽ). */
  effectId: string
  /** Không dùng (hiệu ứng tác động cả khung hình) – giữ để mọi clip có cùng cấu trúc. */
  transform: Transform
}

export type Clip = MediaClip | TextClip | StickerClip | EffectClip

// ───────────────────────── Dự án ─────────────────────────

export interface Project {
  formatVersion: number
  id: Id
  name: string
  /** Thời điểm tạo/sửa, chuỗi ISO 8601. */
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
  /** Media đã nhập, tra cứu theo id. */
  assets: Record<Id, MediaAsset>
  /** Thứ tự hiển thị trên timeline: phần tử đầu tiên nằm trên cùng. */
  tracks: Track[]
}
