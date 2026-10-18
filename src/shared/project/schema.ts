// Mô hình dữ liệu của một dự án Cutcap.
// Đây là "nguồn sự thật" duy nhất: giao diện, preview và engine xuất video đều đọc từ đây.
// Toàn bộ object này được lưu nguyên vẹn thành file JSON (.cutcap).
//
// QUY TẮC KHI SỬA FILE NÀY:
//   - Chỉ dùng dữ liệu thuần (string, number, boolean, null, mảng, object) – không class, không Date.
//   - Thời gian luôn là số nguyên micro-giây (kiểu Micros).
//   - Nếu đổi cấu trúc mà file cũ không còn đọc đúng: tăng PROJECT_FORMAT_VERSION
//     và viết hàm chuyển đổi trong migrate.ts.
import type { Beauty } from '../render/beauty'
import type { FaceShape } from '../render/faceShape'
import type { ColorGrade } from '../render/grade'
import type { ClipMask } from '../render/mask'
import type { SpeedCurve } from '../timeline/speedCurve'
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

export const TRANSITION_KINDS = [
  'fade',
  'slide-left',
  'slide-right',
  'zoom',
  // Làm méo điểm ảnh (shared/render/pixelTransitions.ts)
  'rippleChroma',
  'waveWipe',
  'flashGlow',
  'mosaic',
  'swirl',
  'tearUp'
] as const
export type TransitionKind = (typeof TRANSITION_KINDS)[number]

/** Chuyển cảnh giữa clip này và clip ngay trước nó trên cùng track. */
export interface Transition {
  kind: TransitionKind
  duration: Micros
}

/** Các thuộc tính đặt keyframe được (xem shared/timeline/keyframes.ts). */
export const KEYFRAME_PROPS = [
  'scale',
  'x',
  'y',
  'rotation',
  'opacity',
  'volume',
  // Mặt nạ (Điều chỉnh → Mặt nạ)
  'maskX',
  'maskY',
  'maskRotation',
  'maskWidth',
  'maskHeight',
  'maskFeather',
  'maskRoundness'
] as const
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
  /**
   * Làm đẹp – Làn da (làm mịn, trắng da, trắng răng…), mỗi mức 0–100. null = không làm đẹp.
   * Trường mới – file cũ không có → null. Xem shared/render/beauty.ts.
   */
  beauty: Beauty | null
  /** Làm đẹp – Khuôn mặt (thon gọn, V-line, cằm…). null = không chỉnh. Trường mới – file cũ không có → null. */
  faceShape: FaceShape | null
  /**
   * Tốc độ → Uốn cong: tốc độ thay đổi trong clip (khi có thì bỏ qua `speed`). null = tốc độ đều.
   * Trường mới – file cũ không có → null. Xem shared/timeline/speedCurve.ts.
   */
  speedCurve: SpeedCurve | null
  /**
   * Điều chỉnh màu (Cơ bản, HSL, Đường cong, Vòng tròn màu). null = không chỉnh.
   * Trường mới – file cũ không có → null. Xem shared/render/grade.ts.
   */
  grade: ColorGrade | null
  /** Mặt nạ (Điều chỉnh → Mặt nạ). null = không có. Trường mới – file cũ không có → null. */
  mask: ClipMask | null
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
  /** Hiệu ứng văn bản (gradient, nhiều lớp viền, phát sáng, 3D, khung nền…). Trường mới – file cũ không có → null. */
  fx?: TextFx | null
}

/**
 * Hiệu ứng văn bản (tab Văn bản → Hiệu ứng văn bản). Kích thước tính theo CỠ CHỮ (em: 0.1 = 10% cỡ chữ)
 * → phóng to / thu nhỏ chữ thì hiệu ứng theo đúng tỉ lệ. Vẽ ở renderer/src/engine/text/drawText.ts.
 */
