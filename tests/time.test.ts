import { describe, expect, it } from 'vitest'
import { formatTimecode, microsToSeconds, secondsToMicros } from '@shared/project/time'

describe('time utils', () => {
  it('đổi giây <-> micro-giây không sai số', () => {
    expect(secondsToMicros(0.1) + secondsToMicros(0.2)).toBe(secondsToMicros(0.3))
    expect(microsToSeconds(secondsToMicros(12.345))).toBeCloseTo(12.345)
  })

  it('định dạng timecode', () => {
    expect(formatTimecode(0)).toBe('00:00.00')
    expect(formatTimecode(secondsToMicros(65.5), 30)).toBe('01:05.15')
    expect(formatTimecode(secondsToMicros(3600 + 2), 25)).toBe('1:00:02.00')
    expect(formatTimecode(-100)).toBe('00:00.00')
  })
})
