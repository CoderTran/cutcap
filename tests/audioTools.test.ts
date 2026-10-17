import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import { parseProjectJson } from '@shared/project/migrate'
import * as ops from '@shared/project/ops'
import type { MediaAsset, MediaClip } from '@shared/project/schema'
import { LOUDNESS_TARGET, MIN_DB, dbToGain, gainToDb, normalizeGain } from '@shared/render/audioMath'
import { audioFxChain, audioFxKey, isAudioFxEmpty, parseAudioFxKey } from '@shared/render/voices'
import { createMediaClip, findClip } from '@shared/timeline/clips'
import { parseIntegratedLoudness } from '../src/main/media/transcode'

describe('âm lượng theo dB và chuẩn hóa', () => {
  it('đổi qua lại dB ↔ hệ số; dưới ngưỡng là tắt tiếng', () => {
    expect(gainToDb(1)).toBe(0)
    expect(gainToDb(2)).toBeCloseTo(6.02, 2)
    expect(gainToDb(0)).toBe(-Infinity)
    expect(dbToGain(-6.02)).toBeCloseTo(0.5, 2)
    expect(dbToGain(MIN_DB)).toBe(0)
  })

  it('chuẩn hóa: đưa độ to về mục tiêu, kẹp tối đa +6 dB', () => {
    expect(gainToDb(normalizeGain(LOUDNESS_TARGET - 6))).toBeCloseTo(6, 1)
    expect(gainToDb(normalizeGain(LOUDNESS_TARGET + 10))).toBeCloseTo(-10, 1)
    expect(normalizeGain(-60)).toBe(2) // rất nhỏ → chỉ tăng tối đa gấp đôi
  })

  it('đọc độ to từ tổng kết ebur128', () => {
    const stderr = 'abc\n[Parsed_ebur128_0 @ 0] Summary:\n  Integrated loudness:\n    I:         -21.8 LUFS\n    Threshold: -31.8 LUFS\n'
    expect(parseIntegratedLoudness(stderr)).toBe(-21.8)
    expect(parseIntegratedLoudness('I: -70.0 LUFS Integrated loudness: I: -70.0 LUFS')).toBeNull()
    expect(parseIntegratedLoudness('không có gì')).toBeNull()
  })
})

describe('xử lý âm thanh gộp (giảm ồn → rõ giọng → đổi giọng)', () => {
  it('khóa thiết lập đi – về đúng; chuỗi bộ lọc đúng thứ tự; tắt hết = không xử lý', () => {
    const s = { voice: 'robot', enhance: true, denoise: true }
    expect(parseAudioFxKey(audioFxKey(s))).toEqual(s)
    expect(parseAudioFxKey(audioFxKey({ voice: null, enhance: false, denoise: true }))).toEqual({ voice: null, enhance: false, denoise: true })
    expect(parseAudioFxKey('linh tinh')).toBeNull()
    const chain = audioFxChain(s)!
    expect(chain.indexOf('arnndn')).toBeLessThan(chain.indexOf('equalizer=f=3500'))
    expect(chain.indexOf('equalizer=f=3500')).toBeLessThan(chain.indexOf('afftfilt'))
    expect(chain.endsWith('alimiter=limit=0.95:level=disabled')).toBe(true)
    expect(audioFxChain({ voice: null, enhance: false, denoise: false })).toBeNull()
    expect(audioFxChain({ voice: 'khong-co', enhance: false, denoise: false })).toBeNull()
    expect(isAudioFxEmpty({ voice: null, enhance: false, denoise: false })).toBe(true)
  })

  it('đọc file: dạng cũ "voice" đổi thành audioFx; chuẩn hóa giữ nguyên', () => {
    const p = createEmptyProject('t')
    const music: MediaAsset = { id: 'm', kind: 'audio', path: 'C:\\m.mp3', name: 'm', durationUs: 5e6, width: null, height: null, fps: null, hasAudio: true }
    ops.addAssets(p, [music])
    const clip: MediaClip = { ...createMediaClip(music, 0), loudnorm: { measured: -20, prevVolume: 0.8 } }
    ops.addClip(p, ops.addTrack(p, 'audio'), clip)
    const raw = JSON.parse(JSON.stringify(p))
    const rc = raw.tracks.find((t: { kind: string }) => t.kind === 'audio').clips[0]
    delete rc.audioFx
    rc.voice = { id: 'robot', original: 'goc' }
    const parsed = findClip(parseProjectJson(JSON.stringify(raw)), clip.id)!.clip as MediaClip
    expect(parsed.audioFx).toEqual({ voice: 'robot', enhance: false, denoise: false, original: 'goc' })
    expect(parsed.loudnorm).toEqual({ measured: -20, prevVolume: 0.8 })
  })
})
