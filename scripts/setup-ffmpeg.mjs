// Tải FFmpeg cho Windows (bản build GPL của BtbN) vào resources/ffmpeg/.
//
// Cách dùng:
//   npm run setup:ffmpeg                 – tải bản mặc định (bỏ qua nếu đã có)
//   npm run setup:ffmpeg -- --force      – tải lại dù đã có
//   npm run setup:ffmpeg -- --version 9.0
//
// Script làm các việc:
//   1. Tải danh sách checksum SHA-256 của bản phát hành
//   2. Tải file zip (có hiển thị tiến trình), vừa tải vừa tính SHA-256
//   3. So sánh checksum – sai thì dừng, không dùng file hỏng
//   4. Giải nén bằng tar.exe (có sẵn trong Windows 10/11)
//   5. Chép ffmpeg.exe, ffprobe.exe, các file .dll và LICENSE vào resources/ffmpeg/
//   6. Chạy thử "ffmpeg -version" và ghi thông tin bản build ra ffmpeg-build.json
//      (cần cho việc tuân thủ giấy phép GPL: ghi rõ đã lấy bản nào, từ đâu)
//
// Chỉ dùng thư viện có sẵn của Node.js, không cần cài thêm gì.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

// ───────── Cấu hình ─────────

/** Nhánh phát hành ổn định của FFmpeg. Đổi số này để nâng cấp FFmpeg. */
const DEFAULT_VERSION = '8.1'
const RELEASE_BASE = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest'
/** Các file cần lấy từ thư mục bin/ (ffplay.exe không cần). */
const WANTED_FILE = (name) => name === 'ffmpeg.exe' || name === 'ffprobe.exe' || name.endsWith('.dll')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources', 'ffmpeg')
const cacheDir = join(root, 'node_modules', '.cache', 'cutcap-ffmpeg')
const infoFile = join(outDir, 'ffmpeg-build.json')

// ───────── Đọc tham số dòng lệnh ─────────

const args = process.argv.slice(2)
const force = args.includes('--force')
const versionIndex = args.indexOf('--version')
const version = versionIndex >= 0 ? args[versionIndex + 1] : DEFAULT_VERSION
if (!/^\d+\.\d+$/.test(version ?? '')) fail(`Phiên bản không hợp lệ: "${version}". Ví dụ đúng: --version 8.1`)

const assetName = `ffmpeg-n${version}-latest-win64-gpl-shared-${version}.zip`
const assetUrl = `${RELEASE_BASE}/${assetName}`

// ───────── Hàm tiện ích ─────────

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function fetchOk(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) fail(`Tải thất bại (${res.status} ${res.statusText}): ${url}`)
  return res
}

/** Lấy checksum của đúng file cần tải từ checksums.sha256 của bản phát hành. */
async function fetchExpectedSha256() {
  const text = await (await fetchOk(`${RELEASE_BASE}/checksums.sha256`)).text()
  // Mỗi dòng có dạng: "<sha256>  <tên file>"
  const line = text.split(/\r?\n/).find((l) => l.trim().endsWith(assetName))
  if (!line) {
    fail(
      `Không tìm thấy "${assetName}" trong bản phát hành.\n` +
        `  Có thể nhánh ${version} đã ngừng được build. Xem các bản hiện có tại:\n` +
        `  https://github.com/BtbN/FFmpeg-Builds/releases/tag/latest`
    )
  }
  return line.trim().split(/\s+/)[0].toLowerCase()
}

/** Tải file về `dest`, vừa tải vừa tính SHA-256 và in tiến trình. */
async function download(url, dest) {
  const res = await fetchOk(url)
  const total = Number(res.headers.get('content-length')) || 0
  const hash = createHash('sha256')
  let received = 0
  let lastPrint = 0

  const progress = new Transform({
    transform(chunk, _enc, callback) {
      received += chunk.length
      hash.update(chunk)
      const now = Date.now()
      if (now - lastPrint > 250) {
        lastPrint = now
        const pct = total ? ` ${((received / total) * 100).toFixed(0).padStart(3)}%` : ''
        process.stdout.write(`\r  Đang tải…${pct}  ${formatMB(received)}${total ? ` / ${formatMB(total)}` : ''}   `)
      }
      callback(null, chunk)
    }
  })

  await pipeline(Readable.fromWeb(res.body), progress, createWriteStream(dest))
  process.stdout.write(`\r  Đã tải xong ${formatMB(received)}.                         \n`)
  return hash.digest('hex')
}

