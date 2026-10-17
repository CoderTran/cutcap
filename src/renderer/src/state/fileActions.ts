// Các lệnh làm việc với dự án: Tạo, Mở, Lưu, Lưu thành, quay về Trang chủ, xử lý khi đóng cửa sổ.
import i18n from '../i18n'
import { createEmptyProject } from '@shared/project/factory'
import type { Project } from '@shared/project/schema'
import { appStore } from './appStore'
import { editorStore } from './editorStore'
import { pause } from './playbackActions'
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

/** Nạp dự án vào trình chỉnh sửa và chuyển sang màn hình chỉnh sửa. */
function enterEditor(result: { project: Project; filePath: string | null }, options?: { dirty?: boolean }): void {
  projectStore.getState().load(result.project, result.filePath, options)
  resetEditor()
  appStore.getState().setView('editor')
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

/**
 * Trước khi rời dự án đang mở (về Trang chủ, mở dự án khác):
 *  - dự án đã có file → tự lưu luôn, không hỏi (giống CapCut)
 *  - dự án chưa có file (vd. khôi phục từ bản chưa từng lưu) → hỏi Lưu / Không lưu / Hủy
 * @returns true nếu được phép rời đi
 */
async function leaveCurrentProject(): Promise<boolean> {
  const state = projectStore.getState()
  if (appStore.getState().view !== 'editor' || !selectIsDirty(state)) return true
  if (state.filePath) return doSave(false)
  return confirmDiscard()
}

/** Tạo dự án mới (file được tạo ngay trong Tài liệu\Cutcap Projects) rồi mở trình chỉnh sửa. */
export function newProject(): Promise<void | undefined> {
  return exclusive(async () => {
    if (!(await leaveCurrentProject())) return
    enterEditor(await window.cutcap.libraryCreate())
  })
}

/** Mở dự án bằng hộp thoại chọn file. */
export function openProject(): Promise<void | undefined> {
  return exclusive(async () => {
    if (!(await leaveCurrentProject())) return
    const result = await window.cutcap.openProject()
    if (result) enterEditor(result)
  })
}

/** Mở dự án theo đường dẫn (Trang chủ, bấm đúp file .cutcap). */
export function openProjectPath(path: string): Promise<void | undefined> {
  return exclusive(async () => {
    if (!(await leaveCurrentProject())) return
    const result = await window.cutcap.openProjectPath(path)
    if (result) enterEditor(result)
  })
}

/** Khôi phục bản tự động lưu (sau khi app bị tắt ngang). Dự án được đánh dấu "chưa lưu". */
export function recoverProject(projectId: string): Promise<void | undefined> {
  return exclusive(async () => {
    if (!(await leaveCurrentProject())) return
    enterEditor(await window.cutcap.autosaveLoad(projectId), { dirty: true })
  })
}

/** Về Trang chủ: tự lưu dự án (nếu đã có file), rồi đóng trình chỉnh sửa. */
export function goHome(): Promise<void | undefined> {
  return exclusive(async () => {
    pause()
    if (!(await leaveCurrentProject())) return
    // Nạp dự án trống để giải phóng bộ nhớ (video, âm thanh) của dự án vừa đóng
    projectStore.getState().load(createEmptyProject(''), null)
    resetEditor()
    appStore.getState().setView('home')
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
