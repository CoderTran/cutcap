import { describe, expect, it } from 'vitest'
import type { ProbeInfo } from '../src/main/media/probe'
import { parseProgressLine } from '../src/main/media/processRunner'
import { parseRange } from '../src/main/media/range'
import { filePathFromMediaUrl, mediaUrl } from '../src/main/media/mediaUrl'
import { proxyArgs, proxyNeeded } from '../src/main/media/transcode'

const baseVideo: ProbeInfo = {
  kind: 'video',
  durationUs: 10_000_000,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true,
  videoCodec: 'h264',
  pixelFormat: 'yuv420p',
  audioCodec: 'aac',
  audioChannels: 2,
  formatName: 'mov,mp4'
}

describe('proxyNeeded', () => {
  it('MP4 H.264 Full HD phát trực tiếp, không cần proxy', () => {
    expect(proxyNeeded(baseVideo, 'a.mp4')).toBeNull()
    expect(proxyNeeded({ ...baseVideo, width: 1080, height: 1920 }, 'doc.mov')).toBeNull()
  })

  it('MKV, HEVC, 10-bit, 4K cần proxy', () => {
    expect(proxyNeeded(baseVideo, 'a.mkv')).toBe('video')
    expect(proxyNeeded({ ...baseVideo, videoCodec: 'hevc' }, 'a.mp4')).toBe('video')
    expect(proxyNeeded({ ...baseVideo, pixelFormat: 'yuv420p10le' }, 'a.mp4')).toBe('video')
    expect(proxyNeeded({ ...baseVideo, width: 3840, height: 2160 }, 'a.mp4')).toBe('video')
    expect(proxyNeeded({ ...baseVideo, audioCodec: 'ac3' }, 'a.mp4')).toBe('video')
  })

  it('âm thanh và ảnh chỉ chuyển đổi khi Chromium không đọc được', () => {
    const audio: ProbeInfo = { ...baseVideo, kind: 'audio', videoCodec: null, audioCodec: 'mp3' }
    expect(proxyNeeded(audio, 'a.mp3')).toBeNull()
    expect(proxyNeeded({ ...audio, audioCodec: 'wmav2' }, 'a.wma')).toBe('audio')
    const image: ProbeInfo = { ...baseVideo, kind: 'image', durationUs: 0 }
    expect(proxyNeeded(image, 'a.jpg')).toBeNull()
    expect(proxyNeeded(image, 'a.heic')).toBe('image')
  })

  it('lệnh proxy video có đủ tham số quan trọng', () => {
    const args = proxyArgs('video', 'in.mkv', 'out.part')
    expect(args).toContain('libx264')
    expect(args.join(' ')).toContain('-progress pipe:1')
    expect(args.at(-1)).toBe('out.part')
  })
})

describe('tiện ích', () => {
  it('đọc tiến trình ffmpeg', () => {
    expect(parseProgressLine('out_time_us=1500000')).toBe(1_500_000)
    expect(parseProgressLine('frame=12')).toBeNull()
  })

  it('đọc header Range', () => {
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=2000-', 1000)).toBe('invalid')
    expect(parseRange('items=1-2', 1000)).toBe('invalid')
  })

  it('URL cutcap-media giữ nguyên đường dẫn có dấu tiếng Việt và khoảng trắng', () => {
    const path = 'C:\\Users\\Lan\\Video du lịch\\Đà Lạt #1.mp4'
    expect(filePathFromMediaUrl(mediaUrl(path, 123))).toBe(path)
    expect(filePathFromMediaUrl('https://example.com/x')).toBeNull()
  })
})
