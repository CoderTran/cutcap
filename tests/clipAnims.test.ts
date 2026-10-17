import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import { parseProjectJson } from '@shared/project/migrate'
import * as ops from '@shared/project/ops'
import type { MediaAsset, MediaClip } from '@shared/project/schema'
import { IN_ANIMS, OUT_ANIMS, animChannels, clipAnimAt, clipAnimExprs, comboSpans, maxAnimScale } from '@shared/render/clipAnims'
import { evalExpr } from '@shared/render/expr'
import { createMediaClip, findClip } from '@shared/timeline/clips'
import { splitClip } from '@shared/timeline/edit'

const S = 1_000_000
const img: MediaAsset = { id: 'a', kind: 'image', path: 'C:\\a.png', name: 'a', durationUs: 0, width: 640, height: 360, fps: null, hasAudio: false }
const clipWith = (changes: Partial<MediaClip>): MediaClip => ({ ...createMediaClip(img, 2 * S), duration: 4 * S, ...changes })

describe('hiệu ứng động: preview và xuất tính giống nhau', () => {
  it('biểu thức FFmpeg = clipAnimAt ở mọi thời điểm (Vào + Ra, và Kết hợp)', () => {
    const cases = [
      clipWith({ animIn: { id: 'spinIn', duration: 0.6 * S }, animOut: { id: 'slideLeft', duration: 0.8 * S } }),
      clipWith({ animIn: { id: 'dropIn', duration: 1 * S }, animOut: { id: 'flip', duration: 0.5 * S } }),
      clipWith({ animCombo: { id: 'zoomIn', duration: 0.7 * S, outDuration: 1.3 * S } })
    ]
    for (const clip of cases) {
      // Biểu thức theo "t" = giây tính từ đầu clip → tính được bằng chính bộ tính của preview
      const ex = clipAnimExprs(clip, 't')
      for (let i = 0; i <= 40; i++) {
        const local = (clip.duration / S) * (i / 40)
        const js = clipAnimAt(clip, clip.start + local * S)
        expect(evalExpr(ex.scale, local), `scale @${local}`).toBeCloseTo(js.scale, 5)
        expect(evalExpr(ex.dx, local)).toBeCloseTo(js.dx, 5)
        expect(evalExpr(ex.dy, local)).toBeCloseTo(js.dy, 5)
        expect(evalExpr(ex.rot, local)).toBeCloseTo(js.rot, 4)
        expect(evalExpr(ex.alpha, local)).toBeCloseTo(js.alpha, 5)
        expect(evalExpr(ex.sx, local)).toBeCloseTo(js.sx, 5)
      }
    }
  })

  it('Vào kết thúc ở trạng thái bình thường; Ra bắt đầu từ trạng thái bình thường; mọi công thức hợp lệ', () => {
    for (const a of IN_ANIMS) {
      const ch = animChannels('in', a.id)!
      expect(ch, a.id).toBeTruthy()
      if (ch.scale) expect(evalExpr(ch.scale, 1), a.id).toBeCloseTo(1, 3)
      if (ch.dx) expect(evalExpr(ch.dx, 1), a.id).toBeCloseTo(0, 3)
      if (ch.dy) expect(evalExpr(ch.dy, 1), a.id).toBeCloseTo(0, 3)
      if (ch.rot) expect(evalExpr(ch.rot, 1), a.id).toBeCloseTo(0, 2)
      if (ch.alpha) expect(evalExpr(ch.alpha, 1), a.id).toBeCloseTo(1, 3)
      if (ch.sx) expect(evalExpr(ch.sx, 1), a.id).toBeCloseTo(1, 3)
    }
    for (const a of OUT_ANIMS) expect(animChannels('out', a.id), a.id).toBeTruthy()
    // Giữa clip (ngoài 2 đầu): không biến đổi gì
    const clip = clipWith({ animIn: { id: 'slideLeft', duration: 0.5 * S }, animOut: { id: 'fade', duration: 0.5 * S } })
    expect(clipAnimAt(clip, clip.start + 2 * S)).toEqual({ scale: 1, dx: 0, dy: 0, rot: 0, alpha: 1, sx: 1 })
    expect(clipAnimAt(clip, clip.start).dx).toBeCloseTo(1) // đầu clip: còn ở ngoài bên phải
    expect(clipAnimAt(clip, clip.start + clip.duration).alpha).toBeCloseTo(0) // cuối clip: mờ hẳn
  })

  it('Kết hợp = cùng 1 hiệu ứng cho vào (đầu) và ra (cuối, chạy ngược); 2 đầu dài khác nhau, tổng ≤ clip', () => {
    // Clip 4s: vào 1s, ra 2s
    const clip = clipWith({ animCombo: { id: 'fade', duration: 1 * S, outDuration: 2 * S } })
    expect(comboSpans(clip)).toEqual({ inUs: 1 * S, outUs: 2 * S })
    expect(clipAnimAt(clip, clip.start).alpha).toBeCloseTo(0)
    expect(clipAnimAt(clip, clip.start + 0.5 * S).alpha).toBeCloseTo(0.5)
    expect(clipAnimAt(clip, clip.start + 1.5 * S).alpha).toBeCloseTo(1) // giữa: rõ hẳn
    expect(clipAnimAt(clip, clip.start + 3 * S).alpha).toBeCloseTo(0.5) // giữa phần ra 2s
    expect(clipAnimAt(clip, clip.start + 4 * S).alpha).toBeCloseTo(0)
    // Không có outDuration (dự án cũ) → ra dài bằng vào; quá dài → kẹp để tổng không vượt clip
    expect(comboSpans(clipWith({ animCombo: { id: 'fade', duration: 0.5 * S } }))).toEqual({ inUs: 0.5 * S, outUs: 0.5 * S })
    expect(comboSpans(clipWith({ animCombo: { id: 'fade', duration: 3 * S, outDuration: 3 * S } }))).toEqual({ inUs: 3 * S, outUs: 1 * S })
    expect(maxAnimScale(clipWith({ animIn: { id: 'zoomOut', duration: S } }))).toBeCloseTo(1.6, 1)
  })
})

describe('hiệu ứng động: chỉnh sửa và đọc file', () => {
  it('tách clip: nửa trước giữ Vào, nửa sau giữ Ra', () => {
    const p = createEmptyProject('t')
    p.assets[img.id] = img
    const clip = clipWith({ animIn: { id: 'pop', duration: S / 2 }, animOut: { id: 'fade', duration: S / 2 } })
    ops.addClip(p, p.tracks[0].id, clip)
    const right = splitClip(p, clip.id, 4 * S, 1000)!
    expect(findClip(p, clip.id)!.clip).toMatchObject({ animIn: { id: 'pop' }, animOut: null })
    expect(findClip(p, right)!.clip).toMatchObject({ animIn: null, animOut: { id: 'fade' } })
  })

  it('đọc file: giữ hiệu ứng động, dữ liệu hỏng → không có', () => {
    const p = createEmptyProject('t')
    p.assets[img.id] = img
    const clip = clipWith({ animCombo: { id: 'spinIn', duration: S, outDuration: 2 * S } })
    ops.addClip(p, p.tracks[0].id, clip)
    const raw = JSON.parse(JSON.stringify(p))
    raw.tracks[0].clips[0].animIn = { duration: 5 } // thiếu id
    const parsed = findClip(parseProjectJson(JSON.stringify(raw)), clip.id)!.clip as MediaClip
    expect(parsed.animCombo).toEqual({ id: 'spinIn', duration: S, outDuration: 2 * S })
    expect(parsed.animIn).toBeNull()
  })
})
