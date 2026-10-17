import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import { createProjectStore, selectIsDirty } from '../src/renderer/src/state/projectStore'

function setup() {
  return createProjectStore(createEmptyProject('Test'))
}

describe('projectStore', () => {
  it('dự án mới chưa sửa gì thì không "dirty"', () => {
    expect(selectIsDirty(setup().getState())).toBe(false)
  })

  it('sửa → dirty; lưu → hết dirty; undo về trước lúc lưu → dirty lại; redo → sạch', () => {
    const store = setup()
    const s = () => store.getState()

    s().apply('history.addTrack', (d) => void ops.addTrack(d, 'audio'))
    expect(selectIsDirty(s())).toBe(true)

    s().markSaved('C:\\test.cutcap', '2026-01-01T00:00:00.000Z')
    expect(selectIsDirty(s())).toBe(false)
    expect(s().filePath).toBe('C:\\test.cutcap')

    s().undo()
    expect(selectIsDirty(s())).toBe(true)
    expect(s().project.tracks).toHaveLength(1)

    s().redo()
    expect(selectIsDirty(s())).toBe(false)
    expect(s().project.tracks).toHaveLength(2)
  })

  it('không gộp thao tác vào bước đã lưu', () => {
    const store = setup()
    const s = () => store.getState()
    s().apply('history.renameProject', (d) => ops.renameProject(d, 'A'), { coalesceKey: 'name' })
    s().markSaved('x.cutcap', '2026-01-01T00:00:00.000Z')
    s().apply('history.renameProject', (d) => ops.renameProject(d, 'B'), { coalesceKey: 'name' })
    expect(s().history.past).toHaveLength(2)
    expect(selectIsDirty(s())).toBe(true)
  })

  it('load() thay dự án và xóa lịch sử', () => {
    const store = setup()
    store.getState().apply('history.addTrack', (d) => void ops.addTrack(d, 'text'))
    const other = createEmptyProject('Khác')
    store.getState().load(other, 'D:\\khac.cutcap')
    expect(store.getState().project).toBe(other)
    expect(store.getState().history.past).toHaveLength(0)
    expect(selectIsDirty(store.getState())).toBe(false)
  })

  it('track mới: video/chữ lên trên cùng, âm thanh xuống dưới cùng', () => {
    const store = setup()
    const s = () => store.getState()
    s().apply('a', (d) => void ops.addTrack(d, 'audio'))
    s().apply('t', (d) => void ops.addTrack(d, 'text'))
    expect(s().project.tracks.map((t) => t.kind)).toEqual(['text', 'video', 'audio'])
  })
})
