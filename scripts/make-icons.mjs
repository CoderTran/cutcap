// Tạo icon cho Cutcap bằng FFmpeg (không cần phần mềm đồ họa) từ bản vẽ tay build/logo-source.jpg:
//   build/icon.png              512×512 – electron-builder dùng làm icon ứng dụng (tự chuyển sang .ico)
//   build/icon.ico              256×256 – icon cửa sổ / lối tắt
//   build/file-icon.ico         256×256 – icon của file .cutcap trong Windows Explorer (có góc gấp)
//   src/renderer/public/logo.png  64×64 – logo trên thanh tiêu đề
//
// Cách dùng: npm run icons   (cần chạy "npm run setup:ffmpeg" trước)
//
// Xử lý: ảnh chụp bản vẽ → xám → làm mượt nhẹ → "curves" đẩy giấy thành trắng tinh, mực thành đen tuyền
// → cắt sát hình vẽ → đặt nét mực đen lên ô vuông TRẮNG bo góc (nổi trên cả nền sáng lẫn taskbar tối).
// Vẽ ở 1024px rồi thu nhỏ (lanczos) để cạnh mượt, không răng cưa.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ffmpeg = join(root, 'resources', 'ffmpeg', 'ffmpeg.exe')
const source = join(root, 'build', 'logo-source.jpg')
const outDir = join(root, 'build')
if (!existsSync(ffmpeg)) {
  console.error('✖ Chưa có FFmpeg. Chạy trước: npm run setup:ffmpeg')
  process.exit(1)
}
if (!existsSync(source)) {
  console.error('✖ Thiếu bản vẽ build/logo-source.jpg')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

/** Khung chứa hình vẽ trong ảnh gốc 942×942 (x, y, rộng, cao) – bỏ phần giấy trống xung quanh. */
const DRAWING = { x: 70, y: 22, w: 775, h: 892 }
/** Mực đậm hơn mức này → đen hẳn, giấy sáng hơn mức kia → trắng hẳn (0–1). */
const INK = 0.4
const PAPER = 0.66

/**
 * Mặt nạ alpha của ô vuông bo góc (+ góc gấp kiểu "tờ giấy" cho icon file).
 * @param doc true = icon file .cutcap
 */
function boxAlpha(S, doc) {
  const c = S / 2
  const half = S * 0.4375 // nửa cạnh ô vuông (chừa viền trong suốt)
  const radius = S * 0.1875
  const inner = half - radius
  const insideBox = `lte(hypot(max(abs(X-${c})-${inner},0),max(abs(Y-${c})-${inner},0)),${radius})`
  // Góc gấp: cắt bỏ tam giác ở góc trên phải, phía ngoài đường nối (mép phải − f, mép trên) và (mép phải, mép trên + f)
  const f = S * 0.24
  const fold = doc ? `*(1-gt(X-Y,${2 * half - f}))` : ''
  return `255*${insideBox}${fold}`
}

function render(name, size, doc, codecArgs, dir = outDir) {
  const S = 1024
  // Hình vẽ chiếm ~70% cạnh, căn giữa ô vuông
  const I = Math.round(S * 0.7)
  const drawW = Math.round((I * DRAWING.w) / DRAWING.h)
  const graph = [
    // Nét mực: xám → mượt nhẹ (bớt lốm đốm giấy) → đen/trắng rõ ràng → cắt sát hình → thu về I px cao
    `[0:v]format=gray,gblur=sigma=0.8,curves=all='0/0 ${INK}/0 ${PAPER}/1 1/1',` +
      `crop=${DRAWING.w}:${DRAWING.h}:${DRAWING.x}:${DRAWING.y},scale=${drawW}:${I}:flags=lanczos,` +
      `pad=${S}:${S}:(ow-iw)/2:(oh-ih)/2:white,negate[mask]`,
    // Lớp mực đen, độ trong suốt = độ đậm của nét
    `color=c=black:s=${S}x${S},format=rgba[ink0]`,
    `[ink0][mask]alphamerge[ink]`,
    // Nền: ô vuông trắng bo góc, ngoài ô trong suốt
    `color=c=white:s=${S}x${S},format=rgba,geq=r=255:g=255:b=255:a='${boxAlpha(S, doc)}'[bg]`,
    `[bg][ink]overlay=format=auto,scale=${size}:${size}:flags=lanczos[out]`
  ].join(';')
  execFileSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', source,
    '-filter_complex', graph,
    '-map', '[out]', '-frames:v', '1', ...codecArgs, join(dir, name)
  ])
  console.log(`✔ ${join(dir, name).slice(root.length + 1)}`)
}

render('icon.png', 512, false, ['-update', '1'])
// File .ico: định dạng ICO chứa ảnh PNG 256×256 – Windows tự thu nhỏ cho các cỡ khác
render('icon.ico', 256, false, ['-c:v', 'png', '-f', 'ico'])
render('file-icon.ico', 256, true, ['-c:v', 'png', '-f', 'ico'])
render('logo.png', 64, false, ['-update', '1'], join(root, 'src', 'renderer', 'public'))
