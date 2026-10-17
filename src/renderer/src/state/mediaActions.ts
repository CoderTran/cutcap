// Lệnh làm việc với media: nhập file (chọn hoặc kéo thả), xóa, và đồng bộ thumbnail/proxy.
import type { AudioDerive } from '@shared/media/derived'
import { fileNameOf, samePath } from '@shared/media/formats'
import * as ops from '@shared/project/ops'
import type { Id, MediaAsset } from '@shared/project/schema'
import { mediaStore, pathKey, type ImportError } from './mediaStore'
import { projectStore } from './projectStore'

/**
 * Nhập các file vào thư viện media của dự án.
 * File đã có trong thư viện sẽ được bỏ qua (không nhập trùng).
 */
export async function importPaths(paths: string[]): Promise<void> {
  const existing = Object.values(projectStore.getState().project.assets)
  const fresh = paths.filter(
    (p, i) => !existing.some((a) => samePath(a.path, p)) && paths.findIndex((q) => samePath(q, p)) === i
  )
  if (fresh.length === 0) return

  mediaStore.getState().setImporting(true)
  try {
    const results = await window.cutcap.importMedia(fresh)
    const assets: MediaAsset[] = []
    const errors: ImportError[] = []
    for (const r of results) {
      if (r.ok) assets.push(r.asset)
      else errors.push({ path: r.path, error: r.error })
    }
    // Cả lần nhập (dù nhiều file) = 1 bước Undo
    if (assets.length > 0) projectStore.getState().apply('history.importMedia', (d) => ops.addAssets(d, assets))
    mediaStore.getState().setImportErrors(errors)
  } finally {
    mediaStore.getState().setImporting(false)
  }
}

/** Mở hộp thoại chọn file rồi nhập. */
export async function pickAndImport(): Promise<void> {
  const paths = await window.cutcap.pickMediaFiles()
  if (paths.length > 0) await importPaths(paths)
}

/**
 * "Trích xuất âm thanh": tách tiếng của các video ra file .m4a rồi thêm vào thư viện
 * (hiện ở tab Âm thanh, tên dạng "<tên video> <nameSuffix>"). Cả lần trích xuất = 1 bước Undo.
 * Video không có tiếng hoặc lỗi → báo trong khung lỗi của thư viện.
 */
export async function extractAudioFrom(videoPaths: string[], nameSuffix: string): Promise<void> {
  if (videoPaths.length === 0) return
  const media = mediaStore.getState()
  media.setImporting(true)
  try {
    const { byVideo, errors } = await extractAudioAssets(videoPaths, nameSuffix)
    const existing = projectStore.getState().project.assets
    const fresh = [...new Map([...byVideo.values()].filter((a) => !existing[a.id]).map((a) => [a.id, a])).values()]
    if (fresh.length > 0) projectStore.getState().apply('history.extractAudio', (d) => ops.addAssets(d, fresh))
    media.setImportErrors(errors)
  } finally {
    media.setImporting(false)
  }
}

/**
 * Trích xuất (hoặc xóa giọng – mode 'karaoke') + đọc thông tin file âm thanh tạo ra (CHƯA thêm vào dự án).
 * File đã có trong thư viện thì trả về đúng media đó (không nhập trùng).
 * @returns byVideo: khóa = pathKey(đường dẫn video)
 */
export async function extractAudioAssets(
  videoPaths: string[],
  nameSuffix: string,
  mode: AudioDerive = 'extract'
): Promise<{ byVideo: Map<string, MediaAsset>; errors: ImportError[] }> {
  const errors: ImportError[] = []
  const byVideo = new Map<string, MediaAsset>()
  const toImport: { video: string; audioPath: string; name: string }[] = []
  const existing = Object.values(projectStore.getState().project.assets)

  for (const video of new Set(videoPaths)) {
    const r = await window.cutcap.extractAudio(video, mode)
    if (!r.ok) {
      errors.push({ path: video, error: r.error })
      continue
    }
    const known = existing.find((a) => samePath(a.path, r.path))
    if (known) byVideo.set(pathKey(video), known)
    else toImport.push({ video, audioPath: r.path, name: `${fileNameOf(video).replace(/\.[^.]+$/, '')} ${nameSuffix}` })
  }

  const results = toImport.length > 0 ? await window.cutcap.importMedia(toImport.map((e) => e.audioPath)) : []
  results.forEach((r, i) => {
    if (r.ok) byVideo.set(pathKey(toImport[i].video), { ...r.asset, name: toImport[i].name })
    else errors.push({ path: r.path, error: r.error })
  })
  return { byVideo, errors }
}

