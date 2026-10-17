// Đưa phụ đề đã nhận dạng lên timeline: mỗi câu = 1 clip chữ trên một track chữ riêng.
import * as ops from '../project/ops'
import type { Id, Project, TextClip, TextStyle } from '../project/schema'
import { createTextClip, defaultTextStyle } from '../timeline/clips'
import type { Caption } from './captions'

/** Kiểu chữ phụ đề giống CapCut: chữ trắng đậm, viền đen, nằm gần đáy khung hình. */
export function captionStyle(): TextStyle {
  return { ...defaultTextStyle(), fontSize: 64, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 5 }
}
/** Vị trí dọc của phụ đề (0 = mép trên, 1 = mép dưới). */
export const CAPTION_Y = 0.84
/** Mỗi dòng tối đa bấy nhiêu ký tự, mỗi màn hình tối đa bấy nhiêu dòng (chữ không tự xuống dòng). */
export const CAPTION_MAX_CHARS = 32
export const CAPTION_MAX_LINES = 2

/**
 * Câu dài → chia dòng tại khoảng trắng; quá số dòng thì tách thành nhiều phụ đề nối tiếp,
 * thời gian chia theo số ký tự (đọc nhanh/chậm đều nhau).
 */
export function splitForScreen(c: Caption, maxChars = CAPTION_MAX_CHARS, maxLines = CAPTION_MAX_LINES): Caption[] {
  const lines: string[] = []
  for (const word of c.text.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1]
    if (last !== undefined && last.length + 1 + word.length <= maxChars) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  if (lines.length === 0) return []
  const screens: string[][] = []
  for (let i = 0; i < lines.length; i += maxLines) screens.push(lines.slice(i, i + maxLines))
  const total = screens.reduce((n, s) => n + s.join(' ').length, 0)
  const out: Caption[] = []
  let at = c.start
  screens.forEach((s, i) => {
    const end = i === screens.length - 1 ? c.end : Math.round(at + ((c.end - c.start) * s.join(' ').length) / total)
    out.push({ start: at, end, text: s.join('\n') })
    at = end
  })
  return out
}

export interface ApplyCaptionsOptions {
  /** Xóa các phụ đề tự động đã tạo trước đó (chữ người dùng tự thêm thì giữ). */
  replace: boolean
  /** Tên track phụ đề (theo ngôn ngữ giao diện). */
  trackName: string
}

/**
 * Thêm phụ đề lên một track chữ MỚI ở trên cùng (không đụng tới chữ đang có).
 * @returns id track phụ đề (null nếu không có câu nào) và id các clip mới
 */
export function applyCaptions(draft: Project, captions: Caption[], opts: ApplyCaptionsOptions): { trackId: Id | null; clipIds: Id[] } {
  if (opts.replace) {
    for (const track of draft.tracks) {
      if (track.locked || track.kind !== 'text') continue
      track.clips = track.clips.filter((c) => !(c.type === 'text' && c.caption))
    }
    // Track chữ trống sau khi xóa → bỏ luôn (giống khi xóa hết chữ bằng tay)
    draft.tracks = draft.tracks.filter((t) => t.kind !== 'text' || t.clips.length > 0 || t.locked)
  }
  const pieces = captions.flatMap((c) => splitForScreen(c))
  if (pieces.length === 0) return { trackId: null, clipIds: [] }

  const trackId = ops.addTrack(draft, 'text')
  const track = draft.tracks.find((t) => t.id === trackId)!
  track.name = opts.trackName
  const clipIds: Id[] = []
  pieces.forEach((p, i) => {
    const base = createTextClip(p.start, p.text)
    // Không chồng lên phụ đề kế tiếp (track chữ không cho clip chồng nhau)
    const limit = pieces[i + 1]?.start ?? Number.POSITIVE_INFINITY
    const clip: TextClip = {
      ...base,
      start: p.start,
      duration: Math.max(1, Math.min(limit, p.end) - p.start),
      style: captionStyle(),
      transform: { ...base.transform, y: CAPTION_Y },
      caption: true
    }
    ops.addClip(draft, trackId, clip)
    clipIds.push(clip.id)
  })
  return { trackId, clipIds }
}
