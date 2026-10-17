import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import { animationFrameCount, cssFont, fontPx, splitGraphemes, textAnimationAt } from '@shared/render/textLayout'
import { createTextClip } from '@shared/timeline/clips'
import { Exporter } from '../src/main/export/exporter'
import { listSystemFonts } from '../src/main/fonts'

const S = 1_000_000

describe('bố cục & hiệu ứng chữ', () => {
  it('cỡ chữ theo cạnh ngắn của khung (1080 chuẩn)', () => {
    const style = createTextClip(0, 'x').style
    expect(fontPx(style, 1920, 1080)).toBe(80)
    expect(fontPx(style, 1080, 1920)).toBe(80) // video dọc: cạnh ngắn vẫn 1080
    expect(fontPx(style, 3840, 2160)).toBe(160)
    expect(cssFont({ fontFamily: 'Be "Vietnam" Pro', bold: true, italic: true }, 80)).toBe(
      'italic bold 80.00px "Be Vietnam Pro", "Segoe UI", sans-serif'
    )
  })

  it('tách ký tự tiếng Việt có dấu chồng (tổ hợp) thành đúng 1 ký tự', () => {
    // "ệ" viết dạng tổ hợp: e + U+0302 (mũ) + U+0323 (nặng) = 3 điểm mã, nhưng là 1 ký tự nhìn thấy
    const text = 'Việt'
    expect(text.length).toBe(6)
    expect(splitGraphemes(text)).toEqual(['V', 'i', 'ệ', 't'])
  })

  it('hiệu ứng xuất hiện theo thời gian', () => {
    const clip = { ...createTextClip(10 * S, 'Xin chào'), animationDuration: 1 * S }
    expect(textAnimationAt({ ...clip, animationIn: 'fade' }, 10 * S).alpha).toBe(0)
    expect(textAnimationAt({ ...clip, animationIn: 'fade' }, 12 * S).alpha).toBe(1)
    expect(textAnimationAt({ ...clip, animationIn: 'slide-up' }, 10 * S).offsetY).toBeGreaterThan(0)
    expect(textAnimationAt({ ...clip, animationIn: 'zoom' }, 10 * S).scale).toBeLessThan(1)
    // Gõ chữ: "Xin chào" có 8 ký tự → giữa chừng hiện 4
    expect(textAnimationAt({ ...clip, animationIn: 'typewriter' }, 10.5 * S).visibleGraphemes).toBe(4)
    expect(textAnimationAt({ ...clip, animationIn: 'none' }, 10 * S).visibleGraphemes).toBeNull()
  })

  it('số khung hiệu ứng khi xuất', () => {
    const clip = { ...createTextClip(0, 'x'), animationIn: 'fade' as const } // fade 0.5s, dài 3s
    expect(animationFrameCount(clip, 30)).toBe(15)
    expect(animationFrameCount({ ...clip, animationIn: 'none' }, 30)).toBe(0)
    expect(createTextClip(0, 'x').animationIn).toBe('none') // chữ mới: không hiệu ứng (giống CapCut)
    expect(animationFrameCount({ ...clip, duration: 0.2 * S }, 30)).toBe(6) // không dài hơn clip
  })
})

describe('font Windows', () => {
  it('liệt kê được font hệ thống', async () => {
    const fonts = await listSystemFonts()
    expect(fonts.length).toBeGreaterThan(5)
    expect(fonts).toContain('Segoe UI')
  }, 30_000)
})

const ffmpeg = join(__dirname, '..', 'resources', 'ffmpeg', 'ffmpeg.exe')

describe.skipIf(!existsSync(ffmpeg))('xuất video có chữ', () => {
  it('khung hiệu ứng rồi tới ảnh tĩnh, đúng thời điểm, chồng lên video', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-text-'))
    try {
      // Giả lập ảnh chữ do giao diện vẽ: 15 khung "hiệu ứng" màu xanh lá, ảnh tĩnh màu vàng
      const q = ['-hide_banner', '-loglevel', 'error', '-y']
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=lime:s=1280x720', '-frames:v', '15', join(dir, 'a_%04d.png')])
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=yellow:s=1280x720', '-frames:v', '1', '-update', '1', join(dir, 'still.png')])
      const animated = await Promise.all(
        Array.from({ length: 15 }, (_, i) => readFile(join(dir, `a_${String(i + 1).padStart(4, '0')}.png`)))
      )

      const project = createEmptyProject('Chữ')
      project.settings.resolution = '720p'
      project.settings.backgroundColor = '#ff0000'
      const textTrack = ops.addTrack(project, 'text')
      const clip = { ...createTextClip(1 * S, 'Xin chào'), id: 'T' } // 1s → 4s, fade 0.5s = 15 khung
      ops.addClip(project, textTrack, clip)

      const out = join(dir, 'out.mp4')
      const result = await new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => {} }).run({
        project,
        settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'standard', encoder: 'libx264' },
        textFrames: [{ clipId: 'T', animated: animated.map((b) => new Uint8Array(b)), still: new Uint8Array(await readFile(join(dir, 'still.png'))) }]
      })
      expect(result.status).toBe('done')

      const pixel = (t: number): number[] => [
        ...execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', out, '-frames:v', '1',
          '-vf', 'format=rgb24,crop=1:1:640:360', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).subarray(0, 3)
      ]
      const near = (a: number[], b: number[]): boolean => a.every((v, i) => Math.abs(v - b[i]) < 30)
      expect(near(pixel(0.5), [255, 0, 0])).toBe(true) // trước khi chữ xuất hiện: nền đỏ
      expect(near(pixel(1.2), [0, 255, 0])).toBe(true) // trong đoạn hiệu ứng: khung xanh lá
      expect(near(pixel(3), [255, 255, 0])).toBe(true) // sau hiệu ứng: ảnh tĩnh vàng
      expect(near(pixel(3.5), [255, 255, 0])).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
