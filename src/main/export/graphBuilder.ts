// Dựng lệnh FFmpeg để xuất cả dự án thành 1 file MP4.
//
// Ý tưởng (một "đồ thị lọc" – filtergraph – của FFmpeg):
//
//   color (nền, đủ dài cả dự án) ──overlay── clip 1 ──overlay── clip 2 ── … ──▶ [vout]
//                                              ▲                    ▲
//                      [file 1] cắt đoạn → tốc độ → co giãn → màu → độ mờ → dời tới đúng giây
//
//   âm thanh của từng clip → tốc độ → âm lượng → dời tới đúng giây ──amix──▶ [aout]
//
// Vị trí/kích thước mỗi lớp hình dùng CHUNG hàm placeLayer với preview → video xuất giống preview.
// Hàm thuần: chỉ tạo tham số, không chạy gì – test được dễ dàng.
import type { Clip, MediaAsset, MediaClip, Project, Track } from '@shared/project/schema'
import { MICROS_PER_SECOND, type Micros } from '@shared/project/time'
import { clipFfmpegFilters } from '@shared/render/filters'
import { placeLayer } from '@shared/render/geometry'
import { clipEnd, projectDuration } from '@shared/timeline/clips'
import { effectStatements } from './effectFilters'
import { effectiveFades } from '@shared/timeline/clipProps'
import { clipAnimExprs, hasClipAnim, maxAnimScale } from '@shared/render/clipAnims'
import { findEffect, hasOverlay } from '@shared/render/effects'
import { ffmpegValueExpr, hasKeyframes, keyframesOf } from '@shared/timeline/keyframes'
import { edgeSpeeds, sourceSpanOf } from '@shared/timeline/clipTime'
import { curveSegments, curveSpeedAt } from '@shared/timeline/speedCurve'
import { hasColorChanges, isGradeEmpty, spatialParams, type ColorGrade } from '@shared/render/grade'
import { transitionAt, type ActiveTransition } from '@shared/timeline/transitions'
import { geqExprs, isPixelTransition, pixelRecipe } from '@shared/render/pixelTransitions'

export interface ExportGraph {
  /** Tham số đầu vào: [-ss … -t … -i file] lặp lại cho từng clip. */
  inputArgs: string[]
  /** Nội dung filtergraph (ghi ra file rồi truyền cho ffmpeg bằng -/filter_complex). */
  filterGraph: string
  /** Tên nhãn đầu ra hình và tiếng trong filtergraph. */
  videoLabel: string
  audioLabel: string
  durationUs: Micros
}

/** Ảnh chữ đã vẽ sẵn của 1 clip chữ (đường dẫn trên ổ đĩa). */
export interface TextFramesOnDisk {
  /** Mẫu tên file các khung hiệu ứng, vd. ".../f_%04d.png" (null nếu không có hiệu ứng). */
  pattern: string | null
  /** Số khung hiệu ứng. */
  count: number
  /** Ảnh tĩnh cho phần còn lại. */
  still: string
}

export interface GraphOptions {
  width: number
  height: number
  fps: number
  /** Định dạng điểm ảnh cuối cùng mà encoder cần (yuv420p, hoặc nv12 cho Intel QSV). */
  pixelFormat: string
  /** Ảnh chữ theo id clip chữ. Clip chữ không có ở đây sẽ bị bỏ qua. */
  textFrames?: Map<string, TextFramesOnDisk>
  /** Clip có Làm đẹp: phần hình đọc từ file đã làm đẹp (bắt đầu tại offsetUs của file gốc). */
  beautyRenders?: Map<string, { path: string; offsetUs: number; height: number }>
  /** Điều chỉnh màu: tên file .cube (trong thư mục làm việc của ffmpeg) theo id clip. */
  gradeLuts?: Map<string, string>
  /** Mặt nạ: ảnh PNG xám (trắng = giữ) hoặc chuỗi ảnh (có keyframe) theo id clip. */
  masks?: Map<string, MaskOnDisk>
}

/** Mặt nạ đã ghi ra đĩa: 1 ảnh, hoặc chuỗi ảnh bắt đầu tại startUs trên timeline. */
export type MaskOnDisk = { file: string } | { pattern: string; startUs: Micros; fps: number }

/** Micro-giây → chuỗi giây có 6 chữ số thập phân (FFmpeg hiểu chính xác tới µs). */
export const sec = (us: Micros): string => (us / MICROS_PER_SECOND).toFixed(6)

/** "#1a2b3c" → "0x1a2b3c" (dấu # có thể bị hiểu nhầm trong filtergraph). */
function ffColor(hex: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `0x${hex.slice(1)}` : '0x000000'
}

/**
 * Bộ lọc atempo chỉ nhận 0.5…2 (với chất lượng tốt) → tốc độ ngoài khoảng đó phải nối nhiều atempo.
 * Ví dụ 4× = atempo=2,atempo=2;  0.25× = atempo=0.5,atempo=0.5
 */
export function atempoChain(speed: number): string[] {
  const filters: string[] = []
  let rest = speed
  while (rest > 2) {
    filters.push('atempo=2')
    rest /= 2
  }
  while (rest < 0.5) {
    filters.push('atempo=0.5')
    rest /= 0.5
  }
  if (Math.abs(rest - 1) > 1e-6) filters.push(`atempo=${Number(rest.toFixed(6))}`)
  return filters
}

