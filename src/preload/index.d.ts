// Khai báo kiểu cho `window.cutcap` để TypeScript ở giao diện biết các hàm có sẵn.
import type { CutcapApi } from '../shared/ipc'

declare global {
  interface Window {
    cutcap: CutcapApi
  }
}

export {}
