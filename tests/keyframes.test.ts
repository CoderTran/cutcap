import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import { parseProjectJson } from '@shared/project/migrate'
import * as ops from '@shared/project/ops'
import type { Clip, MediaAsset, MediaClip, Project } from '@shared/project/schema'
import { applySpeed, applyTransform, applyVolume, clipGainAt } from '@shared/timeline/clipProps'
import { createMediaClip, createTextClip, findClip } from '@shared/timeline/clips'
import { applyTrim, splitClip } from '@shared/timeline/edit'
import {
  ffmpegValueExpr,
  isKeyframeAt,
  keyframeDragRange,
  keyframeTimes,
  moveKeyframes,
  neighborKeyframe,
  toggleKeyframe,
  transformAt,
  valueAt
} from '@shared/timeline/keyframes'

const S = 1_000_000

function setup(): { project: Project; clip: MediaClip } {
  const project = createEmptyProject('Test')
  const video: MediaAsset = {
    id: 'v', kind: 'video', path: 'C:\\v.mp4', name: 'v.mp4', durationUs: 30 * S, width: 1920, height: 1080, fps: 30, hasAudio: true
  }
  ops.addAssets(project, [video])
  const clip = { ...createMediaClip(video, 10 * S), duration: 10 * S }
  ops.addClip(project, project.tracks[0].id, clip)
  return { project, clip: findClip(project, clip.id)!.clip as MediaClip }
}

/** Đặt keyframe "Kích thước" 100% ở giây 1 và 214% ở giây 3 của clip (như ảnh CapCut). */
function zoomKeyframes(clip: Clip): void {
  clip.keyframes.scale = [
    { time: 1 * S, value: 1 },
    { time: 3 * S, value: 2.14 }
  ]
}

describe('keyframe – tính giá trị theo thời gian', () => {
  it('nội suy tuyến tính; trước keyframe đầu / sau keyframe cuối giữ nguyên', () => {
    const { clip } = setup()
    zoomKeyframes(clip)
    const at = (sec: number): number => valueAt(clip, 'scale', clip.start + sec * S)
    expect(at(0)).toBe(1)
    expect(at(1)).toBe(1)
    expect(at(2)).toBeCloseTo(1.57)
    expect(at(3)).toBeCloseTo(2.14)
    expect(at(9)).toBeCloseTo(2.14)
    // Thuộc tính khác chưa có keyframe → giá trị thường
    expect(transformAt(clip, clip.start + 2 * S)).toMatchObject({ x: 0.5, y: 0.5, rotation: 0, opacity: 1 })
    expect(transformAt(clip, clip.start + 2 * S).scale).toBeCloseTo(1.57)
  })

  it('biểu thức FFmpeg cho ra đúng giá trị như preview (nhiều keyframe, cả trước/sau)', () => {
    const { clip } = setup()
    clip.keyframes.x = [
      { time: 0.5 * S, value: 0.2 },
      { time: 2 * S, value: 0.9 },
      { time: 2 * S + 500_000, value: 0.4 },
      { time: 6 * S, value: 0.4 }
    ]
    // Chạy biểu thức FFmpeg bằng JS: if(c,a,b) → c?a:b, lt(a,b) → a<b
    const expr = ffmpegValueExpr(clip, 'x', 'T')
    const run = new Function('T', 'iff', 'lt', `return ${expr.replace(/if\(/g, 'iff(')}`) as (
      T: number,
      iff: (c: number, a: number, b: number) => number,
      lt: (a: number, b: number) => number
    ) => number
    for (const sec of [0, 0.5, 1, 1.9, 2, 2.2, 2.5, 4, 6, 7.5]) {
      const ff = run(sec, (c, a, b) => (c ? a : b), (a, b) => (a < b ? 1 : 0))
      expect(ff).toBeCloseTo(valueAt(clip, 'x', clip.start + sec * S), 5)
    }
    // Không có keyframe → hằng số
    expect(ffmpegValueExpr(clip, 'scale', 'T')).toBe('1')
  })

  it('âm lượng có keyframe: clipGainAt (preview) đổi theo thời gian', () => {
    const { clip } = setup()
    clip.keyframes.volume = [
      { time: 0, value: 0 },
      { time: 4 * S, value: 1 }
    ]
    expect(clipGainAt(clip, clip.start + 1 * S)).toBeCloseTo(0.25)
    expect(clipGainAt(clip, clip.start + 6 * S)).toBeCloseTo(1)
  })
})

