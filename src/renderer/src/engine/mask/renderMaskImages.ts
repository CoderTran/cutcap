// Trước khi xuất: vẽ ảnh mặt nạ của mọi clip có mặt nạ (đúng hàm vẽ của khung Xem trước).
// Mặt nạ có keyframe → chuỗi ảnh, mỗi khung hình một ảnh (kể cả phần kéo dài cho chuyển cảnh).
import type { MaskImages } from '@shared/ipc'
import type { Project } from '@shared/project/schema'
import { MICROS_PER_SECOND } from '@shared/project/time'
import { clipEnd } from '@shared/timeline/clips'
import { hasKeyframes, maskAt, MASK_PROPS } from '@shared/timeline/keyframes'
import { MAX_TRANSITION } from '@shared/timeline/transitions'
import { maskPng } from './drawMask'

/** Ảnh mặt nạ tĩnh vẽ ở cỡ này (cạnh dài); chuỗi ảnh nhỏ hơn cho nhẹ – mép mờ tính theo tỉ lệ nên vẫn khớp. */
const STILL_SIDE = 1920
const ANIMATED_SIDE = 1280

export async function renderMaskImages(project: Project, fps: number): Promise<MaskImages[]> {
  const out: MaskImages[] = []
  for (const track of project.tracks) {
    if (track.hidden || track.kind === 'audio') continue
    for (const clip of track.clips) {
      if (clip.type !== 'media' || !clip.mask) continue
      const asset = project.assets[clip.assetId]
      if (!asset?.width || !asset.height) continue
      const animated = hasKeyframes(clip, MASK_PROPS)
      const k = Math.min(1, (animated ? ANIMATED_SIDE : STILL_SIDE) / Math.max(asset.width, asset.height))
      const w = Math.round(asset.width * k)
      const h = Math.round(asset.height * k)
      if (!animated) {
        out.push({ clipId: clip.id, png: await maskPng(clip.mask, w, h) })
        continue
      }
      const startUs = Math.max(0, clip.start - MAX_TRANSITION)
      const endUs = clipEnd(clip) + MAX_TRANSITION
      const count = Math.ceil(((endUs - startUs) / MICROS_PER_SECOND) * fps)
      const frames: Uint8Array[] = []
      for (let i = 0; i < count; i++) {
        const t = startUs + Math.round((i * MICROS_PER_SECOND) / fps)
        frames.push(await maskPng(maskAt(clip, t)!, w, h))
      }
      out.push({ clipId: clip.id, frames, startUs, fps })
    }
  }
  return out
}
