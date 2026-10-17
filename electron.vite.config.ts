// Cấu hình build cho 3 phần của ứng dụng Electron:
//  - main:     tiến trình chính (Node.js) – truy cập file, chạy FFmpeg
//  - preload:  cầu nối an toàn giữa main và giao diện
//  - renderer: giao diện React (chạy trong Chromium)
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Alias "@shared" trỏ tới code dùng chung (kiểu dữ liệu dự án, tên kênh IPC…)
const sharedAlias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})
