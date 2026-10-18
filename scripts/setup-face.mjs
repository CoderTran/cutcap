// Chuẩn bị AI nhận diện khuôn mặt (MediaPipe Face Landmarker, Apache-2.0) cho "Làm đẹp":
//   src/renderer/public/mediapipe/vision_wasm_internal.{js,wasm}  – chép từ node_modules/@mediapipe/tasks-vision
//   src/renderer/public/mediapipe/face_landmarker.task            – tải từ Google, kiểm tra SHA-256
// Thư mục public được electron-vite chép nguyên vào bản build → giao diện nạp bằng đường dẫn tương đối.
//
// Cách dùng: npm run setup:face   (-- --force để tải lại)
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
const WASM_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src', 'renderer', 'public', 'mediapipe')
const wasmDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const force = process.argv.includes('--force')

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function main() {
  console.log('\nCutcap – chuẩn bị AI nhận diện khuôn mặt (MediaPipe)\n')
  if (!existsSync(wasmDir)) fail('Chưa cài @mediapipe/tasks-vision – chạy: npm install')
  await mkdir(outDir, { recursive: true })

  for (const name of WASM_FILES) await copyFile(join(wasmDir, name), join(outDir, name))
  console.log(`• Chép ${WASM_FILES.length} file WebAssembly`)

  const model = join(outDir, 'face_landmarker.task')
  if (!force && existsSync(model) && sha256(await readFile(model)) === MODEL_SHA256) {
    console.log('• Mô hình đã có sẵn (checksum khớp)')
  } else {
    console.log(`• Tải ${MODEL_URL}`)
    const res = await fetch(MODEL_URL, { redirect: 'follow' })
    if (!res.ok) fail(`Tải thất bại (${res.status} ${res.statusText})`)
    const data = Buffer.from(await res.arrayBuffer())
    const actual = sha256(data)
    if (actual !== MODEL_SHA256) fail(`Checksum không khớp.\n  Mong đợi: ${MODEL_SHA256}\n  Thực tế:  ${actual}`)
    await writeFile(model, data)
    console.log('• Checksum SHA-256 khớp ✔')
  }
  console.log('\n✔ Xong: src/renderer/public/mediapipe/\n')
}

main().catch((err) => fail(err?.stack ?? String(err)))
