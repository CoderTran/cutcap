// Tiến trình chính (main process) của Electron.
// Nhiệm vụ: tạo cửa sổ, đăng ký các xử lý IPC, và (ở các bước sau)
// làm việc với file, FFmpeg, lưu dự án… – những thứ giao diện không được làm trực tiếp.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { IpcChannels, type AppInfo } from '@shared/ipc'
import { registerExportHandlers } from './ipc/exportHandlers'
import { registerMediaHandlers } from './ipc/mediaHandlers'
import { registerProjectHandlers } from './ipc/projectHandlers'
import { registerMediaSchemePrivileges } from './media/mediaProtocol'
import { attachCloseGuard, registerCloseGuardHandlers } from './window/closeGuard'

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false, // chỉ hiện khi đã tải xong, tránh nháy màn hình trắng
    backgroundColor: '#16171a',
    title: 'Cutcap',
    autoHideMenuBar: true,
    // Thanh tiêu đề tự vẽ (giống CapCut); 3 nút thu nhỏ / phóng to / đóng vẫn là của Windows
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#131417', symbolColor: '#d8d9de', height: 38 },
    // Khi dev: lấy icon từ build/. Bản cài đặt dùng icon đã nhúng sẵn trong Cutcap.exe
    ...(app.isPackaged ? {} : { icon: join(app.getAppPath(), 'build', 'icon.png') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Các thiết lập bảo mật: giao diện không được dùng Node.js trực tiếp
      contextIsolation: true,
      // Preview phải phát được video/âm thanh khi bấm phím Space, không cần "cử chỉ người dùng"
      autoplayPolicy: 'no-user-gesture-required',
      nodeIntegration: false,
      sandbox: false // preload cần import module; giao diện vẫn bị cô lập nhờ contextIsolation
    }
  })

  win.once('ready-to-show', () => win.show())
  // Mở app bằng cách bấm đúp file .cutcap → giao diện tải xong thì mở file đó
  const initial = projectPathFromArgv(process.argv)
  if (initial) win.webContents.once('did-finish-load', () => win.webContents.send(IpcChannels.openRequested, initial))
  attachCloseGuard(win)

  // Link ngoài (http/https) mở bằng trình duyệt mặc định thay vì trong app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Khi chạy "npm run dev", electron-vite cung cấp URL dev server (có hot reload).
  // Khi đã build, tải file HTML đã đóng gói.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/** Đường dẫn file .cutcap trong tham số dòng lệnh (Windows truyền vào khi bấm đúp file). */
function projectPathFromArgv(argv: string[]): string | null {
  const found = argv.slice(1).find((a) => a.toLowerCase().endsWith('.cutcap') && existsSync(a))
  return found ?? null
}

/** Đăng ký tất cả handler IPC. Các bước sau sẽ thêm nhiều handler hơn ở đây. */
function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`
  }))
  registerCloseGuardHandlers()
  const media = registerMediaHandlers()
  registerProjectHandlers(media.hasTools() ? media.ffmpegExe : null)
  registerExportHandlers(media.ffmpegExe)
}

// Giao thức cutcap-media phải được khai báo trước khi app sẵn sàng
registerMediaSchemePrivileges()

// Chỉ cho phép chạy 1 cửa sổ Cutcap; mở lần 2 sẽ đưa cửa sổ cũ lên trước.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Mở thêm file .cutcap khi app đang chạy → dùng cửa sổ hiện có
  app.on('second-instance', (_event, argv) => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      const path = projectPathFromArgv(argv)
      if (path) win.webContents.send(IpcChannels.openRequested, path)
    }
  })

  app.whenReady().then(() => {
    // Windows dùng AppUserModelId để nhóm cửa sổ trên taskbar và hiện thông báo
    app.setAppUserModelId('vn.cutcap.app')
    registerIpcHandlers()
    createMainWindow()
  })

  app.on('window-all-closed', () => app.quit())
}