/** Kích thước khung bao sau khi xoay hình w×h một góc (radian). */
function rotatedBox(w: number, h: number, angle: number): { w: number; h: number } {
  const c = Math.abs(Math.cos(angle))
  const s = Math.abs(Math.sin(angle))
  return { w: w * c + h * s, h: w * s + h * c }
}

interface Item {
  clip: Clip
  track: Track
  asset: MediaAsset
}

interface InputInfo {
  /** Số thứ tự đầu vào trong lệnh ffmpeg. */
  index: number
  /** Điểm sourceIn của clip nằm cách đầu đoạn đã đọc bao nhiêu (µs, theo thời gian file gốc). */
  sourceOffset: number
  /** Phần thiếu ở đầu (µs timeline) phải "giữ khung đầu" vì file gốc không đủ. */
  padStart: number
}

/** Cạnh lớn nhất của ảnh trung gian khi phóng to bằng keyframe (giới hạn để không quá nặng). */
const MAX_ANIMATED_SIDE = 4096
/** Viền trong suốt quanh ảnh trung gian (pixel). */
const ANIMATED_MARGIN = 4

/**
 * Lớp hình có keyframe (kích thước / vị trí / xoay / độ mờ thay đổi theo thời gian).
 *
 * FFmpeg không đổi được kích thước khung hình giữa chừng một cách ổn định, nên:
 *   1. co ảnh về kích thước LỚN NHẤT mà keyframe cần (sắc nét khi phóng to)
 *   2. đặt vào một khung trong suốt đủ lớn
 *   3. bộ lọc perspective (tính lại MỖI KHUNG HÌNH) đưa 4 góc ảnh tới đúng chỗ: phóng to + xoay + dời
 *      – cùng công thức placeLayer của preview, giá trị lấy từ keyframe (ffmpegValueExpr)
 *   4. cắt về đúng khung hình; độ mờ thay đổi thì nhân kênh alpha bằng geq
 * Kết quả: một lớp W×H đặt ở góc (0, 0).
 *
 * @param extBefore phần lớp hình bắt đầu sớm hơn clip (chuyển cảnh) – thời gian keyframe tính từ đầu clip
 * @returns size: co ảnh (đặt trước bộ lọc màu); place: đặt ảnh vào khung (đặt sau)
 */
export function animatedLayerFilters(
  clip: Clip,
  srcW: number,
  srcH: number,
  W: number,
  H: number,
  fps: number,
  extBefore: Micros
): { size: string[]; place: string[] } {
  const fit = Math.min(W / srcW, H / srcH)
  const scales = keyframesOf(clip, 'scale').map((k) => k.value)
  // Hiệu ứng động (Vào/Ra/Kết hợp) nhân thêm vào Kích thước → ảnh trung gian phải đủ lớn cho lúc to nhất
  const media = clip.type === 'media' ? clip : null
  const animMax = media ? maxAnimScale(media) : 1
  const sMax = Math.max(...(scales.length > 0 ? scales : [clip.transform.scale]), 0.05) * animMax
  let bw = srcW * fit * sMax
  let bh = srcH * fit * sMax
  const shrink = Math.min(1, MAX_ANIMATED_SIDE / Math.max(bw, bh))
  bw = Math.max(2, Math.round(bw * shrink))
  bh = Math.max(2, Math.round(bh * shrink))
  /** 1 điểm ảnh trung gian = unit × Kích thước điểm ảnh trên khung hình. */
  const unit = (srcW * fit) / bw
  // perspective lấy màu MÉP ẢNH cho phần nằm ngoài ảnh gốc → chừa viền trong suốt cả 4 phía,
  // nếu không mép ảnh sẽ bị kéo loang ra khắp khung
  const m = ANIMATED_MARGIN
  const CW = Math.max(W, bw + 2 * m)
  const CH = Math.max(H, bh + 2 * m)

  // perspective: "on" = số thứ tự khung hình (đã chuẩn hóa fps) → giây tính từ đầu clip
  const tp = `(on/${fps}-${sec(extBefore)})`
  // Keyframe + hiệu ứng động cộng dồn – cùng phép tính với preview (transformAt + clipAnimAt)
  const an = media ? clipAnimExprs(media, tp) : { scale: '1', dx: '0', dy: '0', rot: '0', alpha: '1', sx: '1' }
  const S = `(${ffmpegValueExpr(clip, 'scale', tp)})*(${an.scale})`
  const X = `(${ffmpegValueExpr(clip, 'x', tp)})+(${an.dx})`
  const Y = `(${ffmpegValueExpr(clip, 'y', tp)})+(${an.dy})`
  const A = `((${ffmpegValueExpr(clip, 'rotation', tp)})+(${an.rot}))*PI/180`
  const SX = `(${an.sx})`
  const corner = (px: number, py: number): [string, string] => {
    const dx = px - (m + bw / 2)
    const dy = py - (m + bh / 2)
    const k = `${unit.toFixed(8)}*(${S})`
    return [`${W}*(${X})+${k}*(${SX}*(${dx})*cos(${A})-(${dy})*sin(${A}))`, `${H}*(${Y})+${k}*(${SX}*(${dx})*sin(${A})+(${dy})*cos(${A}))`]
  }
  const pts = [corner(0, 0), corner(CW, 0), corner(0, CH), corner(CW, CH)]
  const coords = pts.map(([x, y], i) => `x${i}='${x}':y${i}='${y}'`).join(':')

  const opacityKf = keyframesOf(clip, 'opacity').length > 0
  const animAlpha = media ? clipAnimExprs(media, `(T-${sec(extBefore)})`).alpha : '1'
  const opacity =
    opacityKf || animAlpha !== '1'
      ? // geq: "T" = giây của khung hình tính từ đầu lớp
        [
          `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip((${ffmpegValueExpr(clip, 'opacity', `(T-${sec(extBefore)})`)})*(${animAlpha}),0,1)'`
        ]
      : clip.transform.opacity < 1
        ? [`colorchannelmixer=aa=${clip.transform.opacity.toFixed(4)}`]
        : []
  return {
    size: [
      `fps=${fps}`, // khung hình đều → "on" của perspective khớp với thời gian
      `scale=${bw}:${bh}:flags=bicubic`,
      'format=rgba'
    ],
    place: [
      ...opacity,
      `pad=${CW}:${CH}:${m}:${m}:color=0x00000000`,
      `perspective=${coords}:sense=destination:eval=frame`,
      `crop=${W}:${H}:0:0`
    ]
  }
}

