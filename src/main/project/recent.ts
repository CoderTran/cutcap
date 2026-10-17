// Danh sách dự án mở gần đây (tối đa 10), lưu trong %APPDATA%\Cutcap\recent.json.
// Không import electron → test được.
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { samePath } from '@shared/media/formats'
import type { RecentProject } from '@shared/ipc'
import { writeTextAtomic } from './projectIO'

const MAX_RECENT = 10

export class RecentStore {
  constructor(private readonly file: string) {}

  private async read(): Promise<RecentProject[]> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'))
      return Array.isArray(data) ? data.filter((r) => typeof r?.path === 'string') : []
    } catch {
      return []
    }
  }

  private async save(list: RecentProject[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await writeTextAtomic(this.file, JSON.stringify(list, null, 2))
  }

  /** Dự án gần đây, mới nhất trước. Bỏ qua file không còn tồn tại (đã xóa / ổ đĩa rút ra). */
  async list(): Promise<RecentProject[]> {
    return (await this.read()).filter((r) => existsSync(r.path))
  }

  /** Thêm / đưa lên đầu danh sách. */
  async add(path: string, name: string): Promise<void> {
    const list = (await this.read()).filter((r) => !samePath(r.path, path))
    list.unshift({ path, name, openedAt: new Date().toISOString() })
    await this.save(list.slice(0, MAX_RECENT))
  }

  async remove(path: string): Promise<void> {
    await this.save((await this.read()).filter((r) => !samePath(r.path, path)))
  }
}