describe('keyframe – chỉnh sửa', () => {
  it('nút ◇: thêm keyframe mang giá trị hiện tại; bấm lần nữa tại đó → xóa; xóa cái cuối giữ giá trị', () => {
    const { clip } = setup()
    const t1 = clip.start + 1 * S
    expect(toggleKeyframe(clip, ['scale'], t1)).toBe(true)
    expect(clip.keyframes.scale).toEqual([{ time: 1 * S, value: 1 }])
    expect(isKeyframeAt(clip, ['scale'], t1 + 5_000)).toBe(true) // gần đúng chỗ (< nửa khung hình) cũng tính

    // Đã có keyframe → chỉnh ở chỗ khác tự tạo keyframe mới (giống CapCut), giá trị thường không đổi
    const t3 = clip.start + 3 * S
    toggleKeyframe(clip, ['scale'], t3)
    clip.keyframes.scale![1].value = 2.14
    expect(valueAt(clip, 'scale', clip.start + 2 * S)).toBeCloseTo(1.57)

    expect(toggleKeyframe(clip, ['scale'], t3)).toBe(false)
    expect(clip.keyframes.scale).toHaveLength(1)
    toggleKeyframe(clip, ['scale'], t1)
    expect(clip.keyframes.scale).toBeUndefined()
    expect(clip.transform.scale).toBe(1)
  })

  it('applyTransform tại đầu phát: có keyframe → sửa/tạo keyframe; chưa có → đổi giá trị thường', () => {
    const { project, clip } = setup()
    applyTransform(project, clip.id, { rotation: 30 }, clip.start + 2 * S)
    expect(clip.transform.rotation).toBe(30)
    expect(clip.keyframes.rotation).toBeUndefined()

    zoomKeyframes(clip)
    applyTransform(project, clip.id, { scale: 3 }, clip.start + 5 * S) // chỗ mới → thêm keyframe
    applyTransform(project, clip.id, { scale: 1.5 }, clip.start + 3 * S) // đúng keyframe cũ → sửa
    expect(clip.keyframes.scale!.map((k) => [k.time / S, k.value])).toEqual([[1, 1], [3, 1.5], [5, 3]])
    expect(clip.transform.scale).toBe(1) // giá trị thường không bị đụng tới

    applyVolume(project, clip.id, 0.5, clip.start + 2 * S)
    expect(clip.volume).toBe(0.5)
  })

  it('cắt đầu clip / tách / đổi tốc độ: keyframe vẫn bám đúng nội dung', () => {
    const { project, clip } = setup()
    zoomKeyframes(clip)
    const before = (contentSec: number): number => valueAt(clip, 'scale', 10 * S + contentSec * S)

    // Cắt bớt 0.5s ở đầu: cùng một khung hình nội dung (giây 2 của clip cũ) vẫn có cùng kích thước
    const v2 = before(2)
    applyTrim(project, clip.id, 'start', 10.5 * S, 1000)
    expect(clip.start).toBe(10.5 * S)
    expect(valueAt(clip, 'scale', 12 * S)).toBeCloseTo(v2)

    // Tách ở giây 12 (timeline): 2 nửa liền mạch
    const rightId = splitClip(project, clip.id, 12 * S, 1000)!
    const right = findClip(project, rightId)!.clip
    expect(valueAt(right, 'scale', 12.5 * S)).toBeCloseTo(valueAt(clip, 'scale', 12.5 * S))
    expect(valueAt(right, 'scale', 13 * S)).toBeCloseTo(v2 + (2.14 - 1) / 2)

    // Tăng tốc 2×: keyframe dồn lại một nửa (cùng nội dung → cùng giá trị)
    const at = (c: Clip, localSec: number): number => valueAt(c, 'scale', c.start + localSec * S)
    const atOne = at(right, 1)
    applySpeed(project, right.id, 2, 1000)
    expect(at(right, 0.5)).toBeCloseTo(atOne)
  })

  it('kéo dấu ◆: dời keyframe mọi thuộc tính ở điểm đó; không vượt dấu bên cạnh, không ra ngoài clip', () => {
    const { clip } = setup()
    zoomKeyframes(clip) // 1s: 100%, 3s: 214%
    clip.keyframes.x = [{ time: 3 * S, value: 0.8 }] // cùng điểm 3s

    // Dời điểm kết thúc 3s → 5s: phóng to chậm hơn, X đi theo
    expect(moveKeyframes(clip, 3 * S, 5 * S)).toBe(5 * S)
    expect(clip.keyframes.scale!.map((k) => k.time)).toEqual([1 * S, 5 * S])
    expect(clip.keyframes.x).toEqual([{ time: 5 * S, value: 0.8 }])
    expect(valueAt(clip, 'scale', clip.start + 3 * S)).toBeCloseTo(1.57)

    // Dời điểm bắt đầu 1s sang quá điểm kết thúc → dừng ngay trước nó (thứ tự giữ nguyên)
    const stopped = moveKeyframes(clip, 1 * S, 9 * S)
    expect(stopped).toBeLessThan(5 * S)
    expect(clip.keyframes.scale!.map((k) => k.value)).toEqual([1, 2.14])
    // Kéo về trước đầu clip → kẹp ở 0; kéo quá cuối clip → kẹp trong clip
    expect(moveKeyframes(clip, stopped, -3 * S)).toBe(0)
    expect(moveKeyframes(clip, 5 * S, 99 * S)).toBe(clip.duration - 1)
    expect(keyframeDragRange(clip, 0)).toEqual({ min: 0, max: clip.duration - 1 - 2 * 16_000 })
  })

  it('dấu ◆ trên timeline và nhảy keyframe trước/sau', () => {
    const { clip } = setup()
    zoomKeyframes(clip)
    clip.keyframes.x = [{ time: 3 * S, value: 0.3 }, { time: 5 * S, value: 0.6 }]
    expect(keyframeTimes(clip)).toEqual([1 * S, 3 * S, 5 * S])
    expect(neighborKeyframe(clip, ['scale'], clip.start + 2 * S, 1)).toBe(clip.start + 3 * S)
    expect(neighborKeyframe(clip, ['scale'], clip.start + 2 * S, -1)).toBe(clip.start + 1 * S)
    expect(neighborKeyframe(clip, ['scale'], clip.start + 3 * S, 1)).toBeNull()
  })

  it('đọc file dự án: giữ keyframe hợp lệ, bỏ dữ liệu hỏng; file cũ không có keyframe → rỗng', () => {
    const { project, clip } = setup()
    const text = createTextClip(0, 'Chữ')
    ops.addClip(project, ops.addTrack(project, 'text'), text)
    const raw = JSON.parse(JSON.stringify(project))
    const rawClip = raw.tracks.find((t: { kind: string }) => t.kind === 'video').clips[0]
    rawClip.keyframes = { scale: [{ time: 3 * S, value: 2 }, { time: 1 * S, value: 1 }, { time: 'x', value: 1 }], bogus: [{ time: 0, value: 1 }] }
    delete raw.tracks.find((t: { kind: string }) => t.kind === 'text').clips[0].keyframes
    const parsed = parseProjectJson(JSON.stringify(raw))
    const c = findClip(parsed, clip.id)!.clip
    expect(c.keyframes).toEqual({ scale: [{ time: 1 * S, value: 1 }, { time: 3 * S, value: 2 }] })
    expect(findClip(parsed, text.id)!.clip.keyframes).toEqual({})
  })
})