/**
 * Chuyển cảnh làm méo điểm ảnh của một lớp: geq (định dạng gbrap) với biểu thức sinh từ cùng công thức với khung
 * Xem trước (shared/render/pixelTransitions.ts), chỉ bật trong khoảng chuyển cảnh (enable) → không làm chậm cả clip.
 * Thời gian T là thời gian cục bộ của lớp (0 = lúc lớp bắt đầu hiện): clip vào → [0, dur]; clip ra → [len − dur, len].
 */
export function pixelTransitionFilters(tin: ActiveTransition | null, tout: ActiveTransition | null, layerLen: Micros): string[] {
  const out: string[] = []
  const add = (kind: string, role: 'in' | 'out', t0Us: Micros, durUs: Micros): void => {
    const recipe = pixelRecipe(kind, role)
    if (!recipe) return
    const t0 = t0Us / MICROS_PER_SECOND
    const dur = durUs / MICROS_PER_SECOND
    const e = geqExprs(recipe, t0, dur)
    out.push(
      'format=gbrap',
      `geq=r='${e.r}':g='${e.g}':b='${e.b}':a='${e.a}':enable='between(t,${t0.toFixed(6)},${(t0 + dur).toFixed(6)})'`,
      'format=rgba'
    )
  }
  if (tin && isPixelTransition(tin.kind)) add(tin.kind, 'in', 0, tin.duration)
  if (tout && isPixelTransition(tout.kind)) add(tout.kind, 'out', layerLen - tout.duration, tout.duration)
  return out
}

/**
 * Biểu thức vị trí ngang cho chuyển cảnh trượt (t = thời gian timeline, giây).
 * Cùng công thức với transitionEffect: vào từ phải/trái, ra sang trái/phải, tuyến tính.
 */
function slideX(baseX: number, W: number, tin: ActiveTransition | null, tout: ActiveTransition | null): string {
  const progress = (tr: ActiveTransition): string => `clip((t-${sec(tr.from)})/${sec(tr.duration)},0,1)`
  let expr = String(baseX)
  if (tin?.kind === 'slide-left') expr += `+${W}*(1-${progress(tin)})`
  if (tin?.kind === 'slide-right') expr += `-${W}*(1-${progress(tin)})`
  if (tout?.kind === 'slide-left') expr += `-${W}*${progress(tout)}`
  if (tout?.kind === 'slide-right') expr += `+${W}*${progress(tout)}`
  return expr
}

