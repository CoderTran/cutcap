// Tên các kênh IPC (giao tiếp giữa giao diện và tiến trình chính).
// Đặt ở một chỗ để main và preload luôn dùng cùng một tên, tránh gõ sai.
import type { AudioDerive } from './media/derived'
import type { FrameRate, MediaAsset, Project, Resolution } from './project/schema'

export const IpcChannels = {
  getAppInfo: 'app:get-info',
  openProject: 'project:open',
  saveProject: 'project:save',
  askUnsavedChanges: 'project:ask-unsaved',
  setDirty: 'project:set-dirty',
  closeRequested: 'window:close-requested',
  closeWindow: 'window:close',
  pickMediaFiles: 'media:pick-files',
  importMedia: 'media:import',
  extractAudio: 'media:extract-audio',
  prepareMedia: 'media:prepare',
  mediaUpdated: 'media:updated',
  exportDetectEncoders: 'export:detect-encoders',
  exportChoosePath: 'export:choose-path',
  exportStart: 'export:start',
  exportCancel: 'export:cancel',
  exportReveal: 'export:reveal',
  exportProgress: 'export:progress',
  exportFinished: 'export:finished',
  listFonts: 'fonts:list',
  openProjectPath: 'project:open-path',
  openRequested: 'project:open-requested',
  autosaveWrite: 'autosave:write',
  autosaveClear: 'autosave:clear',
  autosaveList: 'autosave:list',
  autosaveLoad: 'autosave:load',
  recentList: 'recent:list',
  recentRemove: 'recent:remove',
  relinkPick: 'media:relink-pick',
  relinkFindInFolder: 'media:relink-find',
  libraryList: 'library:list',
  libraryCreate: 'library:create',
  libraryRename: 'library:rename',
  libraryDuplicate: 'library:duplicate',
  libraryTrash: 'library:trash',
  libraryReveal: 'library:reveal'
} as const

/** Thông tin cơ bản về ứng dụng, hiển thị ở thanh trạng thái. */
export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
}

export interface OpenProjectResult {
  filePath: string
  project: Project
}

export interface SaveProjectRequest {
  project: Project
  /** Đường dẫn hiện tại; null = dự án chưa từng được lưu. */
  filePath: string | null
  /** true = luôn hỏi vị trí lưu mới ("Lưu thành…"). */
  saveAs: boolean
}

export interface SaveProjectResult {
  filePath: string
  /** Thời điểm lưu (ISO) – đã được ghi vào trường updatedAt trong file. */
  savedAt: string
}

export interface RecentProject {
  path: string
  name: string
  /** Lần mở/lưu gần nhất (ISO). */
  openedAt: string
}

/** Thông tin một dự án để hiện trên màn hình Trang chủ. */
export interface ProjectSummary {
  path: string
  id: string
  name: string
  /** Lần sửa cuối (ISO). */
  updatedAt: string
  durationUs: number
  /** Tổng dung lượng các file media dự án dùng. */
  mediaBytes: number
  /** Số file media không còn tìm thấy. */
  missingMedia: number
  thumbnailUrl: string | null
}

/** Một bản tự động lưu còn sót lại (app bị tắt ngang). */
export interface RecoverableProject {
  projectId: string
  name: string
  savedAt: string
  filePath: string | null
}

/** Lựa chọn của người dùng khi có thay đổi chưa lưu. */
export type UnsavedChoice = 'save' | 'discard' | 'cancel'

// ───────── Media ─────────

export type MediaImportErrorCode = 'unsupported' | 'unreadable' | 'missing' | 'ffmpeg-missing'

/** Kết quả "Trích xuất âm thanh" từ một video: đường dẫn file .m4a vừa tạo (hoặc đã có sẵn). */
export type ExtractAudioResult =
  | { ok: true; path: string }
  | { ok: false; error: 'no-audio' | 'mono' | 'missing' | 'ffmpeg-missing' | 'failed'; detail?: string }

export type ImportMediaResult =
  | { ok: true; asset: MediaAsset }
  | { ok: false; path: string; error: MediaImportErrorCode; detail?: string }

