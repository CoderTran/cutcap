// Preload: chạy trước giao diện, là "cửa" duy nhất nối giao diện với main process.
// Chỉ mở ra đúng những hàm đã khai báo trong CutcapApi – không lộ ipcRenderer ra ngoài.
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import {
  IpcChannels,
  type CaptionProgress,
  type CutcapApi,
  type ExportProgress,
  type ExportResult,
  type MediaPreview
} from '@shared/ipc'

/** Đăng ký nghe một kênh từ main; trả về hàm hủy đăng ký. */
function subscribe<T extends unknown[]>(channel: string, callback: (...args: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]): void => callback(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: CutcapApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),

  openProject: () => ipcRenderer.invoke(IpcChannels.openProject),
  saveProject: (request) => ipcRenderer.invoke(IpcChannels.saveProject, request),
  askUnsavedChanges: (projectName) => ipcRenderer.invoke(IpcChannels.askUnsavedChanges, projectName),

  setDirty: (dirty) => ipcRenderer.send(IpcChannels.setDirty, dirty),
  onCloseRequested: (callback) => subscribe(IpcChannels.closeRequested, callback),
  closeWindow: () => ipcRenderer.send(IpcChannels.closeWindow),

  pickMediaFiles: (only) => ipcRenderer.invoke(IpcChannels.pickMediaFiles, only),
  sfxSave: (id, wav) => ipcRenderer.invoke(IpcChannels.sfxSave, id, wav),
  favoritesGet: () => ipcRenderer.invoke(IpcChannels.favoritesGet),
  favoritesSave: (favorites) => ipcRenderer.invoke(IpcChannels.favoritesSave, favorites),
  sfxBundledDir: () => ipcRenderer.invoke(IpcChannels.sfxBundledDir),
  soundLibraryGet: () => ipcRenderer.invoke(IpcChannels.soundLibraryGet),
  soundLibraryPick: () => ipcRenderer.invoke(IpcChannels.soundLibraryPick),
  soundLibraryRescan: () => ipcRenderer.invoke(IpcChannels.soundLibraryRescan),
  soundLibraryClear: () => ipcRenderer.invoke(IpcChannels.soundLibraryClear),
  importMedia: (paths) => ipcRenderer.invoke(IpcChannels.importMedia, paths),
  extractAudio: (path, mode) => ipcRenderer.invoke(IpcChannels.extractAudio, path, mode),
  measureLoudness: (path, startUs, durationUs) => ipcRenderer.invoke(IpcChannels.measureLoudness, path, startUs, durationUs),
  prepareMedia: (path) => ipcRenderer.invoke(IpcChannels.prepareMedia, path),
  onMediaUpdated: (callback) => subscribe<[MediaPreview]>(IpcChannels.mediaUpdated, callback),
  // Từ Electron 32, File.path đã bị bỏ; phải dùng webUtils để lấy đường dẫn file kéo thả
  getPathForFile: (file) => webUtils.getPathForFile(file),

  detectEncoders: () => ipcRenderer.invoke(IpcChannels.exportDetectEncoders),
  chooseExportPath: (defaultName, currentPath) =>
    ipcRenderer.invoke(IpcChannels.exportChoosePath, defaultName, currentPath),
  startExport: (request) => ipcRenderer.invoke(IpcChannels.exportStart, request),
  cancelExport: () => ipcRenderer.send(IpcChannels.exportCancel),
  revealInFolder: (path) => ipcRenderer.send(IpcChannels.exportReveal, path),
  onExportProgress: (callback) => subscribe<[ExportProgress]>(IpcChannels.exportProgress, callback),
  onExportFinished: (callback) => subscribe<[ExportResult]>(IpcChannels.exportFinished, callback),

  listFonts: () => ipcRenderer.invoke(IpcChannels.listFonts),

  openProjectPath: (path) => ipcRenderer.invoke(IpcChannels.openProjectPath, path),
  onOpenRequested: (callback) => subscribe<[string]>(IpcChannels.openRequested, callback),
  autosaveWrite: (project, filePath) => ipcRenderer.invoke(IpcChannels.autosaveWrite, project, filePath),
  autosaveClear: (projectId) => ipcRenderer.invoke(IpcChannels.autosaveClear, projectId),
  autosaveList: () => ipcRenderer.invoke(IpcChannels.autosaveList),
  autosaveLoad: (projectId) => ipcRenderer.invoke(IpcChannels.autosaveLoad, projectId),
  recentList: () => ipcRenderer.invoke(IpcChannels.recentList),
  recentRemove: (path) => ipcRenderer.invoke(IpcChannels.recentRemove, path),
  relinkPick: (oldPath) => ipcRenderer.invoke(IpcChannels.relinkPick, oldPath),
  relinkFindInFolder: (folder, oldPaths) => ipcRenderer.invoke(IpcChannels.relinkFindInFolder, folder, oldPaths),
  generateCaptions: (project, language) => ipcRenderer.invoke(IpcChannels.captionsGenerate, project, language),
  cancelCaptions: () => ipcRenderer.send(IpcChannels.captionsCancel),
  onCaptionProgress: (callback) => subscribe<[CaptionProgress]>(IpcChannels.captionsProgress, callback),
  setPreviewQuality: (quality) => ipcRenderer.invoke(IpcChannels.setPreviewQuality, quality),
  beautyOpen: (request) => ipcRenderer.invoke(IpcChannels.beautyOpen, request),
  beautyRead: (id) => ipcRenderer.invoke(IpcChannels.beautyRead, id),
  beautyWrite: (id, frame) => ipcRenderer.invoke(IpcChannels.beautyWrite, id, frame),
  beautyClose: (id, ok) => ipcRenderer.invoke(IpcChannels.beautyClose, id, ok),

  libraryList: () => ipcRenderer.invoke(IpcChannels.libraryList),
  libraryCreate: () => ipcRenderer.invoke(IpcChannels.libraryCreate),
  libraryRename: (path, name) => ipcRenderer.invoke(IpcChannels.libraryRename, path, name),
  libraryDuplicate: (path, copySuffix) => ipcRenderer.invoke(IpcChannels.libraryDuplicate, path, copySuffix),
  libraryTrash: (path) => ipcRenderer.invoke(IpcChannels.libraryTrash, path),
  libraryReveal: (path) => ipcRenderer.send(IpcChannels.libraryReveal, path)
}

contextBridge.exposeInMainWorld('cutcap', api)
