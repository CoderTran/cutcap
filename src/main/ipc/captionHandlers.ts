// Nối CaptionService (Phụ đề tự động) với Electron: tạo phụ đề, hủy, báo tiến trình.
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, net } from 'electron'
import type { CaptionLanguage } from '@shared/captions/captions'
import { IpcChannels, type CaptionResult } from '@shared/ipc'
import type { Project } from '@shared/project/schema'
import { CaptionService } from '../captions/captionService'
import type { FetchLike } from '../captions/whisperModel'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** whisper.cpp nằm cạnh ffmpeg: <cài đặt>/resources/whisper (đã cài) hoặc resources/whisper (đang phát triển). */
function whisperDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'whisper') : join(app.getAppPath(), 'resources', 'whisper')
}

export function registerCaptionHandlers(ffmpegExe: string): void {
  const service = new CaptionService({
    ffmpegExe,
    whisperDir: whisperDir(),
    // %APPDATA%\Cutcap\models – mô hình tải 1 lần, dùng mãi (không phải cache, Windows không tự dọn)
    modelsDir: join(app.getPath('userData'), 'models'),
    tempDir: join(app.getPath('temp'), 'Cutcap'),
    // net.fetch của Electron dùng proxy / chứng chỉ của Windows (mạng công ty, trường học…)
    fetchImpl: ((url, init) => net.fetch(url, init)) as FetchLike
  })
  if (!service.available) console.warn(`[Cutcap] Không tìm thấy whisper.cpp tại ${whisperDir()}. Chạy: npm run setup:whisper`)

  ipcMain.handle(IpcChannels.captionsGenerate, async (_event, project: Project, language: CaptionLanguage): Promise<CaptionResult> => {
    if (!service.available) return { ok: false, error: 'whisper-missing' }
    try {
      const captions = await service.generate(project, language, (p) => broadcast(IpcChannels.captionsProgress, p))
      return { ok: true, captions }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return { ok: false, error: 'cancelled' }
      return { ok: false, error: 'failed', detail: (err as Error).message }
    }
  })
  ipcMain.on(IpcChannels.captionsCancel, () => service.cancel())
  app.on('before-quit', () => service.cancel())
}
