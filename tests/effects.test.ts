import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import { parseProjectJson } from '@shared/project/migrate'
import * as ops from '@shared/project/ops'
import { EFFECTS, OVERLAY_KINDS, coverCrop, splitSizes, type EffectOp } from '@shared/render/effects'
import { compileExpr, evalExpr, ffmpegExpr } from '@shared/render/expr'
import { createEffectClip, findClip } from '@shared/timeline/clips'
import { splitClip } from '@shared/timeline/edit'
import { visualLayersAt } from '@shared/timeline/evaluate'

const S = 1_000_000

/** Mọi biểu thức thời gian trong một phép hiệu ứng. */
function exprsOf(op: EffectOp): string[] {
  switch (op.type) {
    case 'hueCycle':
      return [op.degrees]
    case 'transform':
      return [op.scale, op.dx, op.dy, op.rotate, op.sx ?? '1']
    case 'bars':
      return [op.size]
    case 'flash':
      return [op.amount]
    case 'rgbSplit':
      return op.gate ? [op.gate] : []
    default:
      return []
  }
}

describe('biểu thức dùng chung (preview tính giống FFmpeg)', () => {
  it('các hàm có cùng nghĩa với FFmpeg', () => {
    expect(evalExpr('1+0.08*exp(-10*mod(t,0.8))', 0)).toBeCloseTo(1.08)
    expect(evalExpr('mod(t,1)', -0.25)).toBeCloseTo(0.75) // FFmpeg: x − y·floor(x/y)
    expect(evalExpr('lt(mod(t,0.25),0.08)', 0.3)).toBe(1)
    expect(evalExpr('if(gt(t,1),2,3)', 1.5)).toBe(2)
    expect(evalExpr('clip(t/3,0,1)', 9)).toBe(1)
    expect(evalExpr('0.012*sin(2*PI*t*7)', 1 / 28)).toBeCloseTo(0.012)
  })

  it('thứ tự phép tính và dấu âm đúng như FFmpeg (tự phân tích cú pháp, không dùng eval)', () => {
    expect(evalExpr('-2*3+4', 0)).toBe(-2)
    expect(evalExpr('2-3-4', 0)).toBe(-5) // trừ từ trái sang phải
    expect(evalExpr('8/2/2', 0)).toBe(2)
    expect(evalExpr('-t*2', 1.5)).toBe(-3)
    expect(evalExpr('1.25-0.25*clip(t/3,0,1)', 1.5)).toBeCloseTo(1.125)
    expect(evalExpr('max(1, 2, 5)', 0)).toBe(5)
    expect(() => compileExpr('sin(t')).toThrow()
    expect(() => compileExpr('1 2')).toThrow()
  })

  it('tên lạ / ký tự lạ bị từ chối (bắt lỗi gõ sai ngay trong test)', () => {
    expect(() => compileExpr('sinn(t)')).toThrow()
    expect(() => compileExpr('t; alert(1)')).toThrow()
  })

  it('thay t bằng thời gian của từng bộ lọc, không đụng tên hàm', () => {
    expect(ffmpegExpr('lt(mod(t,1.1),0.16)*sin(2*PI*t*23)', '(T-2.5)')).toBe('lt(mod((T-2.5),1.1),0.16)*sin(2*PI*(T-2.5)*23)')
  })

  it('mọi hiệu ứng: mã không trùng, mọi biểu thức dịch được, có tên tiếng Việt và tiếng Anh', () => {
    expect(EFFECTS.length).toBeGreaterThanOrEqual(35)
    expect(new Set(EFFECTS.map((e) => e.id)).size).toBe(EFFECTS.length)
    const vi = JSON.parse(readFileSync(join(__dirname, '../src/renderer/src/i18n/vi.json'), 'utf8'))
    const en = JSON.parse(readFileSync(join(__dirname, '../src/renderer/src/i18n/en.json'), 'utf8'))
    for (const def of EFFECTS) {
      for (const op of def.ops) for (const e of exprsOf(op)) expect(Number.isFinite(evalExpr(e, 0.7)), `${def.id}: ${e}`).toBe(true)
      expect(vi.effects.names[def.id], def.id).toBeTruthy()
      expect(en.effects.names[def.id], def.id).toBeTruthy()
    }
  })

  it('lớp phủ vẽ luôn đứng cuối (preview và xuất phủ lên sau cùng như nhau); loại lớp phủ hợp lệ', () => {
    for (const def of EFFECTS) {
      const firstOverlay = def.ops.findIndex((op) => op.type === 'overlay')
      if (firstOverlay < 0) continue
      expect(def.ops.slice(firstOverlay).every((op) => op.type === 'overlay'), def.id).toBe(true)
      for (const op of def.ops) if (op.type === 'overlay') expect(OVERLAY_KINDS).toContain(op.kind)
    }
  })

  it('chia màn hình: các ô cộng lại đúng khung, ô cắt giữa đúng tỉ lệ', () => {
    expect(splitSizes(1280, 3)).toEqual([427, 427, 426])
    expect(splitSizes(1280, 3).reduce((a, b) => a + b)).toBe(1280)
    expect(coverCrop(1280, 720, 640, 720)).toEqual({ x: 320, y: 0, w: 640, h: 720 })
    expect(coverCrop(1280, 720, 640, 360)).toEqual({ x: 0, y: 0, w: 1280, h: 720 })
  })
})

describe('clip hiệu ứng', () => {
  it('nằm trên track Hiệu ứng (trên cùng), có trong danh sách lớp vẽ đúng thứ tự, tách được', () => {
    const p = createEmptyProject('t')
    const track = ops.addTrack(p, 'effect')
    expect(p.tracks[0].kind).toBe('effect') // track hình/hiệu ứng mới nằm trên cùng
    const fx = createEffectClip(1 * S, 'glitch')
    ops.addClip(p, track, fx)
    const layers = visualLayersAt(p, 2 * S)
    expect(layers.map((l) => l.clip.type)).toEqual(['effect'])
    expect(visualLayersAt(p, 4.5 * S)).toEqual([]) // hết 3 giây

    const right = splitClip(p, fx.id, 2 * S, 1000)!
    expect(findClip(p, right)!.clip).toMatchObject({ type: 'effect', effectId: 'glitch', start: 2 * S, duration: 2 * S })
  })

  it('đọc file: giữ mã hiệu ứng (kể cả mã lạ từ phiên bản mới hơn)', () => {
    const p = createEmptyProject('t')
    const track = ops.addTrack(p, 'effect')
    ops.addClip(p, track, createEffectClip(0, 'vhs'))
    ops.addClip(p, track, { ...createEffectClip(5 * S, 'tuong-lai'), keyframes: {} })
    const parsed = parseProjectJson(JSON.stringify(p))
    expect(parsed.tracks[0].clips.map((c) => (c.type === 'effect' ? c.effectId : '?'))).toEqual(['vhs', 'tuong-lai'])
  })
})
