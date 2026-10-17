// Mọi giọng của "Trình thay đổi giọng nói" chạy được bằng FFmpeg thật (mono và stereo), không im lặng.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DENOISE_AF, ENHANCE_AF, VOICES, voiceFilter } from '@shared/render/voices'

const ffmpeg = join(__dirname, '..', 'resources', 'ffmpeg', 'ffmpeg.exe')

describe('trình thay đổi giọng nói', () => {
  it('mã không trùng, có tên tiếng Việt và tiếng Anh', () => {
    expect(new Set(VOICES.map((v) => v.id)).size).toBe(VOICES.length)
    const vi = JSON.parse(readFileSync(join(__dirname, '../src/renderer/src/i18n/vi.json'), 'utf8'))
    const en = JSON.parse(readFileSync(join(__dirname, '../src/renderer/src/i18n/en.json'), 'utf8'))
    for (const v of VOICES) {
      expect(vi.voices?.names?.[v.id], v.id).toBeTruthy()
      expect(en.voices?.names?.[v.id], v.id).toBeTruthy()
    }
    expect(voiceFilter('khong-co')).toBeNull()
  })

  it.skipIf(!existsSync(ffmpeg))('mọi giọng chạy được bằng FFmpeg (mono + stereo) và vẫn có tiếng', () => {
    const failures: string[] = []
    for (const af of [DENOISE_AF, ENHANCE_AF]) {
      // Giảm ồn cần file mô hình: chạy trong resources/models giống MediaService
      const r = spawnSync(ffmpeg, ['-hide_banner', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=1', '-af', af, '-f', 'null', '-'], {
        encoding: 'utf8',
        cwd: join(__dirname, '..', 'resources', 'models')
      })
      if (r.status !== 0) failures.push(`${af}: ${r.stderr.trim().split('\n').slice(-1)}`)
    }
    for (const v of VOICES) {
      for (const layout of ['mono', 'stereo']) {
        const r = spawnSync(
          ffmpeg,
          ['-hide_banner', '-f', 'lavfi', '-i', `sine=frequency=220:duration=1,aformat=channel_layouts=${layout}`, '-af', `${voiceFilter(v.id)},volumedetect`, '-f', 'null', '-'],
          { encoding: 'utf8' }
        )
        const peak = Number(/max_volume: (-?[\d.]+|-inf) dB/.exec(r.stderr)?.[1].replace('-inf', '-200'))
        if (r.status !== 0) failures.push(`${v.id}/${layout}: ${r.stderr.trim().split('\n').slice(-2).join(' | ')}`)
        else if (!(peak > -50)) failures.push(`${v.id}/${layout}: gần như im lặng (${peak} dB)`)
      }
    }
    expect(failures).toEqual([])
  }, 300_000)
})
