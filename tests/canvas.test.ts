import { describe, expect, it } from 'vitest'
import { canvasSize } from '@shared/project/canvas'

describe('canvasSize', () => {
  it('tính đúng kích thước theo tỉ lệ và độ phân giải', () => {
    expect(canvasSize('16:9', '1080p')).toEqual({ width: 1920, height: 1080 })
    expect(canvasSize('9:16', '1080p')).toEqual({ width: 1080, height: 1920 })
    expect(canvasSize('1:1', '720p')).toEqual({ width: 720, height: 720 })
    expect(canvasSize('16:9', '4k')).toEqual({ width: 3840, height: 2160 })
    expect(canvasSize('9:16', '720p')).toEqual({ width: 720, height: 1280 })
  })
})
