// Làm đẹp: đọc/ghi thông số, lệnh xuất dùng file đã làm đẹp, và đường ống giải mã → làm đẹp → ghi của main.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset, MediaClip } from '@shared/project/schema'
import { emptyBeauty, isBeautyEmpty, parseBeauty } from '@shared/render/beauty'
import { createMediaClip } from '@shared/timeline/clips'
import { BeautyJobs } from '../src/main/beauty/beautyJobs'
import { buildExportGraph } from '../src/main/export/graphBuilder'

const S = 1_000_000

describe('làm đẹp – thông số', () => {
  it('đọc từ file dự án: kẹp 0–100, thiếu/hỏng → null, toàn 0 → null', () => {
    expect(parseBeauty({ smooth: 150, whiten: -3, teeth: 42.4 })).toEqual({ ...emptyBeauty(), smooth: 100, teeth: 42 })
    expect(parseBeauty({ smooth: 0 })).toBeNull()
    expect(parseBeauty('linh tinh')).toBeNull()
    expect(isBeautyEmpty(null)).toBe(true)
    expect(isBeautyEmpty({ ...emptyBeauty(), darkCircles: 1 })).toBe(false)
  })

  it('lệnh xuất: hình đọc từ file đã làm đẹp (lệch theo điểm bắt đầu), tiếng vẫn từ file gốc', () => {
    const p = createEmptyProject('t')
    const video: MediaAsset = {
      id: 'v',
      kind: 'video',
      path: 'C:\\v.mp4',
      name: 'v',
      durationUs: 20 * S,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true
    }
    ops.addAssets(p, [video])
    const clip: MediaClip = { ...createMediaClip(video, 0), sourceIn: 5 * S, duration: 3 * S, beauty: { ...emptyBeauty(), smooth: 50 } }
    ops.addClip(p, p.tracks[0].id, clip)
    const g = buildExportGraph(p, {
      width: 1280,
      height: 720,
      fps: 30,
      pixelFormat: 'yuv420p',
      beautyRenders: new Map([[clip.id, { path: 'C:\\beauty\\clip.mp4', offsetUs: 3 * S, height: 1080 }]])
    })
    const args = g.inputArgs.join(' ')
    expect(args).toContain('-ss 2.000000 -t 3.000000 -i C:\\beauty\\clip.mp4') // 5s gốc = 2s của file làm đẹp
    expect(args).toContain('-ss 5.000000 -t 3.000000 -i C:\\v.mp4') // tiếng
    expect(g.filterGraph).toMatch(/\[1:a\]atrim/)
    expect(g.filterGraph).not.toContain('[0:a]')
  })
})

const ffmpegDir = join(__dirname, '..', 'resources', 'ffmpeg')
const ffmpeg = join(ffmpegDir, 'ffmpeg.exe')

describe.skipIf(!existsSync(ffmpeg))('làm đẹp – đường ống khung hình của main', () => {
  it('giải mã đúng số khung, nhận lại khung đã xử lý, ghi ra video đúng độ dài; hủy thì xóa file tạm', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-beauty-'))
    try {
      const src = join(dir, 'nguồn.mp4')
      execFileSync(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=320x180:rate=30',
        '-t',
        '3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        src
      ])
      const jobs = new BeautyJobs(ffmpeg, dir)
      const { id, frames } = await jobs.open({
        path: src,
        startUs: 1 * S,
        durationUs: 1 * S,
        width: 160,
        height: 90,
        fps: 30,
        image: false
      })
      expect(frames).toBe(30)
      let n = 0
      for (let f = await jobs.read(id); f; f = await jobs.read(id)) {
        expect(f.byteLength).toBe(160 * 90 * 4)
        const inverted = new Uint8Array(f.byteLength)
        for (let i = 0; i < f.byteLength; i++) inverted[i] = i % 4 === 3 ? 255 : 255 - f[i]
        await jobs.write(id, inverted)
        n++
      }
      expect(n).toBe(30)
      const out = (await jobs.close(id, true))!
      expect(existsSync(out)).toBe(true)
      const probe = execFileSync(
        join(ffmpegDir, 'ffprobe.exe'),
        ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width', '-of', 'csv=p=0', out],
        { encoding: 'utf8' }
      )
      expect(probe.trim()).toBe('160,30')
      await expect(jobs.write(id, new Uint8Array(4))).rejects.toThrow()

      const second = await jobs.open({ path: src, startUs: 0, durationUs: 1 * S, width: 160, height: 90, fps: 30, image: false })
      await jobs.read(second.id)
      expect(await jobs.close(second.id, false)).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
