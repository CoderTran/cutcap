// Tải whisper.cpp (nhận dạng giọng nói, dùng cho "Phụ đề tự động") vào resources/whisper/.
//
// Cách dùng:
//   npm run setup:whisper              – tải (bỏ qua nếu đã có đúng bản)
//   npm run setup:whisper -- --force   – tải lại
//
// Script làm các việc:
//   1. Tải whisper-bin-x64.zip của bản phát hành đã chọn (BUILD) – kiểm tra SHA-256
//   2. Giải nén bằng tar.exe của Windows, chỉ chép những file cần:
//      whisper-cli.exe, whisper-vad-speech-segments.exe, whisper.dll, ggml*.dll
//   3. Tải mô hình dò tiếng nói Silero VAD (~0,9 MB) – kiểm tra SHA-256
//   4. Tải LICENSE (MIT) của whisper.cpp, ghi thông tin bản đã dùng ra whisper-build.json
//
// Mô hình nhận dạng giọng nói (ggml-small-q5_1.bin, ~190 MB) KHÔNG nằm ở đây: app tự tải về
// thư mục dữ liệu người dùng khi bấm "Tạo" phụ đề lần đầu (xem src/main/captions/whisperModel.ts).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ───────── Cấu hình ─────────

/** Bản phát hành của whisper.cpp (tag "bNNNN" có file build sẵn cho Windows). Đổi cả checksum khi nâng cấp. */
const BUILD = 'b5454'
const ZIP = 'whisper-bin-x64.zip'
const ZIP_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${BUILD}/${ZIP}`
const ZIP_SHA256 = '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb'
const LICENSE_URL = `https://raw.githubusercontent.com/ggml-org/whisper.cpp/${BUILD}/LICENSE`
const VAD = 'ggml-silero-v6.2.0.bin'
const VAD_URL = `https://huggingface.co/ggml-org/whisper-vad/resolve/main/${VAD}`
const VAD_SHA256 = '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987'
/** Chỉ lấy những file app dùng (bỏ các công cụ thử nghiệm, SDL2…). */
const WANTED_FILE = (name) =>
  name === 'whisper-cli.exe' || name === 'whisper-vad-speech-segments.exe' || name === 'whisper.dll' || /^ggml.*\.dll$/.test(name)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources', 'whisper')
const cacheDir = join(root, 'node_modules', '.cache', 'cutcap-whisper')
const infoFile = join(outDir, 'whisper-build.json')
const force = process.argv.includes('--force')

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

async function fetchBytes(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) fail(`Tải thất bại (${res.status} ${res.statusText}): ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** Tải (hoặc dùng lại bản trong cache) và kiểm tra checksum. */
async function downloadChecked(url, file, expected) {
  if (existsSync(file) && sha256(await readFile(file)) === expected) return
  console.log(`• Tải ${url}`)
  const data = await fetchBytes(url)
  const actual = sha256(data)
  if (actual !== expected) fail(`Checksum không khớp: ${url}\n  Mong đợi: ${expected}\n  Thực tế:  ${actual}`)
  await writeFile(file, data)
}

async function main() {
  console.log(`\nCutcap – cài đặt whisper.cpp ${BUILD} (MIT)\n`)
  if (!force && existsSync(join(outDir, 'whisper-cli.exe')) && existsSync(infoFile)) {
    const info = JSON.parse(await readFile(infoFile, 'utf8'))
    if (info.build === BUILD && existsSync(join(outDir, VAD))) {
      console.log(`✔ whisper.cpp đã có sẵn (${BUILD}). Muốn tải lại: npm run setup:whisper -- --force\n`)
      return
    }
  }

  await mkdir(cacheDir, { recursive: true })
  const zipPath = join(cacheDir, ZIP)
  await downloadChecked(ZIP_URL, zipPath, ZIP_SHA256)
  console.log('• Checksum SHA-256 khớp ✔  – giải nén…')

  const extractDir = join(cacheDir, 'extract')
  await rm(extractDir, { recursive: true, force: true })
  await mkdir(extractDir, { recursive: true })
  // tar.exe của Windows (bsdtar) giải nén được .zip; không dùng "tar" trơn (có thể là GNU tar của Git)
  const windowsTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  execFileSync(windowsTar, ['-xf', zipPath, '-C', extractDir], { stdio: 'inherit' })
  const binDir = join(extractDir, 'Release')
  const files = (await readdir(binDir)).filter(WANTED_FILE)
  if (!files.includes('whisper-cli.exe')) fail(`Không thấy whisper-cli.exe trong ${binDir}`)

  await mkdir(outDir, { recursive: true })
  for (const old of await readdir(outDir)) if (old.endsWith('.exe') || old.endsWith('.dll')) await rm(join(outDir, old))
  console.log(`• Chép ${files.length} file vào resources/whisper/`)
  for (const name of files) await copyFile(join(binDir, name), join(outDir, name))

  await downloadChecked(VAD_URL, join(outDir, VAD), VAD_SHA256)
  await writeFile(join(outDir, 'LICENSE.txt'), await fetchBytes(LICENSE_URL))

  console.log('• Chạy thử whisper-cli…')
  execFileSync(join(outDir, 'whisper-cli.exe'), ['--help'], { stdio: 'ignore' })

  await writeFile(
    infoFile,
    JSON.stringify(
      {
        build: BUILD,
        url: ZIP_URL,
        sha256: ZIP_SHA256,
        vad: { file: VAD, url: VAD_URL, sha256: VAD_SHA256, license: 'MIT' },
        license: 'MIT (xem LICENSE.txt)',
        sourceCode: 'https://github.com/ggml-org/whisper.cpp',
        installedAt: new Date().toISOString()
      },
      null,
      2
    ) + '\n'
  )
  console.log('\n✔ Xong: resources/whisper/\n')
}

main().catch((err) => fail(err?.stack ?? String(err)))