export function buildExportGraph(project: Project, opts: GraphOptions): ExportGraph {
  const { width: W, height: H, fps } = opts
  const D = projectDuration(project)
  const inputArgs: string[] = []
  const filters: string[] = []
  /** Mỗi clip một đầu vào; nhớ lại để phần âm thanh dùng chung đầu vào với phần hình. */
  const inputOf = new Map<string, InputInfo>()
  let inputCount = 0

  /**
   * Thêm đầu vào cho clip.
   * @param extBefore / extAfter phần kéo dài trên timeline (µs) do chuyển cảnh ở đầu / cuối clip
   */
  const addInput = ({ clip, asset }: Item, extBefore = 0, extAfter = 0): InputInfo => {
    const existing = inputOf.get(clip.id)
    if (existing) return existing
    let info: InputInfo = { index: inputCount, sourceOffset: 0, padStart: 0 }
    // Làm đẹp: đọc phần hình từ file đã vẽ lại (thời gian tính lại theo điểm bắt đầu của file đó)
    const beauty = opts.beautyRenders?.get(clip.id)
    const path = beauty?.path ?? asset.path
    const offset = beauty?.offsetUs ?? 0
    if (asset.kind === 'image') {
      // Ảnh tĩnh: lặp 1 ảnh thành video dài đúng thời lượng hiện trên màn hình
      inputArgs.push('-loop', '1', '-framerate', String(fps), '-t', sec(clip.duration + extBefore + extAfter), '-i', path)
    } else if (clip.type === 'media') {
      // Muốn đọc từ sớm hơn điểm cắt (cho chuyển cảnh); file không đủ thì đọc từ 0 và "giữ khung đầu" phần thiếu
      const edges = edgeSpeeds(clip)
      const wanted = clip.sourceIn - offset - extBefore * edges.start
      const start = Math.max(0, wanted)
      const readDuration = Math.round(sourceSpanOf(clip) + extBefore * edges.start + extAfter * edges.end - (start - wanted))
      // -ss đặt TRƯỚC -i: nhảy nhanh tới điểm cắt; -t: chỉ đọc đúng đoạn cần (đã nhân tốc độ)
      inputArgs.push('-ss', sec(start), '-t', sec(readDuration), '-i', path)
      info = { index: inputCount, sourceOffset: clip.sourceIn - offset - start, padStart: Math.round((start - wanted) / edges.start) }
    } else {
      inputArgs.push('-i', asset.path) // sticker (Bước sau)
    }
    inputOf.set(clip.id, info)
    inputCount++
    return info
  }

  /** Ảnh mặt nạ của clip: lặp đúng thời lượng lớp hình. @returns nhãn đầu vào, hoặc null nếu clip không có mặt nạ */
  const addMaskInput = (clip: Clip, extBefore: Micros, extAfter: Micros): string | null => {
    const m = clip.type === 'media' && clip.mask ? opts.masks?.get(clip.id) : undefined
    if (!m) return null
    const length = sec(clip.duration + extBefore + extAfter)
    if ('file' in m) inputArgs.push('-loop', '1', '-framerate', String(fps), '-t', length, '-i', m.file)
    // Chuỗi ảnh (mặt nạ có keyframe): bỏ phần trước đầu lớp hình để ảnh khớp đúng thời điểm
    else inputArgs.push('-framerate', String(m.fps), '-ss', sec(clip.start - extBefore - m.startUs), '-t', length, '-i', m.pattern)
    return `${inputCount++}:v`
  }

  /** Đầu vào riêng cho file âm thanh đã xử lý của clip video: đọc đúng đoạn cắt của clip. */
  const addDubInput = (clip: MediaClip, asset: MediaAsset): InputInfo => {
    inputArgs.push('-ss', sec(clip.sourceIn), '-t', sec(sourceSpanOf(clip)), '-i', asset.path)
    return { index: inputCount++, sourceOffset: 0, padStart: 0 }
  }

  // ───────── HÌNH ─────────
  filters.push(`color=c=${ffColor(project.settings.backgroundColor)}:s=${W}x${H}:r=${fps}:d=${sec(D)},format=yuv420p[base]`)
  let current = 'base'
  let layerIndex = 0

  // Track cuối danh sách nằm dưới cùng → vẽ trước
  for (let ti = project.tracks.length - 1; ti >= 0; ti--) {
    const track = project.tracks[ti]
    if (track.hidden || track.kind === 'audio') continue
    if (track.kind === 'effect') {
      // Hiệu ứng: tác động lên khung hình ĐÃ GHÉP từ các track bên dưới, chỉ trong khoảng của clip.
      // Tách 1 nhánh, cắt đúng khoảng (đỡ tốn công xử lý phần còn lại), áp hiệu ứng, phủ lại lên.
      for (const clip of track.clips) {
        const def = clip.type === 'effect' ? findEffect(clip.effectId) : undefined
        if (!def) continue // mã hiệu ứng lạ (vd. từ phiên bản mới hơn) → bỏ qua
        const uid = `e${layerIndex}`
        const out = `o${layerIndex}`
        filters.push(`[${current}]split[${uid}keep][${uid}src]`)
        filters.push(`[${uid}src]trim=start=${sec(clip.start)}:end=${sec(clipEnd(clip))}[${uid}cut]`)
        filters.push(...effectStatements(def, `${uid}cut`, `${uid}fx0`, { W, H, fps, start: clip.start, uid }))
        // Lớp phủ vẽ (tim bay, lấp lánh…): các khung PNG đã vẽ sẵn, phủ lên sau cùng (giống thứ tự ở preview)
        const frames = hasOverlay(def) ? opts.textFrames?.get(clip.id) : undefined
        if (frames?.pattern && frames.count > 0) {
          inputArgs.push('-framerate', String(fps), '-start_number', '0', '-i', frames.pattern)
          filters.push(`[${inputCount++}:v]format=rgba,setpts=PTS-STARTPTS+${sec(clip.start)}/TB[${uid}ov]`)
          filters.push(`[${uid}fx0][${uid}ov]overlay=x=0:y=0:eof_action=pass:repeatlast=0[${uid}fx]`)
        } else {
          filters.push(`[${uid}fx0]null[${uid}fx]`)
        }
        filters.push(
          `[${uid}keep][${uid}fx]overlay=x=0:y=0:eof_action=pass:repeatlast=0:` +
            `enable='between(t,${sec(clip.start)},${sec(clipEnd(clip) - 1)})'[${out}]`
        )
        current = out
        layerIndex++
      }
      continue
    }
    for (const [clipIndex, clip] of track.clips.entries()) {
      if (clip.type === 'text') {
        // Chữ: [các khung hiệu ứng] + [ảnh tĩnh lặp lại] nối tiếp nhau, full khung hình, chồng ở góc 0,0
        const frames = opts.textFrames?.get(clip.id)
        if (!frames) continue
        const parts: string[] = []
        if (frames.pattern && frames.count > 0) {
          inputArgs.push('-framerate', String(fps), '-start_number', '0', '-i', frames.pattern)
          parts.push(`[${inputCount++}:v]`)
        }
        const animUs = Math.round((frames.count * MICROS_PER_SECOND) / fps)
        if (clip.duration - animUs > 0) {
          inputArgs.push('-loop', '1', '-framerate', String(fps), '-t', sec(clip.duration - animUs), '-i', frames.still)
          parts.push(`[${inputCount++}:v]`)
        }
        if (parts.length === 0) continue
        const layer = `v${layerIndex}`
        const out = `o${layerIndex}`
        const join = parts.length > 1 ? `concat=n=${parts.length}:v=1:a=0,` : ''
        filters.push(`${parts.join('')}${join}format=rgba,setpts=PTS-STARTPTS+${sec(clip.start)}/TB[${layer}]`)
        filters.push(
          `[${current}][${layer}]overlay=x=0:y=0:eof_action=pass:repeatlast=0:` +
            `enable='between(t,${sec(clip.start)},${sec(clipEnd(clip) - 1)})'[${out}]`
        )
        current = out
        layerIndex++
        continue
      }
      if (clip.type !== 'media' && clip.type !== 'sticker') continue
      const asset = project.assets[clip.assetId]
      if (!asset || asset.kind === 'audio') continue

      // Chuyển cảnh vào clip này (tin) và ra khỏi clip này (tout) – xem shared/timeline/transitions.ts
      const tin = transitionAt(project, track, clipIndex)
      const tout = transitionAt(project, track, clipIndex + 1)
      const extBefore = tin ? clip.start - tin.from : 0
      const extAfter = tout ? tout.to - clipEnd(clip) : 0
      const layerFrom = clip.start - extBefore
      const layerTo = clipEnd(clip) + extAfter

      const input = addInput({ clip, track, asset }, extBefore, extAfter)
      const srcW = asset.width ?? W
      const srcH = asset.height ?? H
      const speed = clip.type === 'media' ? clip.speed : 1
      const timing = [
        // Đưa mốc thời gian về 0, áp dụng tốc độ (nhanh gấp đôi = thời gian chia 2); uốn cong → công thức theo khúc
        clip.type === 'media' && clip.speedCurve
          ? curveSetpts(clip, input, extBefore)
          : speed === 1
            ? 'setpts=PTS-STARTPTS'
            : `setpts=(PTS-STARTPTS)/${speed}`,
        // File gốc không đủ phần trước/sau cho chuyển cảnh → giữ khung đầu / khung cuối
        ...(input.padStart > 0 ? [`tpad=start_mode=clone:start_duration=${sec(input.padStart)}`] : []),
        ...(extAfter > 0 ? [`tpad=stop_mode=clone:stop_duration=${sec(extAfter)}`] : [])
      ]
      // Chuyển cảnh làm méo điểm ảnh (gợn sóng, sóng sọc, khảm ô…): sau màu & mặt nạ, chỉ chạy trong khoảng chuyển cảnh
      const pixel = pixelTransitionFilters(tin, tout, layerTo - layerFrom)
      // Mờ dần / phóng to khi chuyển cảnh: độ mờ tăng 0 → 1 (thời gian cục bộ của lớp, bắt đầu từ 0)
      const fadeIn = tin && (tin.kind === 'fade' || tin.kind === 'zoom') ? [`fade=t=in:st=0:d=${sec(tin.duration)}:alpha=1`] : []

      if (hasKeyframes(clip) || (clip.type === 'media' && hasClipAnim(clip))) {
        // Có keyframe: kích thước/vị trí/xoay/độ mờ tính lại mỗi khung hình (xem animatedLayerFilters)
        const anim = animatedLayerFilters(clip, srcW, srcH, W, H, fps, extBefore)
        const colorFilters = clip.type === 'media' ? clipFfmpegFilters(clip) : []
        const mask = addMaskInput(clip, extBefore, extAfter)
        const chain = [
          ...timing,
          ...anim.size,
          ...colorFilters,
          ...pixel,
          ...fadeIn,
          ...anim.place,
          `setpts=PTS+${sec(layerFrom)}/TB`
        ]
        const layer = `v${layerIndex}`
        const out = `o${layerIndex}`
        filters.push(
          ...layerStatements(clip, `${input.index}:v`, chain, timing.length, layer, opts, asset, undefined, mask === null ? null : {
            label: mask,
            at: timing.length + anim.size.length + colorFilters.length
          })
        )
        filters.push(
          `[${current}][${layer}]overlay=x='${slideX(0, W, tin, tout)}':y=0:eof_action=pass:repeatlast=0:` +
            `enable='between(t,${sec(layerFrom)},${sec(layerTo - 1)})'[${out}]`
        )
        current = out
        layerIndex++
        continue
      }

      const p = placeLayer(srcW, srcH, W, H, clip.transform)
      const w = Math.max(2, Math.round(p.width))
      const h = Math.max(2, Math.round(p.height))
      const box = p.rotation !== 0 ? rotatedBox(w, h, p.rotation) : { w, h }
      let x = Math.round(p.cx - box.w / 2)
      let y = Math.round(p.cy - box.h / 2)

      // "Phóng to": phóng cả khung quanh tâm khung (zoompan) → cần đặt lớp lên khung trong suốt đủ cỡ
      // trước. Chỉ làm được khi lớp nằm gọn trong khung (trường hợp thường gặp); nếu không thì chỉ mờ dần.
      const fitsFrame = x >= 0 && y >= 0 && x + box.w <= W && y + box.h <= H
      const zoomIn = tin?.kind === 'zoom' && fitsFrame

      const colorFilters = clip.type === 'media' ? clipFfmpegFilters(clip) : []
      const mask = addMaskInput(clip, extBefore, extAfter)
      const chain = [
        ...timing,
        `scale=${w}:${h}:flags=bicubic`,
        'format=rgba',
        ...colorFilters,
        ...pixel,
        ...(p.rotation !== 0
          ? [`rotate=${p.rotation.toFixed(6)}:ow=rotw(${p.rotation.toFixed(6)}):oh=roth(${p.rotation.toFixed(6)}):c=none`]
          : []),
        ...(p.opacity < 1 ? [`colorchannelmixer=aa=${p.opacity.toFixed(4)}`] : []),
        ...fadeIn,
        ...(zoomIn
          ? [
              `pad=${W}:${H}:${x}:${y}:color=0x00000000`,
              `zoompan=z='1.2-0.2*clip(it/${sec(tin!.duration)},0,1)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${W}x${H}:fps=${fps}`
            ]
          : []),
        // Dời clip tới đúng vị trí trên timeline
        `setpts=PTS+${sec(layerFrom)}/TB`
      ]
      if (zoomIn) x = y = 0
      const layer = `v${layerIndex}`
      const out = `o${layerIndex}`
      // Chỉnh màu SAU khi thu về đúng cỡ hiển thị (h): nhanh hơn nhiều với video 4K, thông số tính theo tỉ lệ nên vẫn khớp preview
      filters.push(
        ...layerStatements(clip, `${input.index}:v`, chain, timing.length + 1, layer, opts, asset, h, mask === null ? null : {
          label: mask,
          at: timing.length + 2 + colorFilters.length
        })
      )
      // eof_action=pass: hết clip thì để lộ lớp bên dưới; enable: chỉ hiện trong khoảng của clip
      filters.push(
        `[${current}][${layer}]overlay=x='${slideX(x, W, tin, tout)}':y=${y}:eof_action=pass:repeatlast=0:` +
          `enable='between(t,${sec(layerFrom)},${sec(layerTo - 1)})'[${out}]`
      )
      current = out
      layerIndex++
    }
  }
  filters.push(`[${current}]format=${opts.pixelFormat}[vout]`)

  // Clip làm đẹp: file đã vẽ lại không có tiếng → tiếng đọc riêng từ file gốc
  const audioInput = (item: Item): InputInfo =>
    opts.beautyRenders?.has(item.clip.id) && item.clip.type === 'media' ? addDubInput(item.clip, item.asset) : addInput(item)
  filters.push(...audioMixStatements(project, D, audioInput, addDubInput))

  return {
    inputArgs,
    // Mỗi chuỗi lọc một dòng cho dễ đọc khi cần gỡ lỗi (FFmpeg chấp nhận ";" kèm xuống dòng)
    filterGraph: filters.join(';\n'),
    videoLabel: 'vout',
    audioLabel: 'aout',
    durationUs: D
  }
}

