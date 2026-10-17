import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import { createTextClip } from '@shared/timeline/clips'
import { deleteClips } from '@shared/timeline/edit'
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

    s().apply('history.renameProject', (d) => ops.renameProject(d, 'Mới'))
    expect(selectIsDirty(s())).toBe(true)

    s().markSaved('C:\\test.cutcap', '2026-01-01T00:00:00.000Z')
    expect(selectIsDirty(s())).toBe(false)
    expect(s().filePath).toBe('C:\\test.cutcap')

    s().undo()
    expect(selectIsDirty(s())).toBe(true)
    expect(s().project.name).toBe('Test')

    s().redo()
    expect(selectIsDirty(s())).toBe(false)
    expect(s().project.name).toBe('Mới')
  })

  it('track hết clip thì tự biến mất (giữ track video chính); Undo trả lại cả track', () => {
    const store = setup()
    const s = () => store.getState()
    const text = createTextClip(0, 'Xin chào')
    s().apply('add', (d) => ops.addClip(d, ops.addTrack(d, 'text'), text))
    expect(s().project.tracks.map((t) => t.kind)).toEqual(['text', 'video'])

    s().apply('del', (d) => deleteClips(d, [text.id]))
    expect(s().project.tracks.map((t) => t.kind)).toEqual(['video']) // "Chữ 1" mất theo, "Video 1" (chính) ở lại

    s().undo()
    expect(s().project.tracks.map((t) => t.kind)).toEqual(['text', 'video'])
    expect(s().project.tracks[0].clips).toHaveLength(1)
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
    const project = createEmptyProject('Test')
    ops.addTrack(project, 'audio')
    ops.addTrack(project, 'text')
    expect(project.tracks.map((t) => t.kind)).toEqual(['text', 'video', 'audio'])
  })

  it('dọn track trống: chỉ giữ track video dưới cùng', () => {
    const project = createEmptyProject('Test')
    ops.addTrack(project, 'video')
    ops.addTrack(project, 'audio')
    const mainId = project.tracks[1].id // track video có sẵn, giờ nằm dưới track video mới
    ops.pruneEmptyTracks(project)
    expect(project.tracks.map((t) => t.id)).toEqual([mainId])
  })
})
