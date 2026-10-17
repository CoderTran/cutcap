// Lệnh "Hiệu ứng động" của clip video/ảnh: chọn hiệu ứng Vào / Ra / Kết hợp, đổi thời lượng.
import type { Id, MediaClip } from '@shared/project/schema'
import type { Micros } from '@shared/project/time'
import { DEFAULT_ANIM_DURATION, type AnimKind } from '@shared/render/clipAnims'
import { clipEnd, findClip } from '@shared/timeline/clips'
import { playRange } from './playbackActions'
import { projectStore } from './projectStore'

const FIELD = { in: 'animIn', out: 'animOut', combo: 'animCombo' } as const

/** Thời lượng tối thiểu / tối đa của hiệu ứng động. */
export const MIN_ANIM_US = 100_000
export function maxAnimUs(clip: MediaClip, kind: AnimKind): Micros {
  // Vào + Ra không được dài hơn clip; Kết hợp: phần vào tối đa bằng clip trừ phần ra
  if (kind === 'combo') return Math.max(MIN_ANIM_US, clip.duration - (clip.animCombo?.outDuration ?? clip.animCombo?.duration ?? 0))
  const other = kind === 'in' ? clip.animOut : clip.animIn
  return Math.max(MIN_ANIM_US, clip.duration - (other?.duration ?? 0))
}

/**
 * Chọn hiệu ứng động (id = null: bỏ). Chọn Kết hợp thì bỏ Vào/Ra và ngược lại (giống CapCut).
 * Xong thì phát thử đúng đoạn có hiệu ứng để xem ngay.
 */
export function setClipAnim(clipId: Id, kind: AnimKind, id: string | null): void {
  const preview: { start: Micros; duration: Micros }[] = []
  projectStore.getState().apply('history.clipAnim', (d) => {
    const found = findClip(d, clipId)
    if (found?.clip.type !== 'media' || found.track.locked) return
    const clip = found.clip
    const field = FIELD[kind]
    if (id === null) {
      clip[field] = null
      return
    }
    const previous = clip[field]
    const wanted = previous?.duration ?? Math.min(DEFAULT_ANIM_DURATION[kind], clip.duration)
    if (kind === 'combo') {
      clip.animIn = null
      clip.animOut = null
    } else {
      clip.animCombo = null
    }
    if (kind === 'combo') {
      // Kết hợp: giữ thời lượng 2 đầu đã chỉnh (nếu có), mặc định mỗi đầu 0.5s, tổng không quá clip
      const inUs = Math.max(MIN_ANIM_US, Math.min(wanted, clip.duration / 2))
      const outUs = Math.max(MIN_ANIM_US, Math.min(previous?.outDuration ?? wanted, clip.duration - inUs))
      clip.animCombo = { id, duration: Math.round(inUs), outDuration: Math.round(outUs) }
    } else {
      clip[field] = { id, duration: Math.max(MIN_ANIM_US, Math.min(wanted, maxAnimUs(clip, kind))) }
    }
    const dur = clip[field]!.duration
    // Phát thử: Vào → đầu clip; Ra → cuối clip; Kết hợp → cả clip (thấy cả vào lẫn ra)
    // (Kết hợp: clip ngắn thì phát cả clip để thấy cả vào lẫn ra; clip dài chỉ phát đoạn vào)
    preview.push(
      kind === 'out'
        ? { start: clipEnd(clip) - dur, duration: dur }
        : { start: clip.start, duration: kind === 'combo' && clip.duration <= 6_000_000 ? clip.duration : dur }
    )
  })
  if (preview[0]) playRange(preview[0].start, preview[0].duration)
}

/**
 * Thanh thời lượng 2 đầu của Kết hợp: inUs = phần vào (từ đầu clip), outUs = phần ra (tính từ cuối clip).
 * Tổng không vượt độ dài clip; mỗi phần tối thiểu MIN_ANIM_US.
 */
export function setComboDurations(clipId: Id, inUs: Micros, outUs: Micros, session?: string): void {
  projectStore.getState().apply(
    'history.clipAnimDuration',
    (d) => {
      const found = findClip(d, clipId)
      if (found?.clip.type !== 'media' || found.track.locked || !found.clip.animCombo) return
      const D = found.clip.duration
      const a = Math.round(Math.max(MIN_ANIM_US, Math.min(inUs, D - MIN_ANIM_US)))
      const b = Math.round(Math.max(MIN_ANIM_US, Math.min(outUs, D - a)))
      found.clip.animCombo.duration = a
      found.clip.animCombo.outDuration = b
    },
    session ? { coalesceKey: session } : undefined
  )
}

export function setClipAnimDuration(clipId: Id, kind: AnimKind, duration: Micros, session?: string): void {
  projectStore.getState().apply(
    'history.clipAnimDuration',
    (d) => {
      const found = findClip(d, clipId)
      if (found?.clip.type !== 'media' || found.track.locked) return
      const anim = found.clip[FIELD[kind]]
      if (anim) anim.duration = Math.round(Math.max(MIN_ANIM_US, Math.min(duration, maxAnimUs(found.clip, kind))))
    },
    session ? { coalesceKey: session } : undefined
  )
}