/**
 * Phần TIẾNG của lệnh xuất: mỗi clip có tiếng → cắt đúng đoạn, đổi tốc độ, âm lượng/fade, dời tới đúng chỗ,
 * rồi trộn tất cả thành nhãn [aout] dài đúng D. Dùng chung cho xuất video và cho Phụ đề tự động.
 */
function audioMixStatements(
  project: Project,
  D: Micros,
  addInput: (item: Item) => InputInfo,
  addDubInput: (clip: MediaClip, asset: MediaAsset) => InputInfo
): string[] {
  const filters: string[] = []
  const audioLabels: string[] = []
  for (const track of project.tracks) {
    if (track.muted) continue
    for (const clip of track.clips) {
      if (clip.type !== 'media') continue
      const volumeKf = keyframesOf(clip, 'volume')
      // Im lặng suốt clip → bỏ qua (có keyframe âm lượng > 0 thì vẫn phải xử lý)
      if (volumeKf.length > 0 ? volumeKf.every((k) => k.value <= 0) : clip.volume <= 0) continue
      // Video đã xử lý âm thanh (giảm ồn, đổi giọng…) → tiếng lấy từ file đã xử lý thay cho tiếng của video
      const dub = clip.audioAssetId ? project.assets[clip.audioAssetId] : undefined
      const asset = dub ?? project.assets[clip.assetId]
      if (!asset || asset.kind === 'image' || !asset.hasAudio) continue

      const input = dub ? addDubInput(clip, dub) : addInput({ clip, track, asset })
      const delayMs = Math.round(clip.start / 1000)
      const { fadeIn, fadeOut } = effectiveFades(clip)
      let source = `[${input.index}:a]`
      if (clip.speedCurve) {
        // Uốn cong: chia đoạn gốc thành nhiều khúc, mỗi khúc một tốc độ (atempo giữ cao độ), rồi nối lại
        const label = `c${audioLabels.length}`
        filters.push(...curveAudio(clip, `${input.index}:a`, input.sourceOffset, label))
        source = `[${label}]`
      }
      const chain = [
        // Đầu vào có thể đọc dư phần trước/sau (cho chuyển cảnh hình) → tiếng chỉ lấy đúng đoạn của clip
        ...(clip.speedCurve
          ? ['aformat=sample_rates=48000:channel_layouts=stereo']
          : [
              `atrim=start=${sec(input.sourceOffset)}:duration=${sec(sourceSpanOf(clip))}`,
              'asetpts=PTS-STARTPTS',
              'aformat=sample_rates=48000:channel_layouts=stereo',
              ...atempoChain(clip.speed)
            ]),
        // Âm lượng: có keyframe → tính lại mỗi khung âm thanh ("t" = giây tính từ đầu clip, giống volumeAt)
        ...(volumeKf.length > 0
          ? [`volume='${ffmpegValueExpr(clip, 'volume', 't')}':eval=frame`]
          : clip.volume !== 1
            ? [`volume=${clip.volume}`]
            : []),
        // Fade tuyến tính (curve=tri), tính theo thời gian của clip sau khi đổi tốc độ – giống clipGainAt
        ...(fadeIn > 0 ? [`afade=t=in:st=0:d=${sec(fadeIn)}:curve=tri`] : []),
        ...(fadeOut > 0 ? [`afade=t=out:st=${sec(clip.duration - fadeOut)}:d=${sec(fadeOut)}:curve=tri`] : []),
        // Dời tiếng tới đúng vị trí; all=1 áp dụng cho mọi kênh
        `adelay=${delayMs}:all=1`
      ]
      const label = `a${audioLabels.length}`
      filters.push(`${source}${chain.join(',')}[${label}]`)
      audioLabels.push(label)
    }
  }

  // Trộn mọi nguồn tiếng (không tự giảm âm lượng – normalize=0), rồi cắt/đệm cho đúng độ dài dự án
  const finish = `apad=whole_dur=${sec(D)},atrim=0:${sec(D)}[aout]`
  if (audioLabels.length === 0) {
    filters.push(`anullsrc=r=48000:cl=stereo,${finish}`)
  } else if (audioLabels.length === 1) {
    filters.push(`[${audioLabels[0]}]${finish}`)
  } else {
    filters.push(
      `${audioLabels.map((l) => `[${l}]`).join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0:dropout_transition=0,${finish}`
    )
  }

  return filters
}

