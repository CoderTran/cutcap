// Tự động lưu & khôi phục sau sự cố.
//
// Bản tự động lưu nằm RIÊNG trong %APPDATA%\Cutcap\autosave\ – không bao giờ ghi đè file .cutcap
// của người dùng. Bản này bị xóa khi người dùng Lưu thành công hoặc chủ động chọn "Không lưu".
// → Lúc mở app mà còn bản tự động lưu = lần trước app bị tắt ngang (mất điện, crash…) → hỏi khôi phục.
//
// Không import electron → test được.
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { parseProject, serializeProject } from '@shared/project/migrate'
import type { Project } from '@shared/project/schema'
import { writeTextAtomic } from './projectIO'

export interface AutosaveEntry {
  projectId: string
  name: string
  /** Thời điểm tự động lưu (ISO). */
  savedAt: string
  /** File .cutcap gốc của dự án (null = dự án chưa từng được lưu). */
  filePath: string | null
}

interface AutosaveFile extends AutosaveEntry {
  format: 'cutcap-autosave'
  project: unknown
}

const SUFFIX = '.autosave.json'

export class AutosaveStore {
  constructor(private readonly dir: string) {}

  /** id dự án là UUID; lọc ký tự cho chắc chắn không thoát ra ngoài thư mục. */
  private fileFor(projectId: string): string {
    return join(this.dir, `${projectId.replace(/[^a-zA-Z0-9-]/g, '_')}${SUFFIX}`)
  }

  async write(project: Project, filePath: string | null): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const data: AutosaveFile = {
      format: 'cutcap-autosave',
      projectId: project.id,
      name: project.name,
      savedAt: new Date().toISOString(),
      filePath,
      project: JSON.parse(serializeProject(project))
    }
    await writeTextAtomic(this.fileFor(project.id), JSON.stringify(data))
  }

  async clear(projectId: string): Promise<void> {
    await rm(this.fileFor(projectId), { force: true })
  }

  /** Các bản tự động lưu còn lại (mới nhất trước). File hỏng bị bỏ qua. */
  async list(): Promise<AutosaveEntry[]> {
    let names: string[]
    try {
      names = (await readdir(this.dir)).filter((n) => n.endsWith(SUFFIX))
    } catch {
      return [] // thư mục chưa tồn tại
    }
    const entries: AutosaveEntry[] = []
    for (const name of names) {
      try {
        const data = JSON.parse(await readFile(join(this.dir, name), 'utf8')) as AutosaveFile
        if (data.format !== 'cutcap-autosave') continue
        entries.push({ projectId: data.projectId, name: data.name, savedAt: data.savedAt, filePath: data.filePath })
      } catch {
        // file hỏng (vd. mất điện đúng lúc ghi) – bỏ qua
      }
    }
    return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  async load(projectId: string): Promise<{ project: Project; filePath: string | null }> {
    const data = JSON.parse(await readFile(this.fileFor(projectId), 'utf8')) as AutosaveFile
    return { project: parseProject(data.project), filePath: data.filePath }
  }
}
