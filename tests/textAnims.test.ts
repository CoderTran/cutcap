import { describe, expect, it } from 'vitest'
import { textAnimFrame, textAnimIds, textAnimSpans, hasTextAnim } from '@shared/render/textAnims'
import { animationFrameCount } from '@shared/render/textLayout'
import { applyTextAnim } from '@shared/timeline/clipProps'
import { createTextClip, findClip } from '@shared/timeline/clips'
import { splitClip } from '@shared/timeline/edit'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import en from '../src/renderer/src/i18n/en.json'
import vi from '../src/renderer/src/i18n/vi.json'

const S = 1_000_000
const base = (): ReturnType<typeof createTextClip> => ({ ...createTextClip(10 * S, 'ABC123'), duration: 4 * S })

describe('hiệu ứng động của chữ', () => {
  it('đủ nhiều hiệu ứng, mã không trùng, có tên tiếng Việt / tiếng Anh', () => {
    for (const kind of ['in', 'out', 'loop'] as const) {
      const ids = textAnimIds(kind)
      expect(new Set(ids).size, kind).toBe(ids.length)
      expect(ids.length, kind).toBeGreaterThanOrEqual(30)
      for (const id of ids) {
        expect(vi.textAnim[kind][id as keyof (typeof vi.textAnim)[typeof kind]], `${kind}.${id}`).toBeTruthy()
        expect(en.textAnim[kind][id as keyof (typeof en.textAnim)[typeof kind]], `${kind}.${id}`).toBeTruthy()
      }
    }
  })

  it('mọi hiệu ứng: đầu Vào ẩn / cuối Vào hiện đủ; Ra ngược lại; không ra số lỗi (NaN)', () => {
    for (const kind of ['in', 'out', 'loop'] as const) {
      for (const id of textAnimIds(kind)) {
        const clip = {
          ...base(),
          textIn: kind === 'in' ? { id, duration: S } : null,
          textOut: kind === 'out' ? { id, duration: S } : null,
          textLoop: kind === 'loop' ? { id, period: S } : null
        }
        for (const t of [10, 10.3, 10.5, 11, 12.2, 13.5, 13.99].map((x) => x * S)) {
          const f = textAnimFrame(clip, t)
          for (const v of Object.values(f.block)) expect(Number.isFinite(v), `${kind}.${id} block @${t}`).toBe(true)
          for (let i = 0; i < 6; i++) {
            const g = f.glyph?.(i, 6)
            if (g) for (const v of Object.values(g)) expect(Number.isFinite(v), `${kind}.${id} glyph ${i} @${t}`).toBe(true)
          }
        }
        if (kind === 'in') {
          // Giữa clip (sau Vào): hiện đủ, không biến đổi
          const mid = textAnimFrame(clip, 12 * S)
          expect(mid.block.alpha, id).toBe(1)
          expect(mid.visible?.(6) ?? 6, id).toBe(6)
          expect(mid.wipe?.p ?? 1, id).toBeCloseTo(1, 5)
        }
      }
    }
  })

  it('Vào / Ra không chồng nhau; Vòng lặp chạy sau khi Vào xong', () => {
    const clip = {
      ...base(),
      textIn: { id: 'fade', duration: 3 * S },
      textOut: { id: 'fade', duration: 3 * S },
      textLoop: { id: 'pulse', period: S }
    }
    expect(textAnimSpans(clip)).toEqual({ inUs: 3 * S, outUs: 1 * S })
    expect(textAnimFrame(clip, 11 * S).block.scale).toBe(1) // đang Vào → chưa nhịp đập
    expect(hasTextAnim(base())).toBe(false)
  })

  it('xuất video: có Ra / Vòng lặp → vẽ mọi khung; chỉ Vào → vẽ đoạn Vào', () => {
    expect(animationFrameCount({ ...base(), textIn: { id: 'pop', duration: 0.5 * S } }, 30)).toBe(15)
    expect(animationFrameCount({ ...base(), textOut: { id: 'fade', duration: 0.5 * S } }, 30)).toBe(120)
    expect(animationFrameCount({ ...base(), textLoop: { id: 'wave', period: S } }, 30)).toBe(120)
  })

  it('đặt hiệu ứng: kẹp thời lượng, bỏ kiểu cũ; tách chữ: Vào ở nửa trước, Ra ở nửa sau', () => {
    const p = createEmptyProject('t')
    const track = ops.addTrack(p, 'text')
    const clip = { ...base(), animationIn: 'fade' as const }
    ops.addClip(p, track, clip)
    applyTextAnim(p, clip.id, 'in', { id: 'charsPop', duration: 99 * S })
    applyTextAnim(p, clip.id, 'out', { id: 'dissolve', duration: 0.5 * S })
    applyTextAnim(p, clip.id, 'loop', { id: 'wave', period: 1 })
    const c = findClip(p, clip.id)!.clip
    expect(c.type === 'text' && [c.textIn?.duration, c.animationIn, c.textLoop?.period]).toEqual([10 * S, 'none', 100_000])
    const right = splitClip(p, clip.id, 12 * S, 33_333)!
    const l = findClip(p, clip.id)!.clip
    const r = findClip(p, right)!.clip
    expect(l.type === 'text' && [!!l.textIn, !!l.textOut, !!l.textLoop]).toEqual([true, false, true])
    expect(r.type === 'text' && [!!r.textIn, !!r.textOut, !!r.textLoop]).toEqual([false, true, true])
  })
})
