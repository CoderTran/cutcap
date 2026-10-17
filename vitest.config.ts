// Cấu hình unit test (Vitest). Chỉ test logic thuần, không cần mở cửa sổ Electron.
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
