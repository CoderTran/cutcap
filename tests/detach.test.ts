import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset, MediaClip, Project } from '@shared/project/schema'
import { createMediaClip, findClip } from '@shared/timeline/clips'
import { applyVocalRemoval, canDetachAudio, canRemoveVocals, canRestoreVocals, detachAudio, restoreVocals } from '@shared/timeline/detach'

const S = 1_000_000

const asset = (id: string, kind: MediaAsset['kind'], hasAudio = true): MediaAsset => ({
  id,
  kind,
  path: `C:\\media\\${id}`,
  name: id,
  durationUs: 20 * S,
  width: kind === 'audio' ? null : 1920,
  height: kind === 'audio' ? null : 1080,
  fps: kind === 'audio' ? null : 30,
  hasAudio
})

function setup(): { project: Project; clip: MediaClip; audio: MediaAsset } {
  const project = createEmptyProject('Test')
  const video = asset('video.mp4', 'video')
  ops.addAssets(project, [video])
  const clip: MediaClip = { ...createMediaClip(video, 2 * S), sourceIn: 3 * S, duration: 4 * S, speed: 2, volume: 0.8, fadeIn: S / 2 }
  ops.addClip(project, project.tracks[0].id, clip)
  return { project, clip, audio: asset('video (âm thanh).m4a', 'audio') }
}

describe('tách âm thanh', () => {
  it('clip âm thanh mới khớp clip video (vị trí, đoạn cắt, tốc độ, âm lượng, fade); video tắt tiếng', () => {
    const { project, clip, audio } = setup()
    const id = detachAudio(project, clip.id, audio)!
    expect(project.tracks.map((t) => t.kind)).toEqual(['video', 'audio'])
    expect(project.assets[audio.id]).toEqual(audio)

    const detached = findClip(project, id)!.clip as MediaClip
    expect(detached).toMatchObject({ assetId: audio.id, start: 2 * S, duration: 4 * S, sourceIn: 3 * S, speed: 2, volume: 0.8, fadeIn: S / 2 })
    expect(findClip(project, clip.id)!.clip).toMatchObject({ volume: 0, fadeIn: 0, fadeOut: 0 })
    expect(canDetachAudio(project, clip.id)).toBe(false) // đã tách rồi
  })

  it('dùng track âm thanh có sẵn nếu còn trống, bận thì tạo track mới', () => {
    const { project, clip, audio } = setup()
    const audioTrack = ops.addTrack(project, 'audio')
    ops.addClip(project, audioTrack, { ...createMediaClip(audio, 0), duration: 1 * S }) // 0–1s: không chồng 2–6s
    detachAudio(project, clip.id, audio)
    expect(project.tracks.filter((t) => t.kind === 'audio')).toHaveLength(1)

    const { project: p2, clip: c2, audio: a2 } = setup()
    const busy = ops.addTrack(p2, 'audio')
    ops.addClip(p2, busy, { ...createMediaClip(a2, 3 * S), duration: 1 * S }) // chồng lên 2–6s
    detachAudio(p2, c2.id, a2)
    expect(p2.tracks.filter((t) => t.kind === 'audio')).toHaveLength(2)
  })

  it('xóa giọng: clip âm thanh đổi sang file đã xóa giọng; clip video thì tách ra track âm thanh', () => {
    const { project, clip } = setup()
    const music = asset('nhac.mp3', 'audio')
    ops.addAssets(project, [music])
    const track = ops.addTrack(project, 'audio')
    const m: MediaClip = { ...createMediaClip(music, 0), sourceIn: S, volume: 0.5 }
    ops.addClip(project, track, m)
    const karaoke = { ...asset('x', 'audio'), path: 'C:\\out\\nhac (bỏ giọng abc123).m4a' }

    expect(applyVocalRemoval(project, m.id, karaoke)).toBe(m.id)
    expect(findClip(project, m.id)!.clip).toMatchObject({ assetId: karaoke.id, sourceIn: S, volume: 0.5, vocalsRemovedFrom: music.id })
    expect(canRemoveVocals(project, m.id)).toBe(false) // đã xóa giọng rồi
    expect(ops.isAssetUsed(project, music.id)).toBe(true) // bản gốc được giữ để Khôi phục

    // Khôi phục → về đúng file gốc, lại xóa giọng được
    expect(restoreVocals(project, m.id)).toBe(true)
    expect(findClip(project, m.id)!.clip).toMatchObject({ assetId: music.id, vocalsRemovedFrom: null })
    expect(canRestoreVocals(project, m.id)).toBe(false)
    expect(canRemoveVocals(project, m.id)).toBe(true)

    // Clip video: cần tiếng gốc (plain) → tách ra track âm thanh, clip âm thanh dùng bản xóa giọng
    const vk = { ...asset('y', 'audio'), path: 'C:\\out\\video (bỏ giọng def456).m4a' }
    const plain = asset('video (âm thanh).m4a', 'audio')
    expect(applyVocalRemoval(project, clip.id, vk)).toBeNull()
    const newId = applyVocalRemoval(project, clip.id, vk, plain)!
    expect(findClip(project, newId)!.clip).toMatchObject({ assetId: vk.id, start: clip.start, vocalsRemovedFrom: plain.id })
    expect(findClip(project, clip.id)!.clip).toMatchObject({ volume: 0 })
    expect(restoreVocals(project, newId)).toBe(true)
    expect(findClip(project, newId)!.clip).toMatchObject({ assetId: plain.id }) // tiếng gốc của video, vẫn ở track âm thanh
  })

  it('không tách: ảnh, video không tiếng, track khóa', () => {
    const project = createEmptyProject('Test')
    const image = asset('anh.png', 'image', false)
    const silent = asset('cam.mp4', 'video', false)
    ops.addAssets(project, [image, silent])
    const a = createMediaClip(image, 0)
    const b = createMediaClip(silent, 10 * S)
    ops.addClip(project, project.tracks[0].id, a)
    ops.addClip(project, project.tracks[0].id, b)
    expect(canDetachAudio(project, a.id)).toBe(false)
    expect(canDetachAudio(project, b.id)).toBe(false)

    const { project: p2, clip, audio } = setup()
    p2.tracks[0].locked = true
    expect(detachAudio(p2, clip.id, audio)).toBeNull()
  })
})
