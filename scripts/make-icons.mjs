// Tạo icon cho Cutcap bằng FFmpeg (không cần phần mềm đồ họa):
//   build/icon.png       512×512 – electron-builder dùng làm icon ứng dụng (tự chuyển sang .ico)
//   build/icon.ico       256×256 – icon cửa sổ / lối tắt
//   build/file-icon.ico  256×256 – icon của file .cutcap trong Windows Explorer
//
// Cách dùng: npm run icons   (cần chạy "npm run setup:ffmpeg" trước)
//
// Hình vẽ: ô vuông bo góc màu xanh (chuyển màu), nút "play" trắng bị "cắt" một đường chéo.
// Vẽ ở 1024px rồi thu nhỏ (lanczos) để cạnh mượt, không răng cưa.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ffmpeg = join(root, 'resources', 'ffmpeg', 'ffmpeg.exe')
const outDir = join(root, 'build')
if (!existsSync(ffmpeg)) {
  console.error('✖ Chưa có FFmpeg. Chạy trước: npm run setup:ffmpeg')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

/**
 * Biểu thức cho bộ lọc geq (X, Y = toạ độ điểm ảnh trên khung S×S).
 * @param doc true = icon file: thêm góc gấp kiểu "tờ giấy" ở góc trên phải
 */
function geq(S, doc) {
  const c = S / 2
  const half = S * 0.4375 // nửa cạnh ô vuông (để chừa viền trong suốt)
  const radius = S * 0.1875
  const inner = half - radius
  const insideBox = `lte(hypot(max(abs(X-${c})-${inner},0),max(abs(Y-${c})-${inner},0)),${radius})`
  // Tam giác "play": đỉnh trái ở x0, mũi nhọn ở x1, cao 2*h
  const x0 = S * 0.38
  const x1 = S * 0.72
  const h = S * 0.22
  const tri = `between(X,${x0},${x1})*lte(abs(Y-${c}),(${x1}-X)*${(h / (x1 - x0)).toFixed(4)})`
  // Đường "cắt" chéo xuyên qua tam giác
  const cut = `lte(abs((X-${c})+(Y-${c})*0.9),${S * 0.018})`
  const white = `${tri}*(1-${cut})`
  // Góc gấp cho icon file: cắt bỏ tam giác ở góc trên phải, phía ngoài đường thẳng
  // nối (mép phải − f, mép trên) và (mép phải, mép trên + f)  ⇔  X − Y > 2·half − f
  const f = S * 0.24
  const fold = doc ? `*(1-gt(X-Y,${2 * half - f}))` : ''
  const a = `255*${insideBox}${fold}`
  const grad = (from, to) => `${from}+(${to - from})*Y/${S}`
  return {
    r: `if(${white},255,${grad(40, 18)})`,
    g: `if(${white},255,${grad(205, 105)})`,
    b: `if(${white},255,${grad(235, 250)})`,
    a
  }
}

function render(name, size, doc, codecArgs) {
  const S = 1024
  const e = geq(S, doc)
  const filter = `format=rgba,geq=r='${e.r}':g='${e.g}':b='${e.b}':a='${e.a}',scale=${size}:${size}:flags=lanczos`
  execFileSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=black@0:s=${S}x${S}`,
    '-frames:v', '1', '-vf', filter, ...codecArgs, join(outDir, name)
  ])
  console.log(`✔ build/${name}`)
}

render('icon.png', 512, false, ['-update', '1'])
// File .ico: định dạng ICO chứa ảnh PNG 256×256 – Windows tự thu nhỏ cho các cỡ khác
render('icon.ico', 256, false, ['-c:v', 'png', '-f', 'ico'])
render('file-icon.ico', 256, true, ['-c:v', 'png', '-f', 'ico'])