/** Trạng thái bản proxy (bản nhẹ dùng để preview). */
export type ProxyState = 'not-needed' | 'queued' | 'running' | 'ready' | 'error'

/**
 * Thông tin để HIỂN THỊ một file media trong giao diện – không lưu vào dự án,
 * vì nó phụ thuộc vào máy (thư mục cache) và có thể tạo lại bất cứ lúc nào.
 */
export interface MediaPreview {
  /** Đường dẫn file gốc – khóa để ghép với MediaAsset.path. */
  path: string
  status: 'ready' | 'missing' | 'error'
  thumbnailUrl: string | null
  /** Ảnh sóng âm của CẢ file (null = không có tiếng) – timeline cắt đúng đoạn clip dùng. */
  waveformUrl: string | null
  /** URL cho <video>/<audio>/<img> trong preview: proxy nếu có, ngược lại file gốc. null = đang tạo proxy. */
  playbackUrl: string | null
  proxy: ProxyState
  /** Tiến trình tạo proxy, 0 → 1. */
  proxyProgress: number
  error: string | null
}

// ───────── Xuất video ─────────

/** Bộ mã hóa H.264: 3 loại GPU (NVIDIA / Intel / AMD) và CPU. */
export type EncoderId = 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'libx264'
export type ExportQuality = 'high' | 'standard' | 'small'

export interface ExportSettings {
  /** Đường dẫn file .mp4 sẽ tạo. */
  outputPath: string
  resolution: Resolution
  fps: FrameRate
  quality: ExportQuality
  /** 'auto' = chọn GPU nhanh nhất đang dùng được, không có thì CPU. */
  encoder: 'auto' | EncoderId
}

/** Ảnh PNG của một clip chữ (vẽ sẵn ở giao diện, xem renderTextFrames). */
export interface TextFrameSet {
  clipId: string
  /** Các khung của đoạn hiệu ứng xuất hiện (có thể rỗng). */
  animated: Uint8Array[]
  /** Khung tĩnh cho phần còn lại của clip. */
  still: Uint8Array
}

export interface ExportRequest {
  /** Bản chụp dự án lúc bấm Xuất – sửa tiếp trong lúc xuất không ảnh hưởng. */
  project: Project
  settings: ExportSettings
  textFrames: TextFrameSet[]
}

export interface ExportProgress {
  /** 0 → 1 */
  progress: number
  /** Số giây đã chạy. */
  elapsedSec: number
  /** Ước tính số giây còn lại (null khi chưa đủ dữ liệu). */
  etaSec: number | null
  /** Tốc độ so với thời gian thực, ví dụ 2.5 = nhanh gấp 2,5 lần. */
  speed: number | null
  encoder: EncoderId
}

export type ExportResult =
  | { status: 'done'; outputPath: string; elapsedSec: number; encoder: EncoderId; sizeBytes: number }
  | { status: 'cancelled' }
  | { status: 'error'; message: string; detail: string }

/**
 * API mà preload "mở" cho giao diện qua `window.cutcap`.
 * Giao diện KHÔNG được truy cập Node.js trực tiếp (vì an toàn),
 * mọi thao tác hệ thống đều phải đi qua các hàm ở đây.
 */
export interface CutcapApi {
  getAppInfo(): Promise<AppInfo>

  /** Hiện hộp thoại chọn file rồi đọc dự án. null = người dùng bấm Hủy hoặc file lỗi (đã báo lỗi). */
  openProject(): Promise<OpenProjectResult | null>
  /** Ghi dự án ra file (hỏi vị trí nếu cần). null = người dùng bấm Hủy hoặc ghi lỗi (đã báo lỗi). */
  saveProject(request: SaveProjectRequest): Promise<SaveProjectResult | null>
  /** Hỏi "Lưu thay đổi?" với 3 lựa chọn Lưu / Không lưu / Hủy. */
  askUnsavedChanges(projectName: string): Promise<UnsavedChoice>

