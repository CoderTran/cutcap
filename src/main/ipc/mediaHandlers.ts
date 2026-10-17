// Nối MediaService với Electron: IPC, hộp thoại chọn file, giao thức cutcap-media.
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels, type MediaPreview } from '@shared/ipc'
import type { AudioDerive } from '@shared/media/derived'
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, extensionOf, fileNameOf } from '@shared/media/formats'
import { handleMediaProtocol } from '../media/mediaProtocol'
import { MediaService } from '../media/mediaService'
import { findInFolder } from '../media/relink'
import { strings } from '../strings'
import { defaultProjectsDir } from './projectHandlers'

/**
 * Vị trí ffmpeg:
 *  - khi dev: <thư mục dự án>/resources/ffmpeg (do "npm run setup:ffmpeg" tải về)
 *  - khi đã cài đặt: <thư mục cài>/resources/ffmpeg (electron-builder chép vào – Bước 13)
 */
function ffmpegDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'ffmpeg')
    : join(app.getAppPath(), 'resources', 'ffmpeg')
}

/** Gửi cập nhật tới mọi cửa sổ đang mở. */
function broadcast(preview: MediaPreview): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.mediaUpdated, preview)
  }
}

export function registerMediaHandlers(): MediaService {
  const media = new MediaService({
    ffmpegDir: ffmpegDir(),
    // %APPDATA%\Cutcap\cache\media – Windows có thể dọn, ta tạo lại được bất cứ lúc nào
    cacheRoot: join(app.getPath('userData'), 'cache', 'media'),
    onUpdate: broadcast
  })

  if (!media.hasTools()) {
    console.warn(`[Cutcap] Không tìm thấy FFmpeg tại ${ffmpegDir()}. Chạy: npm run setup:ffmpeg`)
  }

  handleMediaProtocol((p) => media.isAllowedPath(p))

  ipcMain.handle(IpcChannels.pickMediaFiles, async (event, only?: 'video') => {
    // Chỉ dùng cho kiểm thử tự động (hộp thoại hệ thống không điều khiển tự động được)
    const e2ePaths = process.env['CUTCAP_E2E_PICK_PATHS']
    if (e2ePaths) return e2ePaths.split('|')
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions =
      only === 'video'
        ? {
            title: strings.extractAudioTitle,
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: strings.filterVideo, extensions: [...VIDEO_EXTENSIONS] }]
          }
        : {
            title: strings.importTitle,
            properties: ['openFile', 'multiSelections'],
            filters: [
              { name: strings.filterAllMedia, extensions: [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS] },
              { name: strings.filterVideo, extensions: [...VIDEO_EXTENSIONS] },
              { name: strings.filterImage, extensions: [...IMAGE_EXTENSIONS] },
              { name: strings.filterAudio, extensions: [...AUDIO_EXTENSIONS] }
            ]
          }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(IpcChannels.importMedia, (_event, paths: string[]) => media.importFiles(paths))
  // File âm thanh trích xuất là dữ liệu của người dùng → để cạnh các dự án, không để trong cache
  ipcMain.handle(IpcChannels.extractAudio, (_event, path: string, mode?: AudioDerive) =>
    media.extractAudio(path, join(defaultProjectsDir(), strings.extractedAudioFolder), mode === 'karaoke' ? 'karaoke' : 'extract')
  )

  // Tìm lại file bị mất: hộp thoại mở sẵn ở thư mục cũ (nếu còn), lọc đúng đuôi file cũ
  ipcMain.handle(IpcChannels.relinkPick, async (event, oldPath: string) => {
    // Chỉ dùng cho kiểm thử tự động (hộp thoại hệ thống không điều khiển tự động được)
    const e2ePath = process.env['CUTCAP_E2E_RELINK_PATH']
    if (e2ePath) return e2ePath
    const win = BrowserWindow.fromWebContents(event.sender)
    const ext = extensionOf(oldPath)
    const options: Electron.OpenDialogOptions = {
      title: strings.relinkTitle(fileNameOf(oldPath)),
      defaultPath: dirname(oldPath),
      properties: ['openFile'],
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }, { name: strings.filterAllMedia, extensions: ['*'] }] : []
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle(IpcChannels.relinkFindInFolder, (_event, folder: string, oldPaths: string[]) => findInFolder(folder, oldPaths))
  ipcMain.handle(IpcChannels.prepareMedia, (_event, path: string) => media.prepare(path))

  // Đóng app thì dừng ffmpeg đang chạy, không để tiến trình "mồ côi"
  app.on('before-quit', () => media.cancelAll())

  return media
}
