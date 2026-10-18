// Mặt nạ: đọc thông số, lệnh FFmpeg (ảnh mặt nạ → kênh trong suốt), xuất thật lộ track bên dưới.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset } from '@shared/project/schema'
import { defaultMask, featherPx, parseMask } from '@shared/render/mask'
import { createMediaClip } from '@shared/timeline/clips'
import { maskAt, MASK_PROPS, propApplies, setAnimatedValue, toggleKeyframe } from '@shared/timeline/keyframes'
import { Exporter } from '../src/main/export/exporter'
import { buildExportGraph } from '../src/main/export/graphBuilder'

const S = 1_000_000

describe('mặt nạ – thông số', () => {
  it('đọc file dự án: loại lạ → null; kẹp khoảng; giữ đảo ngược', () => {
    expect(parseMask({ shape: 'star' })).toBeNull()
    const m = parseMask({ shape: 'rect', x: 9, feather: 400, invert: true, roundness: 30 })!
    expect(m).toMatchObject({ shape: 'rect', x: 1.5, feather: 100, invert: true, roundness: 30 })
    expect(parseMask({ shape: 'circle' })).toEqual(defaultMask('circle'))
    expect(featherPx({ ...defaultMask('circle'), feather: 100 }, 1920, 1080)).toBeCloseTo(162, 0)
  })

  it('lệnh xuất: ảnh mặt nạ lặp đúng thời lượng, co giãn theo lớp hình, làm kênh trong suốt', () => {
    const p = createEmptyProject('t')
    const img: MediaAsset = {
      id: 'i',
      kind: 'image',
      path: 'C:\\a.png',
      name: 'a',
      durationUs: 0,
      width: 640,
      height: 360,
      fps: null,
      hasAudio: false
    }
    ops.addAssets(p, [img])
    const clip = { ...createMediaClip(img, 0), duration: 2 * S, mask: defaultMask('circle') }
    ops.addClip(p, p.tracks[0].id, clip)
    const g = buildExportGraph(p, {
      width: 1280,
      height: 720,
      fps: 30,
      pixelFormat: 'yuv420p',
      masks: new Map([[clip.id, { file: 'C:\\m.png' }]])
    })
    expect(g.inputArgs.join(' ')).toContain('-loop 1 -framerate 30 -t 2.000000 -i C:\\m.png')
    expect(g.filterGraph).toContain('scale2ref')
    expect(g.filterGraph).toContain('alphamerge')
    // Không có ảnh mặt nạ (vd. clip không có mặt nạ) → không thêm gì
    const plain = buildExportGraph(p, { width: 1280, height: 720, fps: 30, pixelFormat: 'yuv420p' })
    expect(plain.filterGraph).not.toContain('alphamerge')
  })
})

describe('mặt nạ – keyframe', () => {
  const setup = () => {
    const p = createEmptyProject('t')
    const img: MediaAsset = {
      id: 'i',
      kind: 'image',
      path: 'C:\\a.png',
      name: 'a',
      durationUs: 0,
      width: 640,
      height: 360,
      fps: null,
      hasAudio: false
    }
    ops.addAssets(p, [img])
    const clip = { ...createMediaClip(img, 1 * S), duration: 4 * S, mask: defaultMask('circle') }
    ops.addClip(p, p.tracks[0].id, clip)
    return { p, clip }
  }

  it('nội suy vị trí / làm mờ viền giữa 2 keyframe; trước / sau giữ nguyên', () => {
    const { clip } = setup()
    expect(propApplies(clip, 'maskX')).toBe(true)
    expect(propApplies({ ...clip, mask: null }, 'maskX')).toBe(false)
    toggleKeyframe(clip, MASK_PROPS, 1 * S) // keyframe ở đầu clip, giữ giá trị hiện tại
    setAnimatedValue(clip, 'maskX', 0.9, 3 * S) // đã có keyframe → tạo keyframe mới ở giây 3
    setAnimatedValue(clip, 'maskFeather', 60, 3 * S)
    expect(maskAt(clip, 2 * S)!.x).toBeCloseTo(0.7, 5)
    expect(maskAt(clip, 2 * S)!.feather).toBeCloseTo(30, 5)
    expect(maskAt(clip, 0)!.x).toBeCloseTo(0.5, 5)
    expect(maskAt(clip, 4.5 * S)!.x).toBeCloseTo(0.9, 5)
    expect(maskAt(clip, 2 * S)!.shape).toBe('circle')
  })

  it('không có keyframe: sửa thẳng giá trị mặt nạ', () => {
    const { clip } = setup()
    setAnimatedValue(clip, 'maskRotation', 45, 2 * S)
    expect(clip.mask.rotation).toBe(45)
    expect(clip.keyframes.maskRotation).toBeUndefined()
  })

  it('lệnh xuất: chuỗi ảnh mặt nạ lùi đúng tới đầu lớp hình', () => {
    const { p, clip } = setup()
    const g = buildExportGraph(p, {
      width: 1280,
      height: 720,
      fps: 30,
      pixelFormat: 'yuv420p',
      masks: new Map([[clip.id, { pattern: 'C:\\m\\m_%06d.png', startUs: 0, fps: 30 }]])
    })
    expect(g.inputArgs.join(' ')).toContain('-framerate 30 -ss 1.000000 -t 4.000000 -i C:\\m\\m_%06d.png')
  })
})

const ffmpegDir = join(__dirname, '..', 'resources', 'ffmpeg')
const ffmpeg = join(ffmpegDir, 'ffmpeg.exe')

