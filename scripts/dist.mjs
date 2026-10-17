// Tạo bộ cài Windows: kiểm tra → build mã → đóng gói bằng electron-builder.
// Cách dùng: npm run dist
//
// Bộ nhớ đệm (cache) của electron-builder (Electron, NSIS… tải từ GitHub) được đặt TRONG thư mục
// dự án (node_modules/.cache) thay vì %LOCALAPPDATA%, để dọn dẹp dễ và không rải file ra ngoài.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, 'node_modules', '.cache')
process.env.ELECTRON_BUILDER_CACHE = join(cache, 'electron-builder')
process.env.ELECTRON_CACHE = join(cache, 'electron')

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

// 1) Những thứ bắt buộc phải có trước khi đóng gói
for (const [file, hint] of [
  ['resources/ffmpeg/ffmpeg.exe', 'npm run setup:ffmpeg'],
  ['resources/ffmpeg/ffmpeg-build.json', 'npm run setup:ffmpeg'],
  ['build/icon.png', 'npm run icons'],
  ['build/file-icon.ico', 'npm run icons'],
  ['LICENSE', 'chép LICENSE (GPL-3.0) vào thư mục dự án']
]) {
  if (!existsSync(join(root, file))) fail(`Thiếu ${file} – chạy: ${hint}`)
}

// 2) Build mã (main + preload + giao diện)
console.log('• Build mã nguồn…')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
execFileSync(npx, ['electron-vite', 'build'], { cwd: root, stdio: 'inherit', shell: true })

// 3) Đóng gói
console.log('• Đóng gói bộ cài…')
const { build } = await import('electron-builder')
const files = await build({ projectDir: root, win: ['nsis'], publish: 'never' })
console.log('\n✔ Xong:')
for (const f of files) console.log(`  ${f}`)
