import { describe, expect, it } from 'vitest'
import { ProbeError, parseProbeOutput } from '../src/main/media/probe'

const h264Stream = {
  codec_type: 'video',
  codec_name: 'h264',
  width: 1920,
  height: 1080,
  pix_fmt: 'yuv420p',
  avg_frame_rate: '30000/1001'
}
const aacStream = { codec_type: 'audio', codec_name: 'aac' }

describe('parseProbeOutput', () => {
  it('video thường', () => {
    const info = parseProbeOutput(
      { streams: [h264Stream, aacStream], format: { duration: '12.5', format_name: 'mov,mp4' } },
      'C:\\v\\a.mp4'
    )
    expect(info).toMatchObject({
      kind: 'video',
      durationUs: 12_500_000,
      width: 1920,
      height: 1080,
      fps: 29.97,
      hasAudio: true,
      videoCodec: 'h264'
    })
  })

  it('video quay dọc trên điện thoại (xoay -90°) → đổi chỗ rộng/cao', () => {
    const info = parseProbeOutput(
      {
        streams: [{ ...h264Stream, side_data_list: [{ rotation: -90 }] }],
        format: { duration: '3' }
      },
      'IMG_0001.MOV'
    )
    expect([info.width, info.height]).toEqual([1080, 1920])
  })

  it('mp3 có ảnh bìa album vẫn là âm thanh', () => {
    const info = parseProbeOutput(
      {
        streams: [
          { codec_type: 'audio', codec_name: 'mp3' },
          { codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } }
        ],
        format: { duration: '200' }
      },
      'song.mp3'
    )
    expect(info).toMatchObject({ kind: 'audio', width: null, hasAudio: true })
  })

  it('file .mp4 chỉ có âm thanh được nhận là âm thanh', () => {
    const info = parseProbeOutput({ streams: [aacStream], format: { duration: '5' } }, 'voice.mp4')
    expect(info.kind).toBe('audio')
  })

  it('ảnh: thời lượng 0, không có âm thanh', () => {
    const info = parseProbeOutput(
      { streams: [{ codec_type: 'video', codec_name: 'png', width: 800, height: 600 }], format: {} },
      'pic.PNG'
    )
    expect(info).toMatchObject({ kind: 'image', durationUs: 0, width: 800, hasAudio: false })
  })

  it('báo lỗi với file không hỗ trợ hoặc hỏng', () => {
    expect(() => parseProbeOutput({}, 'doc.docx')).toThrow(ProbeError)
    expect(() => parseProbeOutput({ streams: [], format: {} }, 'broken.mp4')).toThrow(ProbeError)
  })
})