/**
 * Chỉ trộn TIẾNG của cả timeline (không dựng hình) – dùng cho Phụ đề tự động.
 * Mỗi clip đọc đúng đoạn cắt của nó; kết quả là nhãn [aout] dài đúng thời lượng dự án.
 */
export function buildAudioMixGraph(project: Project): Omit<ExportGraph, 'videoLabel'> {
  const D = projectDuration(project)
  const inputArgs: string[] = []
  let inputCount = 0
  const read = (clip: MediaClip, asset: MediaAsset): InputInfo => {
    inputArgs.push('-ss', sec(clip.sourceIn), '-t', sec(sourceSpanOf(clip)), '-i', asset.path)
    return { index: inputCount++, sourceOffset: 0, padStart: 0 }
  }
  const filters = audioMixStatements(project, D, ({ clip, asset }) => read(clip as MediaClip, asset), read)
  return { inputArgs, filterGraph: filters.join(';\n'), audioLabel: 'aout', durationUs: D }
}

// ───────── Uốn cong tốc độ ─────────

/** Số khúc khi xuất: hình đổi tốc độ theo 48 khúc (gần như liên tục), tiếng 24 khúc (mỗi khúc 1 atempo). */
const CURVE_VIDEO_SEGMENTS = 48
const CURVE_AUDIO_SEGMENTS = 24

