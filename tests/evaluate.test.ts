import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset } from '@shared/project/schema'
import { colorFilter, placeLayer } from '@shared/render/geometry'
import { createMediaClip } from '@shared/timeline/clips'
import { sourceTimeAt, timedClipsBetween, visualLayersAt } from '@shared/timeline/evaluate'

const S = 1_000_000
const asset = (id: string, kind: MediaAsset['kind'], sec: number): MediaAsset => ({
  id, kind, path: id, name: id, durationUs: sec * S, width: 1920, height: 1080, fps: 30, hasAudio: kind !== 'image'
})

/** Video chính [0–10s], ảnh phủ [2–5s] trên track phía trên, nhạc [0–30s]. */
function setup() {
  const p = createEmptyProject('t')
  p.assets.v = asset('v', 'video', 10)
  p.assets.i = asset('i', 'image', 0)
  p.assets.m = asset('m', 'audio', 30)
  const main = p.tracks[0].id
  const overlay = ops.addTrack(p, 'video')
  const music = ops.addTrack(p, 'audio')
  ops.addClip(p, main, { ...createMediaClip(p.assets.v, 0), id: 'V', sourceIn: 1 * S, speed: 2, duration: 4 * S })
  ops.addClip(p, overlay, { ...createMediaClip(p.assets.i, 2 * S), id: 'I' })
  ops.addClip(p, music, { ...createMediaClip(p.assets.m, 0), id: 'M' })
  return { p, main, overlay, music }
}

describe('evaluate', () => {
  it('lớp hình xếp từ dưới lên trên, bỏ qua track âm thanh', () => {
    const { p } = setup()
    expect(visualLayersAt(p, 3 * S).map((l) => l.clip.id)).toEqual(['V', 'I'])
    expect(visualLayersAt(p, 1 * S).map((l) => l.clip.id)).toEqual(['V'])
    expect(visualLayersAt(p, 5 * S).map((l) => l.clip.id)).toEqual([]) // V hết ở 4s, I hết ở 5s (không tính cuối)
  })

  it('track ẩn không hiện hình', () => {
    const { p, overlay } = setup()
    p.tracks.find((t) => t.id === overlay)!.hidden = true
    expect(visualLayersAt(p, 3 * S).map((l) => l.clip.id)).toEqual(['V'])
  })

  it('vị trí trong file gốc tính cả điểm bắt đầu và tốc độ', () => {
    const { p } = setup()
    const v = p.tracks.find((t) => t.clips[0]?.id === 'V')!.clips[0]
    if (v.type !== 'media') throw new Error()
    // sourceIn 1s + 1.5s × tốc độ 2 = 4s
    expect(sourceTimeAt(v, 1.5 * S)).toBe(4 * S)
    expect(visualLayersAt(p, 1.5 * S)[0].sourceTime).toBe(4 * S)
  })

  it('clip video/âm thanh trong một khoảng (bỏ qua ảnh tĩnh)', () => {
    const { p } = setup()
    expect(timedClipsBetween(p, 3 * S, 3 * S).map((c) => c.clip.id).sort()).toEqual(['M', 'V'])
    expect(timedClipsBetween(p, 4 * S, 6 * S).map((c) => c.clip.id)).toEqual(['M'])
  })
})

describe('geometry', () => {
  it('video ngang trong khung dọc: vừa chiều rộng, giữ tỉ lệ', () => {
    const t = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 }
    expect(placeLayer(1920, 1080, 1080, 1920, t)).toMatchObject({ cx: 540, cy: 960, width: 1080, height: 607.5 })
    expect(placeLayer(1920, 1080, 1920, 1080, { ...t, scale: 2, rotation: 90 })).toMatchObject({
      width: 3840,
      height: 2160,
      rotation: Math.PI / 2
    })
  })

  it('bộ lọc màu', () => {
    expect(colorFilter({ brightness: 0, contrast: 0, saturation: 0 })).toBe('none')
    expect(colorFilter({ brightness: 20, contrast: -50, saturation: 0 })).toBe('brightness(1.2) contrast(0.5)')
  })
})