  /** Báo cho main biết dự án có thay đổi chưa lưu (để chặn đóng cửa sổ). */
  setDirty(dirty: boolean): void
  /** Đăng ký xử lý khi người dùng bấm nút X mà còn thay đổi chưa lưu. Trả về hàm hủy đăng ký. */
  onCloseRequested(callback: () => void): () => void
  /** Đóng cửa sổ thật sự (sau khi đã xử lý xong việc lưu). */
  closeWindow(): void

  /** Hộp thoại chọn nhiều file media (only = 'video': chỉ cho chọn video). Trả về [] nếu bấm Hủy. */
  pickMediaFiles(only?: 'video'): Promise<string[]>
  /** Đọc thông tin các file (ffprobe) để thêm vào dự án. */
  importMedia(paths: string[]): Promise<ImportMediaResult[]>
  /**
   * Tách tiếng của một video ra file .m4a (trong thư mục "Âm thanh trích xuất").
   * mode = 'karaoke': tạo bản đã xóa giọng hát (từ video hoặc file âm thanh stereo).
   */
  extractAudio(path: string, mode?: AudioDerive): Promise<ExtractAudioResult>
  /** Chuẩn bị thumbnail + bản phát (tạo proxy chạy nền nếu cần). */
  prepareMedia(path: string): Promise<MediaPreview>
  /** Nhận cập nhật khi proxy tiến triển / xong / lỗi. Trả về hàm hủy đăng ký. */
  onMediaUpdated(callback: (preview: MediaPreview) => void): () => void
  /** Lấy đường dẫn thật của file kéo thả từ Windows Explorer. */
  getPathForFile(file: File): string

  /** Các bộ mã hóa dùng được trên máy này, theo thứ tự ưu tiên (nhanh nhất trước). */
  detectEncoders(): Promise<EncoderId[]>
  /** Hộp thoại chọn nơi lưu video. null = bấm Hủy. */
  chooseExportPath(defaultName: string, currentPath: string | null): Promise<string | null>
  /** Bắt đầu xuất (chạy nền). Kết quả báo qua onExportFinished. */
  startExport(request: ExportRequest): Promise<void>
  cancelExport(): void
  /** Mở File Explorer và chọn sẵn file vừa xuất. */
  revealInFolder(path: string): void
  onExportProgress(callback: (progress: ExportProgress) => void): () => void
  onExportFinished(callback: (result: ExportResult) => void): () => void

  /** Tên các font cài trong Windows (sắp xếp A→Z). */
  listFonts(): Promise<string[]>

  /** Mở dự án theo đường dẫn (dự án gần đây, bấm đúp file .cutcap). null = lỗi (đã báo). */
  openProjectPath(path: string): Promise<OpenProjectResult | null>
  /** Main yêu cầu mở một file .cutcap (người dùng bấm đúp file trong Explorer). */
  onOpenRequested(callback: (path: string) => void): () => void

  autosaveWrite(project: Project, filePath: string | null): Promise<void>
  autosaveClear(projectId: string): Promise<void>
  autosaveList(): Promise<RecoverableProject[]>
  autosaveLoad(projectId: string): Promise<{ project: Project; filePath: string | null }>

  recentList(): Promise<RecentProject[]>
  recentRemove(path: string): Promise<void>

  /** Hộp thoại chọn vị trí mới cho file media bị mất. null = bấm Hủy. */
  relinkPick(oldPath: string): Promise<string | null>
  /** Tìm các file bị mất (theo tên) trong một thư mục. Trả về đường dẫn cũ → mới. */
  relinkFindInFolder(folder: string, oldPaths: string[]): Promise<Record<string, string>>

  /** Danh sách dự án cho Trang chủ (mới sửa nhất trước). */
  libraryList(): Promise<ProjectSummary[]>
  /** Tạo dự án mới trong thư mục dự án mặc định (ghi file ngay). */
  libraryCreate(): Promise<OpenProjectResult>
  libraryRename(path: string, name: string): Promise<void>
  /** Nhân bản dự án; trả về đường dẫn bản sao. */
  libraryDuplicate(path: string, copySuffix: string): Promise<string>
  /** Chuyển file dự án vào Thùng rác của Windows (khôi phục được). */
  libraryTrash(path: string): Promise<void>
  /** Mở File Explorer tại file dự án. */
  libraryReveal(path: string): void
}