/**
 * setpts cho clip uốn cong: thời gian khung hình trong lớp = thời gian đi tới vị trí đó trong file gốc
 * (cộng từng khúc: độ dài khúc ÷ tốc độ khúc). Ngoài đoạn clip (phần dư cho chuyển cảnh): tốc độ 2 đầu.
 * Kết quả khớp với preview (cùng đường cong, cùng bảng tích lũy).
 */
function curveSetpts(clip: MediaClip, input: InputInfo, extBefore: Micros): string {
  const curve = clip.speedCurve!
  const S = sourceSpanOf(clip) / MICROS_PER_SECOND
  const v0 = curveSpeedAt(curve, 0)
  const v1 = curveSpeedAt(curve, 1)
  // X = vị trí trong file gốc tính từ sourceIn (giây)
  const X = `((PTS-STARTPTS)*TB-${sec(input.sourceOffset)})`
  const parts = [`min(${X},0)/${v0.toFixed(6)}`]
  for (const seg of curveSegments(curve, CURVE_VIDEO_SEGMENTS)) {
    const a = (seg.x0 * S).toFixed(6)
    const w = ((seg.x1 - seg.x0) * S).toFixed(6)
    parts.push(`clip(${X}-${a},0,${w})/${seg.speed.toFixed(6)}`)
  }
  parts.push(`max(${X}-${S.toFixed(6)},0)/${v1.toFixed(6)}`)
  // Lớp bắt đầu sớm extBefore (chuyển cảnh); tpad phía sau thêm padStart nên trừ ra ở đây
  const shift = (extBefore - input.padStart) / MICROS_PER_SECOND
  return `setpts='(${parts.join('+')}+${shift.toFixed(6)})/TB'`
}

/** Tiếng của clip uốn cong: tách khúc → atempo từng khúc → nối. Trả về các chuỗi lọc, đầu ra [label]. */
function curveAudio(clip: MediaClip, inLabel: string, sourceOffset: Micros, label: string): string[] {
  const curve = clip.speedCurve!
  const S = sourceSpanOf(clip)
  const segs = curveSegments(curve, CURVE_AUDIO_SEGMENTS)
  const out: string[] = [`[${inLabel}]asplit=${segs.length}${segs.map((_, k) => `[${label}s${k}]`).join('')}`]
  segs.forEach((seg, k) => {
    const start = sourceOffset + seg.x0 * S
    const dur = (seg.x1 - seg.x0) * S
    out.push(
      `[${label}s${k}]atrim=start=${sec(Math.round(start))}:duration=${sec(Math.round(dur))},asetpts=PTS-STARTPTS,` +
        `aformat=sample_rates=48000:channel_layouts=stereo,${atempoChain(seg.speed).join(',') || 'anull'}[${label}p${k}]`
    )
  })
  out.push(`${segs.map((_, k) => `[${label}p${k}]`).join('')}concat=n=${segs.length}:v=0:a=1[${label}]`)
  return out
}

