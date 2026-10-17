import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { produce } from 'immer'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset } from '@shared/project/schema'
import { findInFolder } from '../src/main/media/relink'
import { AutosaveStore } from '../src/main/project/autosave'
import { RecentStore } from '../src/main/project/recent'
import { createProjectStore, selectIsDirty } from '../src/renderer/src/state/projectStore'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cutcap-rec-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('tự động lưu', () => {
  it('ghi, liệt kê, đọc lại, xóa', async () => {
    const store = new AutosaveStore(join(dir, 'autosave'))
    expect(await store.list()).toEqual([]) // thư mục chưa có
    const p = createEmptyProject('Phim cưới')
    await store.write(p, 'D:\\Phim\\cưới.cutcap')
    const [entry] = await store.list()
    expect(entry).toMatchObject({ projectId: p.id, name: 'Phim cưới', filePath: 'D:\\Phim\\cưới.cutcap' })
    expect((await store.load(p.id)).project).toEqual(p)
    await store.clear(p.id)
    expect(await store.list()).toEqual([])
  })

  it('bỏ qua file hỏng (mất điện đúng lúc ghi)', async () => {
    const store = new AutosaveStore(join(dir, 'autosave'))
    await store.write(createEmptyProject('Tốt'), null)
    await writeFile(join(dir, 'autosave', 'hong.autosave.json'), '{ hỏng')
    expect((await store.list()).map((e) => e.name)).toEqual(['Tốt'])
  })

  it('dự án khôi phục được đánh dấu "chưa lưu" cho tới khi bấm Lưu', () => {
    const store = createProjectStore()
    store.getState().load(createEmptyProject('Khôi phục'), 'D:\\a.cutcap', { dirty: true })
    expect(selectIsDirty(store.getState())).toBe(true)
    store.getState().markSaved('D:\\a.cutcap', new Date().toISOString())
    expect(selectIsDirty(store.getState())).toBe(false)
  })
})

describe('dự án gần đây', () => {
  it('mới nhất lên đầu, không trùng, bỏ file đã mất, tối đa 50', async () => {
    const recent = new RecentStore(join(dir, 'recent.json'))
    const files = await Promise.all(
      Array.from({ length: 52 }, async (_, i) => {
        const f = join(dir, `p${i}.cutcap`)
        await writeFile(f, '{}')
        return f
      })
    )
    for (const [i, f] of files.entries()) await recent.add(f, `Dự án ${i}`)
    await recent.add(files[5].toUpperCase(), 'Mở lại') // cùng file, khác hoa/thường
    const list = await recent.list()
    expect(list).toHaveLength(50)
    expect(list[0].name).toBe('Mở lại')
    expect(list.filter((r) => r.path.toLowerCase() === files[5].toLowerCase())).toHaveLength(1)

    await rm(files[51])
    expect((await recent.list()).some((r) => r.path === files[51])).toBe(false)
  })
})

describe('tìm lại file bị mất', () => {
  it('tìm theo tên trong thư mục mới', async () => {
    const folder = join(dir, 'ổ mới')
    await mkdir(folder)
    await writeFile(join(folder, 'biển.mp4'), '')
    await writeFile(join(folder, 'nhạc.mp3'), '')
    const found = findInFolder(folder, ['C:\\cũ\\biển.mp4', 'C:\\cũ\\nhạc.mp3', 'C:\\cũ\\không có.mov'])
    expect(found).toEqual({ 'C:\\cũ\\biển.mp4': join(folder, 'biển.mp4'), 'C:\\cũ\\nhạc.mp3': join(folder, 'nhạc.mp3') })
  })

  it('trỏ lại giữ nguyên id (clip vẫn dùng được); khác loại media thì từ chối', () => {
    const p = createEmptyProject('t')
    const asset: MediaAsset = { id: 'a', kind: 'video', path: 'C:\\cũ\\a.mp4', name: 'a.mp4', durationUs: 1, width: 1, height: 1, fps: 30, hasAudio: true }
    p.assets.a = asset
    const next = produce(p, (d) => {
      expect(ops.relinkAsset(d, 'a', { ...asset, id: 'mới', path: 'E:\\a.mp4', durationUs: 5 })).toBe(true)
      expect(ops.relinkAsset(d, 'a', { ...asset, kind: 'audio' })).toBe(false)
    })
    expect(next.assets.a).toMatchObject({ id: 'a', path: 'E:\\a.mp4', durationUs: 5 })
  })
})