const rgbAt = (file: string, x: number, y: number): number[] => {
  const buf = execFileSync(ffmpeg, [
    '-v',
    'error',
    '-ss',
    '0.5',
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    `crop=4:4:${x}:${y},scale=1:1`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-'
  ])
  return [buf[0], buf[1], buf[2]]
}

describe.skipIf(!existsSync(ffmpeg))('mặt nạ – xuất thật', () => {
  it('lớp đỏ có mặt nạ tròn trên nền xanh: giữa đỏ, góc lộ nền xanh', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-mask-'))
    try {
      const q = ['-v', 'error', '-y']
      const red = join(dir, 'đỏ.png')
      const blue = join(dir, 'xanh.png')
      const mask = join(dir, 'mặt nạ.png')
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=red:s=640x360', '-frames:v', '1', '-update', '1', red])
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=blue:s=640x360', '-frames:v', '1', '-update', '1', blue])
      // Ảnh mặt nạ: hình tròn trắng giữa nền đen (giống drawMask vẽ)
      execFileSync(ffmpeg, [
        ...q,
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=640x360',
        '-vf',
        "format=gray,geq=lum='if(lt(hypot(X-320,Y-180),120),255,0)'",
        '-frames:v',
        '1',
        '-update',
        '1',
        mask
      ])
      const project = createEmptyProject('t')
      project.settings.resolution = '720p'
      const asset = (id: string, path: string): MediaAsset => ({
        id,
        kind: 'image',
        path,
        name: id,
        durationUs: 0,
        width: 640,
        height: 360,
        fps: null,
        hasAudio: false
      })
      ops.addAssets(project, [asset('r', red), asset('b', blue)])
      const top = { ...createMediaClip(project.assets.r, 0), duration: 1 * S, mask: defaultMask('circle') }
      ops.addClip(project, ops.addTrack(project, 'video'), top)
      ops.addClip(project, project.tracks[1].id, { ...createMediaClip(project.assets.b, 0), duration: 1 * S })
      const out = join(dir, 'kết quả.mp4')
      const result = await new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => {} }).run({
        project,
        settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'high', encoder: 'libx264' },
        textFrames: [],
        maskImages: [{ clipId: top.id, png: new Uint8Array(await readFile(mask)) }]
      })
      expect(result.status).toBe('done')
      const center = rgbAt(out, 638, 358)
      const corner = rgbAt(out, 40, 40)
      expect(center[0]).toBeGreaterThan(200)
      expect(center[2]).toBeLessThan(60)
      expect(corner[2]).toBeGreaterThan(200)
      expect(corner[0]).toBeLessThan(60)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)

  it('mặt nạ có keyframe (chuỗi ảnh): lỗ tròn chạy từ trái sang phải', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-mask2-'))
    try {
      const q = ['-v', 'error', '-y']
      const red = join(dir, 'đỏ.png')
      const blue = join(dir, 'xanh.png')
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=red:s=640x360', '-frames:v', '1', '-update', '1', red])
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=blue:s=640x360', '-frames:v', '1', '-update', '1', blue])
      // 30 khung (1 giây): hình tròn trắng chạy từ x = 120 tới x = 520
      execFileSync(ffmpeg, [
        ...q,
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=640x360:r=30:d=1',
        '-vf',
        "format=gray,geq=lum='if(lt(hypot(X-(120+N*400/29),Y-180),80),255,0)'",
        join(dir, 'm_%06d.png')
      ])
      const pngs = await Promise.all(Array.from({ length: 30 }, (_, i) => readFile(join(dir, `m_${String(i + 1).padStart(6, '0')}.png`))))
      const project = createEmptyProject('t')
      project.settings.resolution = '720p'
      const asset = (id: string, path: string): MediaAsset => ({
        id,
        kind: 'image',
        path,
        name: id,
        durationUs: 0,
        width: 640,
        height: 360,
        fps: null,
        hasAudio: false
      })
      ops.addAssets(project, [asset('r', red), asset('b', blue)])
      const top = { ...createMediaClip(project.assets.r, 0), duration: 1 * S, mask: defaultMask('circle') }
      ops.addClip(project, ops.addTrack(project, 'video'), top)
      ops.addClip(project, project.tracks[1].id, { ...createMediaClip(project.assets.b, 0), duration: 1 * S })
      const out = join(dir, 'kết quả.mp4')
      const result = await new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => {} }).run({
        project,
        settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'high', encoder: 'libx264' },
        textFrames: [],
        maskImages: [{ clipId: top.id, frames: pngs.map((b) => new Uint8Array(b)), startUs: 0, fps: 30 }]
      })
      expect(result.status).toBe('done')
      const at = (t: number, x: number): number[] => {
        const buf = execFileSync(ffmpeg, [
          '-v',
          'error',
          '-ss',
          String(t),
          '-i',
          out,
          '-frames:v',
          '1',
          '-vf',
          `crop=4:4:${x}:358,scale=1:1`,
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          '-'
        ])
        return [buf[0], buf[1], buf[2]]
      }
      // Đầu clip: lỗ ở bên trái (x ≈ 240 ở 720p) → đỏ, bên phải → xanh; cuối clip ngược lại
      expect(at(0.05, 250)[0]).toBeGreaterThan(200)
      expect(at(0.05, 1030)[2]).toBeGreaterThan(200)
      expect(at(0.95, 1030)[0]).toBeGreaterThan(200)
      expect(at(0.95, 250)[2]).toBeGreaterThan(200)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
