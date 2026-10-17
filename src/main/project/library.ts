// Thư viện dự án cho màn hình Trang chủ.
//
// Danh sách dự án = (các file .cutcap trong thư mục dự án mặc định) ∪ (dự án mở gần đây ở nơi khác).
// Với mỗi dự án: tên, lần sửa cuối, thời lượng, tổng dung lượng media, ảnh thu nhỏ.
// Ảnh thu nhỏ: một khung hình của clip hình đầu tiên, tạo bằng FFmpeg, lưu cache theo lần sửa.
//
// Không import electron → test được.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { ProjectSummary } from '@shared/ipc'
import { samePath } from '@shared/media/formats'
import { createEmptyProject, createId } from '@shared/project/factory'
import { PROJECT_FILE_EXTENSION, type MediaClip, type Project } from '@shared/project/schema'
import { projectDuration } from '@shared/timeline/clips'
import { mediaUrl } from '../media/mediaUrl'
import { runProcess } from '../media/processRunner'
import { readProjectFile, writeProjectFile } from './projectIO'
import type { RecentStore } from './recent'

export interface LibraryOptions {
  /** Thư mục dự án mặc định (Tài liệu\Cutcap Projects). */
  projectsDir: string
  /** Thư mục cache ảnh thu nhỏ dự án. */
  thumbsDir: string
  recent: RecentStore
  /** Đường dẫn ffmpeg.exe; null = không tạo ảnh thu nhỏ. */
  ffmpegExe: string | null
}

const EXT = `.${PROJECT_FILE_EXTENSION}`

/** Tên file hợp lệ trên Windows. */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Cutcap'
}

/** Tên dự án mặc định theo ngày, giống CapCut: ngày 17/10 → "1017". */
export function defaultProjectName(now: Date): string {
  return `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
}

export class ProjectLibrary {
  constructor(private readonly options: LibraryOptions) {}

  /** Đường dẫn file chưa có trong thư mục: "1017.cutcap", "1017 (2).cutcap", … */
  private freePath(folder: string, name: string): { path: string; name: string } {
    const base = safeFileName(name)
    for (let i = 1; ; i++) {
      const candidate = i === 1 ? base : `${base} (${i})`
      const path = join(folder, candidate + EXT)
      if (!existsSync(path)) return { path, name: candidate }
    }
  }

  /** Tạo dự án mới (ghi file ngay) trong thư mục dự án mặc định. */
  async create(now = new Date()): Promise<{ filePath: string; project: Project }> {
    await mkdir(this.options.projectsDir, { recursive: true })
    const { path, name } = this.freePath(this.options.projectsDir, defaultProjectName(now))
    const project = createEmptyProject(name, now)
    await writeProjectFile(path, project)
    await this.options.recent.add(path, name)
    return { filePath: path, project }
  }

  /** Danh sách dự án, mới sửa nhất trước. File hỏng / không đọc được bị bỏ qua. */
  async list(): Promise<ProjectSummary[]> {
    const paths: string[] = []
    try {
      for (const name of await readdir(this.options.projectsDir)) {
        if (name.toLowerCase().endsWith(EXT)) paths.push(join(this.options.projectsDir, name))
      }
    } catch {
      // thư mục chưa tồn tại (chưa tạo dự án nào)
    }
    for (const r of await this.options.recent.list()) {
      if (!paths.some((p) => samePath(p, r.path))) paths.push(r.path)
    }

    const summaries = await Promise.all(paths.map((p) => this.summarize(p).catch(() => null)))
    return summaries
      .filter((s): s is ProjectSummary => s !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  private async summarize(filePath: string): Promise<ProjectSummary> {
    const [project, fileStat] = await Promise.all([readProjectFile(filePath), stat(filePath)])
    const assets = Object.values(project.assets)
    const sizes = await Promise.all(assets.map((a) => stat(a.path).then((s) => s.size).catch(() => null)))
    return {
      path: filePath,
      id: project.id,
      name: project.name || basename(filePath, EXT),
      // Lấy mốc mới hơn giữa updatedAt trong file và thời gian sửa file
      updatedAt: [project.updatedAt, fileStat.mtime.toISOString()].sort().at(-1)!,
      durationUs: projectDuration(project),
      mediaBytes: sizes.reduce<number>((sum, s) => sum + (s ?? 0), 0),
      missingMedia: sizes.filter((s) => s === null).length,
      thumbnailUrl: await this.thumbnail(project).catch(() => null)
    }
  }

  /** Clip hình xuất hiện sớm nhất (trên track không ẩn) – dùng làm ảnh đại diện. */
  private coverClip(project: Project): { clip: MediaClip; path: string; image: boolean } | null {
    let best: { clip: MediaClip; path: string; image: boolean } | null = null
    for (const track of project.tracks) {
      if (track.hidden || track.kind === 'audio') continue
      for (const clip of track.clips) {
        if (clip.type !== 'media') continue
        const asset = project.assets[clip.assetId]
        if (!asset || asset.kind === 'audio' || !existsSync(asset.path)) continue
        if (!best || clip.start < best.clip.start) best = { clip, path: asset.path, image: asset.kind === 'image' }
      }
    }
    return best
  }

  private async thumbnail(project: Project): Promise<string | null> {
    if (!this.options.ffmpegExe) return null
    const cover = this.coverClip(project)
    if (!cover) return null
    // Tên cache đổi khi dự án được sửa hoặc đổi clip đầu → ảnh luôn mới
    const key = createHash('sha1')
      .update(`${project.id}|${project.updatedAt}|${cover.path}|${cover.clip.sourceIn}`)
      .digest('hex')
      .slice(0, 20)
    const file = join(this.options.thumbsDir, `${key}.jpg`)
    if (!existsSync(file)) {
      await mkdir(this.options.thumbsDir, { recursive: true })
      // Lấy khung hình sau điểm bắt đầu clip 0,5 giây (tránh khung đen đầu cảnh)
      const seek = cover.image ? [] : ['-ss', ((cover.clip.sourceIn + 500_000 * cover.clip.speed) / 1e6).toFixed(3)]
      await runProcess(this.options.ffmpegExe, [
        '-hide_banner', '-loglevel', 'error', '-y',
        ...seek, '-i', cover.path,
        '-frames:v', '1', '-vf', 'scale=-2:240:flags=bicubic', '-q:v', '4',
        `${file}.part.jpg`
      ])
      await rename(`${file}.part.jpg`, file)
    }
    return mediaUrl(file)
  }

  /** Đổi tên dự án (tên hiển thị trong file; giữ nguyên tên file). */
  async rename(filePath: string, name: string): Promise<void> {
    const project = await readProjectFile(filePath)
    project.name = name.trim()
    project.updatedAt = new Date().toISOString()
    await writeProjectFile(filePath, project)
    await this.options.recent.add(filePath, project.name)
  }

  /** Nhân bản dự án ngay cạnh file gốc, với id mới (để tự động lưu không lẫn với bản gốc). */
  async duplicate(filePath: string, copySuffix: string): Promise<string> {
    const project = await readProjectFile(filePath)
    const target = this.freePath(dirname(filePath), `${project.name || basename(filePath, EXT)} ${copySuffix}`)
    const now = new Date().toISOString()
    await writeProjectFile(target.path, { ...project, id: createId(), name: target.name, createdAt: now, updatedAt: now })
    await this.options.recent.add(target.path, target.name)
    return target.path
  }
}