/** Chọn video trên máy rồi trích xuất âm thanh. */
export async function pickAndExtractAudio(nameSuffix: string): Promise<void> {
  await extractAudioFrom(await window.cutcap.pickMediaFiles('video'), nameSuffix)
}

/** Xóa media khỏi thư viện (chỉ khi không clip nào dùng). @returns true nếu đã xóa */
export function removeAsset(assetId: Id): boolean {
  let removed = false
  projectStore.getState().apply('history.removeMedia', (d) => {
    removed = ops.removeAsset(d, assetId)
  })
  return removed
}

export function dismissImportErrors(): void {
  mediaStore.getState().setImportErrors([])
}

/**
 * Bắt đầu đồng bộ: mỗi khi dự án có media mới (nhập, Undo xóa, mở dự án…),
 * yêu cầu main chuẩn bị thumbnail/proxy cho nó; và nhận cập nhật tiến trình proxy.
 * Gọi 1 lần khi khởi động. Trả về hàm dừng.
 */
export function startMediaSync(): () => void {
  const requested = new Set<string>()

  const syncAssets = (): void => {
    for (const asset of Object.values(projectStore.getState().project.assets)) {
      const key = pathKey(asset.path)
      if (requested.has(key)) continue
      requested.add(key)
      window.cutcap
        .prepareMedia(asset.path)
        .then((preview) => mediaStore.getState().setPreview(preview))
        .catch((err) => {
          console.error('prepareMedia thất bại', asset.path, err)
          requested.delete(key) // cho phép thử lại lần sau
        })
    }
  }

  const stopUpdates = window.cutcap.onMediaUpdated((preview) => mediaStore.getState().setPreview(preview))
  // Chỉ chạy lại khi danh sách media đổi (Immer giữ nguyên object nếu không đổi → so sánh nhanh)
  const stopProject = projectStore.subscribe((state, prev) => {
    if (state.project.assets !== prev.project.assets) syncAssets()
  })
  syncAssets()

  return () => {
    stopUpdates()
    stopProject()
  }
}

/** Thư mục chứa file: "C:\\a\\b.mp4" → "C:\\a". */
const folderOf = (path: string): string => path.slice(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')))

/**
 * Tìm lại file bị mất: người dùng chỉ ra vị trí mới, rồi app tự tìm các file bị mất KHÁC có cùng tên
 * trong cùng thư mục đó (thường gặp khi cả thư mục dự án được chép sang ổ khác).
 * @returns số media đã được trỏ lại (0 = hủy hoặc thất bại)
 */
export async function relinkAsset(assetId: Id): Promise<number> {
  const { project } = projectStore.getState()
  const asset = project.assets[assetId]
  if (!asset) return 0
  const newPath = await window.cutcap.relinkPick(asset.path)
  if (!newPath) return 0

  // Các media khác cũng đang bị mất → thử tìm trong thư mục mới
  const previews = mediaStore.getState().previews
  const otherMissing = Object.values(project.assets).filter(
    (a) => a.id !== assetId && previews[pathKey(a.path)]?.status === 'missing'
  )
  const found = await window.cutcap.relinkFindInFolder(folderOf(newPath), otherMissing.map((a) => a.path))

  // Đọc lại thông tin các file mới (thời lượng, kích thước có thể khác file cũ)
  const targets = [{ id: assetId, path: newPath }, ...otherMissing.filter((a) => found[a.path]).map((a) => ({ id: a.id, path: found[a.path] }))]
  const results = await window.cutcap.importMedia(targets.map((t) => t.path))
  const errors: ImportError[] = []
  let count = 0
  projectStore.getState().apply('history.relinkMedia', (d) => {
    results.forEach((r, i) => {
      if (!r.ok) {
        errors.push({ path: r.path, error: r.error })
        return
      }
      if (ops.relinkAsset(d, targets[i].id, r.asset)) count++
      else errors.push({ path: r.asset.path, error: 'unsupported' }) // khác loại media
    })
  })
  mediaStore.getState().setImportErrors(errors)
  return count
}
