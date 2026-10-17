// Các lệnh làm việc với file: Mới, Mở, Lưu, Lưu thành, và xử lý khi đóng cửa sổ.
import i18n from '../i18n'
import { createEmptyProject } from '@shared/project/factory'
import { editorStore } from './editorStore'
import { projectStore, selectIsDirty } from './projectStore'

/** Tránh mở 2 hộp thoại cùng lúc khi người dùng bấm phím tắt liên tục. */
let busy = false
async function exclusive<T>(task: () => Promise<T>): Promise<T | undefined> {
  if (busy) return undefined
  busy = true
  try {
    return await task()
  } finally {
    busy = false
  }
}

/** Đưa đầu phát về 0 và bỏ chọn khi chuyển sang dự án khác. */
function resetEditor(): void {
  editorStore.getState().setCurrentTime(0)
  editorStore.getState().clearSelection()
}

/** Ghi dự án ra file. @returns true nếu lưu thành công. */
async function doSave(saveAs: boolean): Promise<boolean> {
  const { project, filePath, markSaved } = projectStore.getState()
  const result = await window.cutcap.saveProject({ project, filePath, saveAs })
  if (!result) return false
  markSaved(result.filePath, result.savedAt)
  return true
}

/**
 * Nếu có thay đổi chưa lưu thì hỏi người dùng.
 * @returns true nếu được phép tiếp tục (đã lưu, hoặc chọn "Không lưu").
 */
async function confirmDiscard(): Promise<boolean> {
  const state = projectStore.getState()
  if (!selectIsDirty(state)) return true
  const choice = await window.cutcap.askUnsavedChanges(state.project.name || i18n.t('project.untitled'))
  if (choice === 'cancel') return false
  if (choice === 'save') return doSave(false)
  // Người dùng chủ động bỏ thay đổi → bản tự động lưu không cần nữa (không hỏi khôi phục lần sau)
  await window.cutcap.autosaveClear(state.project.id)
  return true
}

export function newProject(): Promise<void | undefined> {
  return exclusive(async () => {
    if (!(await confirmDiscard())) return
    projectStore.getState().load(createEmptyProject(''), null)
    resetEditor()
  })
}

export function openProject(): Promise<void | undefined> {
  return exclusive(async () => {
    if (!(await confirmDiscard())) return
    const result = await window.cutcap.openProject()
    if (result) {
      projectStore.getState().load(result.project, result.filePath)
      resetEditor()
    }
  })
}

/** Mở dự án theo đường dẫn (dự án gần đây, bấm đúp file .cutcap). */
export function openProjectPath(path: string): Promise<void | undefined> {
  return exclusive(async () => {
    if (!(await confirmDiscard())) return
    const result = await window.cutcap.openProjectPath(path)
    if (result) {
      projectStore.getState().load(result.project, result.filePath)
      resetEditor()
    }
  })
}

/** Khôi phục bản tự động lưu (sau khi app bị tắt ngang). Dự án được đánh dấu "chưa lưu". */
export function recoverProject(projectId: string): Promise<void | undefined> {
  return exclusive(async () => {
    const { project, filePath } = await window.cutcap.autosaveLoad(projectId)
    projectStore.getState().load(project, filePath, { dirty: true })
    resetEditor()
  })
}

export function saveProject(saveAs = false): Promise<boolean | undefined> {
  return exclusive(() => doSave(saveAs))
}

/** Main process báo người dùng bấm nút X mà còn thay đổi chưa lưu. */
export function handleCloseRequest(): Promise<void | undefined> {
  return exclusive(async () => {
    if (await confirmDiscard()) window.cutcap.closeWindow()
  })
}
