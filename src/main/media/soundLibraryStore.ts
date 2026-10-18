// Thư viện âm thanh của bạn: nhớ thư mục người dùng chọn, quét file âm thanh (cả thư mục con), bỏ bản sao,
// đo độ dài bằng ffprobe và chia nhóm (shared/audio/soundLibrary.ts). Kết quả lưu ra JSON → lần sau mở ngay,
// "Quét lại" chỉ đo lại những file mới / đã đổi.
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  classifySound,
  cleanSoundName,
  duplicateKey,
  isCopyName,
  uniqueNames,
  SOUND_LIBRARY_CATEGORIES,
  type SoundLibrary,
  type SoundLibraryItem
} from '@shared/audio/soundLibrary'
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, extensionOf } from '@shared/media/formats'
import { writeTextAtomic } from '../project/projectIO'
import type { ProbeInfo } from './probe'

/** Giới hạn khi quét (tránh lỡ chọn cả ổ đĩa). */
const MAX_DEPTH = 6
const MAX_FILES = 5000

const EXTENSIONS = new Set<string>([...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS])
const EMPTY: SoundLibrary = { folder: null, items: [], duplicates: 0, skipped: 0 }

export class SoundLibraryStore {
  constructor(
    private readonly file: string,
    private readonly probe: (path: string) => Promise<ProbeInfo>
  ) {}

  private async read(): Promise<SoundLibrary> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as Partial<SoundLibrary>
      if (typeof data.folder !== 'string' || !Array.isArray(data.items)) return EMPTY
      return { folder: data.folder, items: data.items.filter(isItem), duplicates: data.duplicates ?? 0, skipped: data.skipped ?? 0 }
    } catch {
      return EMPTY
    }
  }

  private async save(library: SoundLibrary): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await writeTextAtomic(this.file, JSON.stringify(library))
  }

  /** Thư viện đã lưu (bỏ những file không còn trên máy). */
  async get(): Promise<SoundLibrary> {
    const lib = await this.read()
    return { ...lib, items: lib.items.filter((i) => existsSync(i.path)) }
  }

  /** Chọn thư mục mới → quét. */
  async setFolder(folder: string): Promise<SoundLibrary> {
    const previous = await this.read()
    const lib = await scanFolder(folder, previous.items, this.probe)
    await this.save(lib)
    return lib
  }

  /** Quét lại thư mục đang dùng (file mới thêm / đã xóa). */
  async rescan(): Promise<SoundLibrary> {
    const previous = await this.read()
    return previous.folder ? this.setFolder(previous.folder) : EMPTY
  }

  async clear(): Promise<SoundLibrary> {
    await this.save(EMPTY)
    return EMPTY
  }
}

function isItem(v: unknown): v is SoundLibraryItem {
  const i = v as SoundLibraryItem
  return (
    typeof i?.path === 'string' &&
    typeof i.name === 'string' &&
    SOUND_LIBRARY_CATEGORIES.includes(i.category) &&
    typeof i.durationUs === 'number'
  )
}

/** Liệt kê file âm thanh / video trong thư mục (cả thư mục con). */
async function listFiles(folder: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return
      if (e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) await walk(full, depth + 1)
      else if (e.isFile() && EXTENSIONS.has(extensionOf(e.name))) out.push(full)
    }
  }
  await walk(folder, 0)
  return out
}

export async function scanFolder(
  folder: string,
  previous: SoundLibraryItem[],
  probe: (path: string) => Promise<ProbeInfo>
): Promise<SoundLibrary> {
  const files = await listFiles(folder)
  // Bản gốc trước bản sao "(1)" → khi bỏ trùng thì giữ bản gốc
  files.sort((a, b) => Number(isCopyName(basename(a))) - Number(isCopyName(basename(b))) || a.localeCompare(b))

  const seen = new Set<string>()
  let duplicates = 0
  const unique: { path: string; size: number; mtimeMs: number }[] = []
  for (const path of files) {
    let info
    try {
      info = await stat(path)
    } catch {
      continue
    }
    const key = duplicateKey(basename(path), info.size)
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    unique.push({ path, size: info.size, mtimeMs: info.mtimeMs })
  }

  const cached = new Map(previous.map((i) => [i.path, i]))
  let skipped = 0
  const items: SoundLibraryItem[] = []
  await forEachLimit(unique, 4, async (f) => {
    const old = cached.get(f.path)
    let durationUs: number
    let fromVideo: boolean
    if (old && old.size === f.size && old.mtimeMs === f.mtimeMs) {
      durationUs = old.durationUs
      fromVideo = old.fromVideo
    } else {
      try {
        const p = await probe(f.path)
        if (!p.hasAudio || p.durationUs <= 0) {
          skipped++
          return
        }
        durationUs = p.durationUs
        fromVideo = p.kind === 'video'
      } catch {
        skipped++
        return
      }
    }
    const name = cleanSoundName(basename(f.path))
    items.push({ ...f, name, durationUs, fromVideo, category: classifySound(`${name} ${basename(f.path)}`, durationUs) })
  })
  items.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  return { folder, items: uniqueNames(items), duplicates, skipped }
}

async function forEachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}
