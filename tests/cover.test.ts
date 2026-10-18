// Ảnh bìa: đọc file dự án, xuất thật → file mp4 có ảnh bìa nhúng (attached_pic) đúng khung hình đã chọn.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import { parseProject } from '@shared/project/migrate'
import * as ops from '@shared/project/ops'
import type { MediaAsset, Project } from '@shared/project/schema'
import { createMediaClip } from '@shared/timeline/clips'
import { Exporter } from '../src/main/export/exporter'

const S = 1_000_000
const THUMB = 'data:image/jpeg;base64,AAAA'

describe('ảnh bìa – đọc file dự án', () => {
  const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(createEmptyProject('t')))
  it('khung hình / ảnh hợp lệ được giữ; sai dạng → bỏ', () => {
    expect(parseProject({ ...base(), cover: { kind: 'frame', time: 1.5 * S, thumb: THUMB } }).cover).toEqual({
      kind: 'frame',
      time: 1.5 * S,
      thumb: THUMB
    })
    expect(parseProject({ ...base(), cover: { kind: 'image', path: 'C:\\a.jpg', thumb: THUMB } }).cover?.kind).toBe('image')
    expect(parseProject({ ...base(), cover: { kind: 'frame', time: 'x', thumb: THUMB } }).cover).toBeNull()
    expect(parseProject({ ...base(), cover: { kind: 'frame', time: 0, thumb: 'javascript:1' } }).cover).toBeNull()
    expect(parseProject(base()).cover).toBeNull()
  })
})

const ffmpegDir = join(__dirname, '..', 'resources', 'ffmpeg')
const ffmpeg = join(ffmpegDir, 'ffmpeg.exe')
const ffprobe = join(ffmpegDir, 'ffprobe.exe')

describe.skipIf(!existsSync(ffmpeg))('ảnh bìa – xuất thật', () => {
  it('nhúng khung hình tại thời điểm đã chọn (giây 1: xanh) làm ảnh bìa', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-cover-'))
    try {
      const q = ['-v', 'error', '-y']
      const red = join(dir, 'đỏ.png')
      const blue = join(dir, 'xanh.png')
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=red:s=320x180', '-frames:v', '1', '-update', '1', red])
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=blue:s=320x180', '-frames:v', '1', '-update', '1', blue])
      const project: Project = createEmptyProject('t')
      project.settings.resolution = '720p'
      const asset = (id: string, path: string): MediaAsset => ({
        id,
        kind: 'image',
        path,
        name: id,
        durationUs: 0,
        width: 320,
        height: 180,
        fps: null,
        hasAudio: false
      })
      ops.addAssets(project, [asset('r', red), asset('b', blue)])
      const main = project.tracks[0].id
      ops.addClip(project, main, { ...createMediaClip(project.assets.r, 0), duration: 1 * S })
      ops.addClip(project, main, { ...createMediaClip(project.assets.b, 1 * S), duration: 1 * S })
      project.cover = { kind: 'frame', time: 1.5 * S, thumb: THUMB }
      const out = join(dir, 'kết quả.mp4')
      const result = await new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => {} }).run({
        project,
        settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'high', encoder: 'libx264' },
        textFrames: []
      })
      expect(result.status).toBe('done')
      const streams = JSON.parse(
        execFileSync(ffprobe, [
          '-v',
          'error',
          '-show_entries',
          'stream=index,codec_name:stream_disposition=attached_pic',
          '-of',
          'json',
          out
        ]).toString()
      ).streams as { index: number; codec_name: string; disposition: { attached_pic: number } }[]
      const pic = streams.find((s) => s.disposition.attached_pic === 1)
      expect(pic?.codec_name).toBe('mjpeg')
      // Màu của ảnh bìa: xanh (khung ở giây 1.5)
      const rgb = execFileSync(ffmpeg, [
        '-v',
        'error',
        '-i',
        out,
        '-map',
        `0:${pic!.index}`,
        '-vf',
        'scale=1:1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-'
      ])
      expect(rgb[2]).toBeGreaterThan(200)
      expect(rgb[0]).toBeLessThan(60)
      // Video vẫn đủ 2 giây
      const dur = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString())
      expect(dur).toBeCloseTo(2, 1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)

  it('ảnh trên máy làm ảnh bìa (thu về tối đa 1920 px)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-cover2-'))
    try {
      const q = ['-v', 'error', '-y']
      const red = join(dir, 'đỏ.png')
      const green = join(dir, 'ảnh bìa.png')
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=red:s=320x180', '-frames:v', '1', '-update', '1', red])
      execFileSync(ffmpeg, [...q, '-f', 'lavfi', '-i', 'color=c=lime:s=3000x2000', '-frames:v', '1', '-update', '1', green])
      const project: Project = createEmptyProject('t')
      ops.addAssets(project, [{ id: 'r', kind: 'image', path: red, name: 'r', durationUs: 0, width: 320, height: 180, fps: null, hasAudio: false }])
      ops.addClip(project, project.tracks[0].id, { ...createMediaClip(project.assets.r, 0), duration: 1 * S })
      project.cover = { kind: 'image', path: green, thumb: THUMB }
      const out = join(dir, 'out.mp4')
      const result = await new Exporter({ ffmpegExe: ffmpeg, tempDir: join(dir, 'tmp'), onProgress: () => {} }).run({
        project,
        settings: { outputPath: out, resolution: '720p', fps: 30, quality: 'high', encoder: 'libx264' },
        textFrames: []
      })
      expect(result.status).toBe('done')
      const pic = execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:1', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out]).toString().trim()
      expect(pic).toBe('1920,1280')
      const rgb = execFileSync(ffmpeg, ['-v', 'error', '-i', out, '-map', '0:v:1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
      expect(rgb[1]).toBeGreaterThan(200)
      expect(rgb[0]).toBeLessThan(60)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
