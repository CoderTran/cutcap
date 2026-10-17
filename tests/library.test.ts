import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset } from '@shared/project/schema'
import { createMediaClip } from '@shared/timeline/clips'
import { filePathFromMediaUrl } from '../src/main/media/mediaUrl'
import { ProjectLibrary, defaultProjectName } from '../src/main/project/library'
import { readProjectFile, writeProjectFile } from '../src/main/project/projectIO'
import { RecentStore } from '../src/main/project/recent'

const ffmpeg = join(__dirname, '..', 'resources', 'ffmpeg', 'ffmpeg.exe')
let dir: string
let library: ProjectLibrary
let recent: RecentStore
const projectsDir = (): string => join(dir, 'Cutcap Projects')

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cutcap-lib-'))
  recent = new RecentStore(join(dir, 'recent.json'))
  library = new ProjectLibrary({
    projectsDir: projectsDir(),
    thumbsDir: join(dir, 'thumbs'),
    recent,
    ffmpegExe: existsSync(ffmpeg) ? ffmpeg : null
  })
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('thư viện dự án', () => {
  it('tên mặc định theo ngày giống CapCut', () => {
    expect(defaultProjectName(new Date(2026, 9, 17))).toBe('1017')
    expect(defaultProjectName(new Date(2026, 0, 5))).toBe('0105')
  })

  it('tạo dự án: ghi file ngay, không trùng tên', async () => {
    const day = new Date(2026, 9, 17)
    const a = await library.create(day)
    const b = await library.create(day)
    expect(a.filePath.endsWith('1017.cutcap')).toBe(true)
    expect(b.filePath.endsWith('1017 (2).cutcap')).toBe(true)
    expect(b.project.name).toBe('1017 (2)')
    expect((await readProjectFile(a.filePath)).id).toBe(a.project.id)
  })

  it('danh sách gồm thư mục mặc định + dự án mở ở nơi khác; mới sửa trước; bỏ qua file hỏng', async () => {
    const created = await library.create(new Date(2026, 9, 17))
    // Dự án ở chỗ khác (đã mở gần đây)
    const otherDir = join(dir, 'ổ khác')
    await mkdir(otherDir)
    const other = join(otherDir, 'Phim cưới.cutcap')
    await writeProjectFile(other, createEmptyProject('Phim cưới'))
    await recent.add(other, 'Phim cưới')
    // File hỏng trong thư mục mặc định
    await writeFile(join(projectsDir(), 'hỏng.cutcap'), '{ không phải json')
    // Dự án tạo trước bị coi là cũ hơn
    await utimes(created.filePath, new Date(2020, 0, 1), new Date(2020, 0, 1))

    const list = await library.list()
    expect(list.map((p) => p.name)).toEqual(['Phim cưới', '1017'])
    expect(list[0]).toMatchObject({ durationUs: 0, mediaBytes: 0, missingMedia: 0, thumbnailUrl: null })
  })

  it('đổi tên và nhân bản (bản sao có id mới)', async () => {
    const { filePath, project } = await library.create(new Date(2026, 9, 17))
    await library.rename(filePath, 'Du lịch Đà Lạt')
    expect((await readProjectFile(filePath)).name).toBe('Du lịch Đà Lạt')

    const copy = await library.duplicate(filePath, '(bản sao)')
    const copied = await readProjectFile(copy)
    expect(copied.name).toBe('Du lịch Đà Lạt (bản sao)')
    expect(copied.id).not.toBe(project.id)
    expect((await library.list()).length).toBe(2)
  })

  it.skipIf(!existsSync(ffmpeg))('dung lượng media, file thiếu, ảnh thu nhỏ từ clip hình đầu tiên', async () => {
    const video = join(dir, 'clip.mp4')
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30',
      '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video])
    const { filePath } = await library.create(new Date(2026, 9, 17))
    const project = await readProjectFile(filePath)
    const asset = (id: string, path: string): MediaAsset => ({ id, kind: 'video', path, name: id, durationUs: 2_000_000, width: 320, height: 180, fps: 30, hasAudio: false })
    project.assets.v = asset('v', video)
    project.assets.m = asset('m', join(dir, 'mất.mp4'))
    ops.addClip(project, project.tracks[0].id, { ...createMediaClip(project.assets.v, 0), duration: 2_000_000 })
    await writeProjectFile(filePath, project)

    const [summary] = await library.list()
    expect(summary.durationUs).toBe(2_000_000)
    expect(summary.mediaBytes).toBeGreaterThan(0)
    expect(summary.missingMedia).toBe(1)
    expect(existsSync(filePathFromMediaUrl(summary.thumbnailUrl!)!)).toBe(true)
  }, 30_000)
})
