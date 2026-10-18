import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset } from '@shared/project/schema'
import { createEffectClip, createMediaClip, createTextClip, findClip } from '@shared/timeline/clips'
import { PREVIEW_ID, withTilePreview } from '@shared/timeline/tilePreview'

const S = 1_000_000

describe('xem thử khi chọn ô', () => {
  it('hiệu ứng: thêm track tạm trên cùng, clip dời để lặp tại đầu phát; dự án gốc không đổi', () => {
    const p = createEmptyProject('t')
    const clip = createEffectClip(0, 'flash')
    const at = (elapsed: number) => withTilePreview(p, { kind: 'clip', clip }, 10 * S, elapsed)
    const a = at(1 * S)
    expect(a.tracks[0].id).toBe(PREVIEW_ID)
    expect(a.tracks[0].clips[0].start).toBe(9 * S) // đang ở giây 1 của hiệu ứng
    expect(at(clip.duration + 0.5 * S).tracks[0].clips[0].start).toBe(9.5 * S) // vòng lặp
    expect(p.tracks).toHaveLength(1)
  })

  it('chữ không có hiệu ứng xuất hiện: đứng yên tại đầu phát', () => {
    const p = createEmptyProject('t')
    const clip = createTextClip(0, 'Xin chào')
    expect(withTilePreview(p, { kind: 'clip', clip }, 2 * S, 5 * S).tracks[0].clips[0].start).toBe(2 * S)
  })

  it('chuyển cảnh: chỉ gắn tạm vào clip sau mối cắt', () => {
    const p = createEmptyProject('t')
    const v: MediaAsset = {
      id: 'v',
      kind: 'video',
      path: 'v',
      name: 'v',
      durationUs: 60 * S,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true
    }
    ops.addAssets(p, [v])
    ops.addClip(p, p.tracks[0].id, { ...createMediaClip(v, 0), id: 'A', duration: 4 * S })
    ops.addClip(p, p.tracks[0].id, { ...createMediaClip(v, 4 * S), id: 'B', duration: 4 * S })
    const tmp = withTilePreview(p, { kind: 'transition', clipId: 'B', transition: { kind: 'fade', duration: S } }, 0, 0)
    const b = findClip(tmp, 'B')!.clip
    expect(b.type === 'media' && b.transitionIn).toEqual({ kind: 'fade', duration: S })
    const orig = findClip(p, 'B')!.clip
    expect(orig.type === 'media' && orig.transitionIn).toBeNull()
  })
})