// ───────── Điều chỉnh màu ─────────

/**
 * Chuỗi lọc của một lớp hình; clip có Điều chỉnh màu thì chèn phần màu NGAY SAU phần thời gian
 * (áp lên khung hình gốc, trước khi thu phóng / xoay – giống thứ tự của preview).
 * @param timingCount số bộ lọc đứng trước phần màu ở đầu `chain` (thời gian, có thể kèm bước thu phóng)
 * @param scaledHeight chiều cao khung tại chỗ chèn (khi đã thu về cỡ hiển thị)
 */
function layerStatements(
  clip: Clip,
  inLabel: string,
  chain: string[],
  timingCount: number,
  out: string,
  opts: GraphOptions,
  asset: MediaAsset,
  scaledHeight?: number,
  mask?: { label: string; at: number } | null
): string[] {
  const statements: string[] = []
  let cur = inLabel
  let rest = chain
  let maskAt = mask?.at ?? 0
  // Điều chỉnh màu: chèn sau phần thời gian (và bước thu phóng nếu có)
  const grade = clip.type === 'media' ? clip.grade : null
  if (grade && !isGradeEmpty(grade)) {
    const frameH = scaledHeight ?? opts.beautyRenders?.get(clip.id)?.height ?? asset.height ?? 1080
    const g = gradeStatements(inLabel, chain.slice(0, timingCount), grade, opts.gradeLuts?.get(clip.id) ?? null, frameH, `g${out}`)
    statements.push(...g.statements)
    cur = g.out
    rest = chain.slice(timingCount)
    maskAt -= timingCount
  }
  // Mặt nạ: ảnh xám co giãn theo lớp hình (scale2ref) rồi làm kênh trong suốt (alphamerge),
  // chèn sau bước màu – trước xoay / độ mờ / chuyển cảnh (giống thứ tự của preview)
  if (mask) {
    const pre = rest.slice(0, maskAt)
    statements.push(`[${cur}]${[...pre, 'format=rgba'].join(',')}[${out}mp]`)
    statements.push(`[${mask.label}]format=gray[${out}mg]`)
    statements.push(`[${out}mg][${out}mp]scale2ref[${out}mk][${out}mr]`)
    statements.push(`[${out}mr][${out}mk]alphamerge[${out}ma]`)
    cur = `${out}ma`
    rest = rest.slice(maskAt)
  }
  statements.push(`[${cur}]${rest.join(',') || 'null'}[${out}]`)
  return statements
}

/**
 * Điều chỉnh màu bằng FFmpeg, cùng thứ tự với preview (renderer/src/engine/grade/GradeRenderer.ts):
 * làm mờ → làm sắc nét → độ rõ nét (A + k·(A − mờ(A)), từng bước) → bảng màu 3D → hạt nhỏ → viền mờ dần.
 * Làm trên RGB (gbrp) để công thức giống hệt shader.
 */
export function gradeStatements(
  inLabel: string,
  timing: string[],
  grade: ColorGrade,
  lutFile: string | null,
  frameH: number,
  uid: string
): { statements: string[]; out: string } {
  const sp = spatialParams(grade)
  const sigma = (rel: number): string => Math.max(0.3, rel * frameH).toFixed(3)
  const statements: string[] = []
  let cur = inLabel
  let chain = [...timing, 'format=gbrp']
  let n = 0
  const flush = (): void => {
    const label = `${uid}s${n++}`
    statements.push(`[${cur}]${chain.join(',') || 'null'}[${label}]`)
    cur = label
    chain = []
  }
  if (sp.blurSigma > 0) chain.push(`gblur=sigma=${sigma(sp.blurSigma)}`)
  for (const [amount, rel] of [
    [sp.sharpenAmount, sp.sharpenSigma],
    [sp.clarityAmount, sp.claritySigma]
  ]) {
    if (amount <= 0) continue
    flush()
    const a = `${uid}a${n}`
    const b = `${uid}b${n}`
    const c = `${uid}c${n}`
    statements.push(`[${cur}]split[${a}][${b}]`, `[${b}]gblur=sigma=${sigma(rel)}[${c}]`)
    const label = `${uid}u${n++}`
    statements.push(`[${a}][${c}]blend=all_expr='clip(A+(A-B)*${amount.toFixed(4)},0,255)'[${label}]`)
    cur = label
  }
  if (lutFile && hasColorChanges(grade)) chain.push(`lut3d=file=${lutFile}:interp=trilinear`)
  if (sp.grain > 0) chain.push(`noise=alls=${Math.max(1, Math.round(sp.grain * 255))}:allf=t+u`)
  if (sp.vignette !== 0) chain.push(`vignette=angle=${Math.abs(sp.vignette).toFixed(4)}:mode=${sp.vignette > 0 ? 'forward' : 'backward'}:eval=init`)
  flush()
  return { statements, out: cur }
}
