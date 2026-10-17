// Các lệnh chỉnh sửa mà giao diện gọi. Mỗi lệnh = 1 bước Undo, có nhãn để hiện tooltip.
// Logic sửa dữ liệu thật sự nằm ở @shared/project/ops (hàm thuần, dễ test).
import * as ops from '@shared/project/ops'
import type { Id, ProjectSettings } from '@shared/project/schema'
import { projectStore } from './projectStore'

const apply = (...args: Parameters<ReturnType<typeof projectStore.getState>['apply']>): void =>
  projectStore.getState().apply(...args)

export function renameProject(name: string): void {
  apply('history.renameProject', (d) => ops.renameProject(d, name))
}

export function updateSettings(changes: Partial<ProjectSettings>): void {
  apply('history.changeSettings', (d) => ops.updateSettings(d, changes))
}

export function removeTrack(trackId: Id): void {
  apply('history.removeTrack', (d) => ops.removeTrack(d, trackId))
}

export function toggleTrackFlag(trackId: Id, flag: 'muted' | 'hidden' | 'locked'): void {
  const track = projectStore.getState().project.tracks.find((t) => t.id === trackId)
  if (!track) return
  apply(`history.track.${flag}`, (d) => ops.setTrackFlag(d, trackId, flag, !track[flag]))
}

export function undo(): void {
  projectStore.getState().undo()
}

export function redo(): void {
  projectStore.getState().redo()
}
