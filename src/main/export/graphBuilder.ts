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
import type { Clip, MediaAsset, Project, Track } from '@shared/project/schema'
import { MICROS_PER_SECOND, type Micros } from '@shared/project/time'
import { clipFfmpegFilters } from '@shared/render/filters'
import { placeLayer } from '@shared/render/geometry'
import { clipEnd, projectDuration } from '@shared/timeline/clips'
import { effectiveFades } from '@shared/timeline/clipProps'
import { transitionAt, type ActiveTransition } from '@shared/timeline/transitions'

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
}

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
    if (asset.kind === 'image') {
      // Ảnh tĩnh: lặp 1 ảnh thành video dài đúng thời lượng hiện trên màn hình
      inputArgs.push('-loop', '1', '-framerate', String(fps), '-t', sec(clip.duration + extBefore + extAfter), '-i', asset.path)
    } else if (clip.type === 'media') {
      // Muốn đọc từ sớm hơn điểm cắt (cho chuyển cảnh); file không đủ thì đọc từ 0 và "giữ khung đầu" phần thiếu
      const wanted = clip.sourceIn - extBefore * clip.speed
      const start = Math.max(0, wanted)
      const readDuration = Math.round((clip.duration + extBefore + extAfter) * clip.speed - (start - wanted))
      // -ss đặt TRƯỚC -i: nhảy nhanh tới điểm cắt; -t: chỉ đọc đúng đoạn cần (đã nhân tốc độ)
      inputArgs.push('-ss', sec(start), '-t', sec(readDuration), '-i', asset.path)
      info = { index: inputCount, sourceOffset: clip.sourceIn - start, padStart: Math.round((start - wanted) / clip.speed) }
    } else {
      inputArgs.push('-i', asset.path) // sticker (Bước sau)
    }
    inputOf.set(clip.id, info)
    inputCount++
    return info
  }

  // ───────── HÌNH ─────────
  filters.push(`color=c=${ffColor(project.settings.backgroundColor)}:s=${W}x${H}:r=${fps}:d=${sec(D)},format=yuv420p[base]`)
  let current = 'base'
  let layerIndex = 0

  // Track cuối danh sách nằm dưới cùng → vẽ trước
  for (let ti = project.tracks.length - 1; ti >= 0; ti--) {
    const track = project.tracks[ti]
    if (track.hidden || track.kind === 'audio') continue
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
      const p = placeLayer(srcW, srcH, W, H, clip.transform)
      const w = Math.max(2, Math.round(p.width))
      const h = Math.max(2, Math.round(p.height))
      const box = p.rotation !== 0 ? rotatedBox(w, h, p.rotation) : { w, h }
      let x = Math.round(p.cx - box.w / 2)
      let y = Math.round(p.cy - box.h / 2)
      const speed = clip.type === 'media' ? clip.speed : 1

      // "Phóng to": phóng cả khung quanh tâm khung (zoompan) → cần đặt lớp lên khung trong suốt đủ cỡ
      // trước. Chỉ làm được khi lớp nằm gọn trong khung (trường hợp thường gặp); nếu không thì chỉ mờ dần.
      const fitsFrame = x >= 0 && y >= 0 && x + box.w <= W && y + box.h <= H
      const zoomIn = tin?.kind === 'zoom' && fitsFrame

      const chain = [
        // Đưa mốc thời gian về 0, áp dụng tốc độ (nhanh gấp đôi = thời gian chia 2)
        speed === 1 ? 'setpts=PTS-STARTPTS' : `setpts=(PTS-STARTPTS)/${speed}`,
        // File gốc không đủ phần trước/sau cho chuyển cảnh → giữ khung đầu / khung cuối
        ...(input.padStart > 0 ? [`tpad=start_mode=clone:start_duration=${sec(input.padStart)}`] : []),
        ...(extAfter > 0 ? [`tpad=stop_mode=clone:stop_duration=${sec(extAfter)}`] : []),
        `scale=${w}:${h}:flags=bicubic`,
        'format=rgba',
        ...(clip.type === 'media' ? clipFfmpegFilters(clip) : []),
        ...(p.rotation !== 0 ? [`rotate=${p.rotation.toFixed(6)}:ow=rotw(${p.rotation.toFixed(6)}):oh=roth(${p.rotation.toFixed(6)}):c=none`] : []),
        ...(p.opacity < 1 ? [`colorchannelmixer=aa=${p.opacity.toFixed(4)}`] : []),
        // Mờ dần / phóng to: độ mờ tăng tuyến tính 0 → 1 trong lúc chuyển cảnh (thời gian cục bộ của lớp, bắt đầu từ 0)
        ...(tin && (tin.kind === 'fade' || tin.kind === 'zoom') ? [`fade=t=in:st=0:d=${sec(tin.duration)}:alpha=1`] : []),
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
      filters.push(`[${input.index}:v]${chain.join(',')}[${layer}]`)
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

  // ───────── TIẾNG ─────────
  const audioLabels: string[] = []
  for (const track of project.tracks) {
    if (track.muted) continue
    for (const clip of track.clips) {
      if (clip.type !== 'media' || clip.volume <= 0) continue
      const asset = project.assets[clip.assetId]
      if (!asset || asset.kind === 'image' || !asset.hasAudio) continue

      const input = addInput({ clip, track, asset })
      const delayMs = Math.round(clip.start / 1000)
      const { fadeIn, fadeOut } = effectiveFades(clip)
      const chain = [
        // Đầu vào có thể đọc dư phần trước/sau (cho chuyển cảnh hình) → tiếng chỉ lấy đúng đoạn của clip
        `atrim=start=${sec(input.sourceOffset)}:duration=${sec(Math.round(clip.duration * clip.speed))}`,
        'asetpts=PTS-STARTPTS',
        'aformat=sample_rates=48000:channel_layouts=stereo',
        ...atempoChain(clip.speed),
        ...(clip.volume !== 1 ? [`volume=${clip.volume}`] : []),
        // Fade tuyến tính (curve=tri), tính theo thời gian của clip sau khi đổi tốc độ – giống clipGainAt
        ...(fadeIn > 0 ? [`afade=t=in:st=0:d=${sec(fadeIn)}:curve=tri`] : []),
        ...(fadeOut > 0 ? [`afade=t=out:st=${sec(clip.duration - fadeOut)}:d=${sec(fadeOut)}:curve=tri`] : []),
        // Dời tiếng tới đúng vị trí; all=1 áp dụng cho mọi kênh
        `adelay=${delayMs}:all=1`
      ]
      const label = `a${audioLabels.length}`
      filters.push(`[${input.index}:a]${chain.join(',')}[${label}]`)
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

  return {
    inputArgs,
    // Mỗi chuỗi lọc một dòng cho dễ đọc khi cần gỡ lỗi (FFmpeg chấp nhận ";" kèm xuống dòng)
    filterGraph: filters.join(';\n'),
    videoLabel: 'vout',
    audioLabel: 'aout',
    durationUs: D
  }
}