export interface TextFx {
  /** Tô chữ bằng gradient (thay cho màu chữ); angle: độ, 90 = từ trên xuống; hard: các màu chia khúc rõ (không chuyển mềm). */
  fill: { colors: string[]; angle: number; hard?: boolean } | null
  /** Chữ rỗng: không tô ruột, chỉ còn viền. */
  hollow?: boolean
  /** Các lớp viền THÊM bên ngoài viền thường, từ trong ra ngoài (độ dày em, cộng dồn); colors: viền chuyển màu. */
  outlines: { color: string; width: number; colors?: string[] }[]
  /** Phát sáng quanh chữ (blur em). */
  glow: { color: string; blur: number } | null
  /** Bóng đổ (dx, dy, blur em). */
  shadow: { color: string; dx: number; dy: number; blur: number } | null
  /** Chữ nổi khối 3D: kéo dài theo hướng angle (độ), sâu depth em. */
  extrude: { color: string; depth: number; angle: number } | null
  /** Bản sao lệch phía sau chữ (glitch, viền đôi lệch); hollow: chỉ vẽ viền dày `width` em. */
  echoes?: { color: string; dx: number; dy: number; hollow: boolean; width: number }[]
  /** Kết cấu phủ trên mặt chữ. */
  texture?: { kind: (typeof TEXT_TEXTURES)[number]; color: string; amount: number } | null
  /** Vát cạnh: mép trên-trái sáng, dưới-phải tối (size em). */
  bevel?: { light: string; dark: string; size: number } | null
  /** Khung nền sau chữ. */
  box: TextBox | null
  /** Trang trí quanh chữ (sao lấp lánh, tim, tuyết, lửa, sơn chảy…). */
  decor?: { kind: (typeof TEXT_DECORS)[number]; color: string; count: number } | null
}

export const TEXT_TEXTURES = ['glitter', 'noise', 'halftone', 'stripes'] as const
export const TEXT_DECORS = ['sparkle', 'star', 'heart', 'bubble', 'snow', 'flame', 'drip', 'confetti'] as const

export const TEXT_BOX_SHAPES = ['rect', 'pill', 'skew', 'ragged', 'cloud', 'brush', 'banner', 'scribble'] as const
export type TextBoxShape = (typeof TEXT_BOX_SHAPES)[number]
export const TEXT_BOX_PATTERNS = ['stripes', 'dots', 'grid'] as const

export interface TextBox {
  shape: TextBoxShape
  /** 1 màu, hoặc 2 màu = gradient dọc. */
  colors: string[]
  /** Khoảng đệm quanh chữ (em). */
  padX: number
  padY: number
  /** Bo góc (em) – kiểu rect. */
  radius: number
  /** Xoay nghiêng cả khung (độ). */
  tilt: number
  /** Hoa văn phủ lên khung. */
  pattern: { kind: (typeof TEXT_BOX_PATTERNS)[number]; color: string } | null
  /** Viền khung. */
  stroke: { color: string; width: number } | null
}

export interface TextClip extends ClipBase {
  type: 'text'
  text: string
  style: TextStyle
  transform: Transform
  animationIn: TextAnimation
  animationDuration: Micros
  /** Hiệu ứng động (bảng phải → Hiệu ứng động): Vào / Ra (thời lượng) và Vòng lặp (chu kỳ). Xem shared/render/textAnims.ts. */
  textIn?: { id: string; duration: Micros } | null
  textOut?: { id: string; duration: Micros } | null
  textLoop?: { id: string; period: Micros } | null
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

/**
 * Ảnh bìa của video (nút "Ảnh bìa" ở đầu track chính, giống CapCut): một khung hình của video
 * (tại thời điểm `time` trên timeline) hoặc một ảnh trên máy. Khi xuất, ảnh bìa được nhúng vào file mp4
 * (hình thu nhỏ). `thumb`: ảnh nhỏ (JPEG data URL) để hiện trên giao diện.
 */
export type ProjectCover = ({ kind: 'frame'; time: Micros } | { kind: 'image'; path: string }) & { thumb: string }

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
  /** Ảnh bìa (không có = dùng khung hình đầu như bình thường). */
  cover?: ProjectCover | null
}
