// Nối MediaService với Electron: IPC, hộp thoại chọn file, giao thức cutcap-media.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels, PREVIEW_QUALITIES, type MediaPreview, type PreviewQuality } from '@shared/ipc'
import type { AudioDerive } from '@shared/media/derived'
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, extensionOf, fileNameOf } from '@shared/media/formats'
import { handleMediaProtocol } from '../media/mediaProtocol'
import { probeFile } from '../media/probe'
import { SoundLibraryStore } from '../media/soundLibraryStore'
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

  ipcMain.handle(IpcChannels.pickMediaFiles, async (event, only?: 'video' | 'image') => {
    // Chỉ dùng cho kiểm thử tự động (hộp thoại hệ thống không điều khiển tự động được)
    const e2ePaths = process.env['CUTCAP_E2E_PICK_PATHS']
    if (e2ePaths) return e2ePaths.split('|')
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions =
      only === 'image'
        ? {
            // Ảnh bìa: chọn 1 ảnh
            title: strings.coverTitle,
            properties: ['openFile'],
            filters: [{ name: strings.filterImage, extensions: [...IMAGE_EXTENSIONS] }]
          }
        : only === 'video'
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
  // Thư viện âm thanh của bạn: thư mục âm thanh trên máy (chỉ đọc, không chép / tải lên đâu cả)
  const soundLibrary = new SoundLibraryStore(join(app.getPath('userData'), 'sound-library.json'), (p) => probeFile(media.ffprobeExe, p))
  ipcMain.handle(IpcChannels.soundLibraryGet, () => soundLibrary.get())
  ipcMain.handle(IpcChannels.soundLibraryRescan, () => soundLibrary.rescan())
  ipcMain.handle(IpcChannels.soundLibraryClear, () => soundLibrary.clear())
  ipcMain.handle(IpcChannels.soundLibraryPick, async (event) => {
    // Chỉ dùng cho kiểm thử tự động (hộp thoại hệ thống không điều khiển tự động được)
    const e2e = process.env['CUTCAP_E2E_PICK_FOLDER']
    if (e2e) return soundLibrary.setFolder(e2e)
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = { title: strings.soundLibraryTitle, properties: ['openDirectory'] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled || !result.filePaths[0] ? soundLibrary.get() : soundLibrary.setFolder(result.filePaths[0])
  })
  // Hiệu ứng âm thanh có sẵn (Kenney, CC0): <thư mục cài>/resources/sfx/kenney
  ipcMain.handle(IpcChannels.sfxBundledDir, () =>
    app.isPackaged ? join(process.resourcesPath, 'sfx', 'kenney') : join(app.getAppPath(), 'resources', 'sfx', 'kenney')
  )
  // Hiệu ứng âm thanh: file WAV nằm cố định trong thư mục dữ liệu của app (dự án tham chiếu tới đây)
  ipcMain.handle(IpcChannels.sfxSave, async (_event, id: string, wav: Uint8Array) => {
    if (!/^[a-zA-Z0-9]{1,40}$/.test(id) || !(wav instanceof Uint8Array) || wav.byteLength > 20_000_000) throw new Error('invalid sfx')
    const dir = join(app.getPath('userData'), 'sound-effects')
    await mkdir(dir, { recursive: true })
    const file = join(dir, `${id}.wav`)
    await writeFile(file, wav)
    return file
  })
  ipcMain.handle(IpcChannels.setPreviewQuality, (_event, quality: PreviewQuality) =>
    PREVIEW_QUALITIES.includes(quality) ? media.setPreviewQuality(quality) : undefined
  )
  ipcMain.handle(IpcChannels.measureLoudness, (_event, path: string, startUs: number, durationUs: number) =>
    media.measureLoudness(path, startUs, durationUs)
  )
  // File âm thanh trích xuất là dữ liệu của người dùng → để cạnh các dự án, không để trong cache
  ipcMain.handle(IpcChannels.extractAudio, (_event, path: string, mode?: AudioDerive) =>
    media.extractAudio(
      path,
      join(defaultProjectsDir(), strings.extractedAudioFolder),
      mode === 'karaoke' || (typeof mode === 'string' && mode.startsWith('fx:')) ? mode : 'extract'
    )
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
