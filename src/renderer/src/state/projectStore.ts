// Kho dữ liệu (store) của dự án đang mở – nơi DUY NHẤT giữ Project trong giao diện.
//
// Cách dùng trong component:
//   const name = useProjectStore((s) => s.project.name)          // đọc (tự render lại khi đổi)
//   projectStore.getState().apply('history.rename', (d) => {...}) // sửa (có Undo)
//
// Mọi thay đổi dữ liệu dự án PHẢI đi qua apply() để được ghi vào lịch sử Undo/Redo.
import type { Draft } from 'immer'
import { createStore, useStore } from 'zustand'
import { createEmptyProject } from '@shared/project/factory'
import type { Project } from '@shared/project/schema'
import {
  commit,
  currentEntryId,
  emptyHistory,
  redo as redoHistory,
  undo as undoHistory,
  type CommitOptions,
  type History
} from './history'

export interface ProjectState {
  project: Project
  /** Đường dẫn file .cutcap; null = chưa lưu lần nào. */
  filePath: string | null
  history: History
  /** id bước lịch sử tại thời điểm lưu gần nhất (null = trạng thái ban đầu). */
  savedEntryId: number | null
  /** Lần lưu file gần nhất (ISO) – hiện "Tự động lưu: 08:33:34" trên thanh tiêu đề. */
  lastSavedAt: string | null

  /** Sửa dự án và ghi lại để Undo. `label` là khóa i18n mô tả thao tác. */
  apply(label: string, recipe: (draft: Draft<Project>) => void, options?: Pick<CommitOptions, 'coalesceKey' | 'coalesceWindowMs'>): void
  undo(): void
  redo(): void
  /**
   * Thay toàn bộ dự án (Mới / Mở / Khôi phục). Xóa lịch sử Undo.
   * @param options.dirty true = coi như có thay đổi chưa lưu (dự án khôi phục sau sự cố)
   */
  load(project: Project, filePath: string | null, options?: { dirty?: boolean }): void
  /**
   * Đánh dấu đã lưu xuống file thành công.
   * @param savedEntryId bước lịch sử ứng với nội dung ĐÃ GHI (lấy lúc bắt đầu lưu). Nếu người dùng
   *        sửa tiếp trong lúc đang lưu, những sửa đổi đó vẫn được tính là "chưa lưu".
   */
  markSaved(filePath: string, savedAt: string, savedEntryId?: number | null): void
}

export function createProjectStore(initial: Project = createEmptyProject('')) {
  return createStore<ProjectState>()((set, get) => ({
    project: initial,
    filePath: null,
    history: emptyHistory(),
    savedEntryId: null,
    lastSavedAt: null,

    apply(label, recipe, options) {
      const { project, history, savedEntryId } = get()
      const result = commit(project, history, label, recipe, { ...options, protectedId: savedEntryId })
      if (result.state !== project) set({ project: result.state, history: result.history })
    },

    undo() {
      const { project, history } = get()
      const result = undoHistory(project, history)
      if (result) set({ project: result.state, history: result.history })
    },

    redo() {
      const { project, history } = get()
      const result = redoHistory(project, history)
      if (result) set({ project: result.state, history: result.history })
    },

    load(project, filePath, options) {
      // savedEntryId = -1: không bước lịch sử nào có id này → luôn "chưa lưu" cho tới khi bấm Lưu
      set({
        project,
        filePath,
        history: emptyHistory(),
        savedEntryId: options?.dirty ? -1 : null,
        lastSavedAt: filePath && !options?.dirty ? project.updatedAt : null
      })
    },

    markSaved(filePath, savedAt, savedEntryId) {
      const { project, history } = get()
      set({
        filePath,
        // Cập nhật updatedAt nhưng KHÔNG ghi vào lịch sử (lưu file không phải thao tác chỉnh sửa)
        project: { ...project, updatedAt: savedAt },
        savedEntryId: savedEntryId === undefined ? currentEntryId(history) : savedEntryId,
        lastSavedAt: savedAt
      })
    }
  }))
}

export type ProjectStore = ReturnType<typeof createProjectStore>

// ───────── Bộ chọn (selector) dùng chung ─────────

/** Có thay đổi so với lần lưu gần nhất không. */
export function selectIsDirty(s: ProjectState): boolean {
  return currentEntryId(s.history) !== s.savedEntryId
}
export const selectCanUndo = (s: ProjectState): boolean => s.history.past.length > 0
export const selectCanRedo = (s: ProjectState): boolean => s.history.future.length > 0
export const selectUndoLabel = (s: ProjectState): string | null => s.history.past.at(-1)?.label ?? null
export const selectRedoLabel = (s: ProjectState): string | null => s.history.future[0]?.label ?? null

// ───────── Store dùng trong ứng dụng ─────────

/** Store duy nhất của ứng dụng. */
export const projectStore = createProjectStore()

/** Hook React: đọc một phần của store, component tự render lại khi phần đó đổi. */
export function useProjectStore<T>(selector: (s: ProjectState) => T): T {
  return useStore(projectStore, selector)
}
