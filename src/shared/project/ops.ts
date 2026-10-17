// Các thao tác chỉnh sửa dự án, dạng hàm thuần chạy trên "bản nháp" (draft) của Immer.
// Hàm ở đây được phép sửa trực tiếp object; Immer sẽ tạo bản mới bất biến
// và ghi lại "patch" để Undo/Redo.
//
// Không gọi các hàm này trực tiếp từ giao diện – hãy đi qua projectStore.apply(...)
// để thao tác được ghi vào lịch sử.
import { createTrack } from './factory'
import type { Clip, Id, MediaAsset, Project, ProjectSettings, TrackKind } from './schema'

export function renameProject(draft: Project, name: string): void {
  draft.name = name.trim()
}

export function updateSettings(draft: Project, changes: Partial<ProjectSettings>): void {
  Object.assign(draft.settings, changes)
}

/**
 * Thêm track mới.
 * Track hình (video/sticker/chữ) được đặt lên trên cùng (lớp phủ). Track âm thanh được đặt
 * ngay dưới các track hình – tức là trên các track âm thanh cũ, giống CapCut.
 * @returns id của track mới
 */
export function addTrack(draft: Project, kind: TrackKind): Id {
  const track = createTrack(kind)
  if (kind === 'audio') {
    const firstAudio = draft.tracks.findIndex((t) => t.kind === 'audio')
    draft.tracks.splice(firstAudio === -1 ? draft.tracks.length : firstAudio, 0, track)
  } else {
    draft.tracks.unshift(track)
  }
  return track.id
}

export function removeTrack(draft: Project, trackId: Id): void {
  const index = draft.tracks.findIndex((t) => t.id === trackId)
  if (index >= 0) draft.tracks.splice(index, 1)
}

/**
 * Giống CapCut: track không còn clip nào thì tự biến mất (vd. xóa chữ cuối cùng → track "Chữ 1" mất theo).
 * Luôn giữ lại track video chính (track video dưới cùng) để timeline không bao giờ trống trơn.
 */
export function pruneEmptyTracks(draft: Project): void {
  const videoTracks = draft.tracks.filter((t) => t.kind === 'video')
  const mainId = videoTracks[videoTracks.length - 1]?.id
  if (!draft.tracks.some((t) => t.clips.length === 0 && t.id !== mainId)) return
  draft.tracks = draft.tracks.filter((t) => t.clips.length > 0 || t.id === mainId)
}

export function setTrackFlag(
  draft: Project,
  trackId: Id,
  flag: 'muted' | 'hidden' | 'locked',
  value: boolean
): void {
  const track = draft.tracks.find((t) => t.id === trackId)
  if (track) track[flag] = value
}

/** Thêm các media đã nhập vào thư viện của dự án. */
export function addAssets(draft: Project, assets: MediaAsset[]): void {
  for (const asset of assets) draft.assets[asset.id] = asset
}

/** Media có đang được clip nào dùng không. */
export function isAssetUsed(project: Project, assetId: Id): boolean {
  return project.tracks.some((t) => t.clips.some((c) => c.type !== 'text' && c.assetId === assetId))
}

/**
 * Xóa media khỏi thư viện. Không xóa nếu còn clip đang dùng (tránh clip "mồ côi").
 * @returns true nếu đã xóa
 */
export function removeAsset(draft: Project, assetId: Id): boolean {
  if (!draft.assets[assetId] || isAssetUsed(draft, assetId)) return false
  delete draft.assets[assetId]
  return true
}

/**
 * Thêm clip vào track, giữ danh sách clip sắp theo thời gian bắt đầu.
 * Không kiểm tra chồng lấn – nơi gọi phải kiểm tra trước (xem canPlace trong timeline/clips).
 */
export function addClip(draft: Project, trackId: Id, clip: Clip): void {
  const track = draft.tracks.find((t) => t.id === trackId)
  if (!track) throw new Error(`Không tìm thấy track ${trackId}`)
  const index = track.clips.findIndex((c) => c.start > clip.start)
  track.clips.splice(index === -1 ? track.clips.length : index, 0, clip)
}

/**
 * Trỏ media sang file mới (file cũ bị di chuyển / đổi tên). Giữ nguyên id → mọi clip dùng media này
 * tự dùng file mới. Thông tin file (thời lượng, kích thước…) lấy theo file mới.
 * @returns false nếu loại media khác nhau (vd. trỏ video sang file nhạc)
 */
export function relinkAsset(draft: Project, assetId: Id, replacement: MediaAsset): boolean {
  const current = draft.assets[assetId]
  if (!current || current.kind !== replacement.kind) return false
  draft.assets[assetId] = { ...replacement, id: assetId }
  return true
}
