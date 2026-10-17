// Xử lý IPC liên quan tới dự án: mở, lưu, hỏi lưu thay đổi.
import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IpcChannels,
  type OpenProjectResult,
  type SaveProjectRequest,
  type SaveProjectResult,
  type UnsavedChoice
} from '@shared/ipc'
import { ProjectFormatError } from '@shared/project/migrate'
import { PROJECT_FILE_EXTENSION, type Project } from '@shared/project/schema'
import { AutosaveStore } from '../project/autosave'
import { readProjectFile, writeProjectFile } from '../project/projectIO'
import { RecentStore } from '../project/recent'
import { strings } from '../strings'

const projectFilters = [{ name: strings.fileFilterProject, extensions: [PROJECT_FILE_EXTENSION] }]

// Tạo khi app sẵn sàng (app.getPath chỉ dùng được sau đó)
let recent: RecentStore
let autosave: AutosaveStore

/** Cửa sổ đã gửi yêu cầu – để hộp thoại hiện đúng phía trên cửa sổ đó. */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined
}

/** Đổi lỗi kỹ thuật thành câu dễ hiểu cho người dùng. */
function describeError(err: unknown): string {
  if (err instanceof ProjectFormatError) return strings.formatError[err.code]
  const e = err as NodeJS.ErrnoException
  return e?.message ?? String(err)
}

/** Tên file hợp lệ trên Windows: bỏ các ký tự cấm \ / : * ? " < > | */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return cleaned || strings.untitled
}

async function openProject(event: IpcMainInvokeEvent): Promise<OpenProjectResult | null> {
  const win = senderWindow(event)
  const options = { title: strings.openTitle, filters: projectFilters, properties: ['openFile' as const] }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null

  return openPath(result.filePaths[0])
}

/** Đọc dự án theo đường dẫn; lỗi thì báo bằng hộp thoại và trả về null. */
async function openPath(filePath: string): Promise<OpenProjectResult | null> {
  try {
    const project = await readProjectFile(filePath)
    await recent.add(filePath, project.name || basename(filePath))
    return { filePath, project }
  } catch (err) {
    dialog.showErrorBox(strings.openErrorTitle, `${basename(filePath)}\n\n${describeError(err)}`)
    // File không mở được nữa → bỏ khỏi danh sách gần đây
    await recent.remove(filePath)
    return null
  }
}

async function saveProject(
  event: IpcMainInvokeEvent,
  request: SaveProjectRequest
): Promise<SaveProjectResult | null> {
  let filePath = request.saveAs ? null : request.filePath

  // Chưa có đường dẫn → hỏi người dùng muốn lưu ở đâu
  if (!filePath) {
    const win = senderWindow(event)
    const options = {
      title: strings.saveTitle,
      filters: projectFilters,
      defaultPath: request.filePath ?? `${safeFileName(request.project.name)}.${PROJECT_FILE_EXTENSION}`
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    filePath = result.filePath
  }

  const savedAt = new Date().toISOString()
  try {
    await writeProjectFile(filePath, { ...request.project, updatedAt: savedAt })
    await recent.add(filePath, request.project.name || basename(filePath))
    return { filePath, savedAt }
  } catch (err) {
    dialog.showErrorBox(strings.saveErrorTitle, `${filePath}\n\n${describeError(err)}`)
    return null
  }
}

async function askUnsavedChanges(event: IpcMainInvokeEvent, projectName: string): Promise<UnsavedChoice> {
  const options = {
    type: 'warning' as const,
    title: strings.unsavedTitle,
    message: strings.unsavedMessage(projectName || strings.untitled),
    detail: strings.unsavedDetail,
    buttons: [strings.btnSave, strings.btnDiscard, strings.btnCancel],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  }
  const win = senderWindow(event)
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  return (['save', 'discard', 'cancel'] as const)[response] ?? 'cancel'
}

export function registerProjectHandlers(): void {
  recent = new RecentStore(join(app.getPath('userData'), 'recent.json'))
  autosave = new AutosaveStore(join(app.getPath('userData'), 'autosave'))

  ipcMain.handle(IpcChannels.openProject, openProject)
  ipcMain.handle(IpcChannels.openProjectPath, (_e, path: string) => openPath(path))
  ipcMain.handle(IpcChannels.recentList, () => recent.list())
  ipcMain.handle(IpcChannels.recentRemove, (_e, path: string) => recent.remove(path))
  ipcMain.handle(IpcChannels.autosaveWrite, (_e, project: Project, filePath: string | null) => autosave.write(project, filePath))
  ipcMain.handle(IpcChannels.autosaveClear, (_e, projectId: string) => autosave.clear(projectId))
  ipcMain.handle(IpcChannels.autosaveList, () => autosave.list())
  ipcMain.handle(IpcChannels.autosaveLoad, (_e, projectId: string) => autosave.load(projectId))
  ipcMain.handle(IpcChannels.saveProject, saveProject)
  ipcMain.handle(IpcChannels.askUnsavedChanges, askUnsavedChanges)
}
