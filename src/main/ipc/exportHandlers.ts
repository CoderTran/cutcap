// Nối Exporter với Electron: dò encoder, hộp thoại lưu file, bắt đầu/hủy xuất, mở thư mục.
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IpcChannels, type ExportRequest } from '@shared/ipc'
import { detectEncoders } from '../export/encoders'
import { listSystemFonts } from '../fonts'
import { Exporter } from '../export/exporter'
import { strings } from '../strings'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** Tên file hợp lệ trên Windows. */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Cutcap'
}

export function registerExportHandlers(ffmpegExe: string): void {
  const exporter = new Exporter({
    ffmpegExe,
    tempDir: join(app.getPath('temp'), 'Cutcap'),
    onProgress: (p) => broadcast(IpcChannels.exportProgress, p)
  })

  ipcMain.handle(IpcChannels.exportDetectEncoders, () => detectEncoders(ffmpegExe))
  ipcMain.handle(IpcChannels.listFonts, () => listSystemFonts())

  ipcMain.handle(IpcChannels.exportChoosePath, async (event, defaultName: string, currentPath: string | null) => {
    // Chỉ dùng cho kiểm thử tự động: hộp thoại hệ thống của Windows không điều khiển tự động được
    const e2ePath = process.env['CUTCAP_E2E_EXPORT_PATH']
    if (e2ePath) return e2ePath
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.SaveDialogOptions = {
      title: strings.exportTitle,
      // Mặc định: thư mục Video của Windows
      defaultPath: currentPath ?? join(app.getPath('videos'), `${safeFileName(defaultName)}.mp4`),
      filters: [{ name: 'MP4', extensions: ['mp4'] }]
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    return result.canceled || !result.filePath ? null : result.filePath
  })

  ipcMain.handle(IpcChannels.exportStart, (_event, request: ExportRequest) => {
    // Không await: xuất chạy nền, kết quả báo qua sự kiện exportFinished
    void exporter.run(request).then((result) => broadcast(IpcChannels.exportFinished, result))
  })

  ipcMain.on(IpcChannels.exportCancel, () => exporter.cancel())
  ipcMain.on(IpcChannels.exportReveal, (_event, path: string) => shell.showItemInFolder(path))

  // Đóng app khi đang xuất → dừng ffmpeg, không để tiến trình chạy ngầm
  app.on('before-quit', () => exporter.cancel())

  // Dò encoder sẵn ngay khi mở app (mất ~1–2 giây) để lúc mở hộp thoại xuất là có kết quả
  void detectEncoders(ffmpegExe).catch(() => {})
}