async function sha256OfFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

// ───────── Chương trình chính ─────────

async function main() {
  console.log(`\nCutcap – cài đặt FFmpeg ${version} (BtbN, GPL, shared)\n`)

  // Đã có đúng phiên bản rồi thì thôi
  if (!force && existsSync(join(outDir, 'ffmpeg.exe')) && existsSync(infoFile)) {
    const info = JSON.parse(await readFile(infoFile, 'utf8'))
    if (info.asset === assetName) {
      console.log(`✔ FFmpeg đã có sẵn: ${info.versionLine}`)
      console.log('  (Muốn tải lại, chạy: npm run setup:ffmpeg -- --force)\n')
      return
    }
  }

  await mkdir(cacheDir, { recursive: true })
  const zipPath = join(cacheDir, assetName)

  console.log('• Lấy checksum của bản phát hành…')
  const expected = await fetchExpectedSha256()

  // Nếu đã có file zip đúng checksum trong cache (lần chạy trước) thì không tải lại
  let actual = existsSync(zipPath) ? await sha256OfFile(zipPath) : null
  if (actual === expected) {
    console.log('• Dùng lại file đã tải trước đó (checksum khớp).')
  } else {
    console.log(`• Tải ${assetName}`)
    console.log(`  từ ${assetUrl}`)
    actual = await download(assetUrl, zipPath)
  }

  if (actual !== expected) {
    await rm(zipPath, { force: true })
    fail(`Checksum không khớp – file tải về bị hỏng.\n  Mong đợi: ${expected}\n  Thực tế:  ${actual}\n  Hãy chạy lại.`)
  }
  console.log('• Checksum SHA-256 khớp ✔')

  console.log('• Giải nén…')
  const extractDir = join(cacheDir, 'extract')
  await rm(extractDir, { recursive: true, force: true })
  await mkdir(extractDir, { recursive: true })
  try {
    // Gọi đích danh tar.exe của Windows (bsdtar – giải nén được .zip).
    // Không gọi "tar" trơn vì nếu PATH có tar của Git (GNU tar) thì nó không đọc được zip.
    const windowsTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    execFileSync(windowsTar, ['-xf', zipPath, '-C', extractDir], { stdio: 'inherit' })
  } catch {
    fail('Không giải nén được. Windows 10 bản 1803 trở lên mới có sẵn lệnh tar.')
  }

  // Trong zip có 1 thư mục gốc, ví dụ "ffmpeg-n8.1-latest-win64-gpl-shared-8.1/"
  const [topFolder] = await readdir(extractDir)
  const binDir = join(extractDir, topFolder, 'bin')
  const files = (await readdir(binDir)).filter(WANTED_FILE)
  if (!files.includes('ffmpeg.exe') || !files.includes('ffprobe.exe')) {
    fail(`Không thấy ffmpeg.exe / ffprobe.exe trong ${binDir}`)
  }

  // Xóa bản cũ (exe/dll) để không lẫn DLL của 2 phiên bản khác nhau
  await mkdir(outDir, { recursive: true })
  for (const old of await readdir(outDir)) {
    if (old.endsWith('.exe') || old.endsWith('.dll')) await rm(join(outDir, old))
  }

  console.log(`• Chép ${files.length} file vào resources/ffmpeg/`)
  for (const name of files) await copyFile(join(binDir, name), join(outDir, name))
  await copyFile(join(extractDir, topFolder, 'LICENSE.txt'), join(outDir, 'LICENSE.txt'))

  console.log('• Chạy thử ffmpeg…')
  const versionLine = execFileSync(join(outDir, 'ffmpeg.exe'), ['-hide_banner', '-version'], { encoding: 'utf8' })
    .split(/\r?\n/)[0]
    .trim()

  await writeFile(
    infoFile,
    JSON.stringify(
      {
        asset: assetName,
        url: assetUrl,
        sha256: expected,
        versionLine,
        license: 'GPL-3.0 (xem LICENSE.txt)',
        sourceCode: 'https://github.com/BtbN/FFmpeg-Builds (script build) – https://ffmpeg.org/download.html (mã nguồn FFmpeg)',
        installedAt: new Date().toISOString()
      },
      null,
      2
    ) + '\n'
  )

  await rm(extractDir, { recursive: true, force: true })
  console.log(`\n✔ Xong! ${versionLine}\n`)
}

main().catch((err) => fail(err?.stack ?? String(err)))
