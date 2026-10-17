// Chặn đóng cửa sổ khi còn thay đổi chưa lưu.
//
// Luồng xử lý:
//   1. Giao diện báo trạng thái "dirty" cho main mỗi khi nó thay đổi (setDirty).
//   2. Người dùng bấm X → nếu dirty, main hủy việc đóng và gửi "close-requested" sang giao diện.
//   3. Giao diện hỏi Lưu / Không lưu / Hủy, lưu nếu cần, rồi gọi closeWindow() để đóng thật.
// Nhờ vậy toàn bộ logic lưu nằm ở một chỗ (giao diện), main chỉ làm "người gác cổng".
import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc'

const dirtyWindows = new WeakSet<BrowserWindow>()
const allowedToClose = new WeakSet<BrowserWindow>()

export function registerCloseGuardHandlers(): void {
  ipcMain.on(IpcChannels.setDirty, (event, dirty: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (dirty) dirtyWindows.add(win)
    else dirtyWindows.delete(win)
  })

  ipcMain.on(IpcChannels.closeWindow, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    allowedToClose.add(win)
    win.close()
  })
}

export function attachCloseGuard(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (allowedToClose.has(win) || !dirtyWindows.has(win)) return
    event.preventDefault()
    win.webContents.send(IpcChannels.closeRequested)
  })

  // Nếu giao diện bị crash thì không còn ai trả lời câu hỏi lưu → cho phép đóng luôn
  win.webContents.on('render-process-gone', () => dirtyWindows.delete(win))
}
