import { describe, expect, it } from 'vitest'
import { TEXT_STYLE_CATEGORIES, TEXT_STYLE_PRESETS, parseTextFx, presetsIn } from '@shared/render/textFx'
import en from '../src/renderer/src/i18n/en.json'
import vi from '../src/renderer/src/i18n/vi.json'

describe('hiệu ứng văn bản', () => {
  it('mọi mẫu: lưu rồi đọc lại (qua JSON) cho kết quả y hệt', () => {
    for (const p of TEXT_STYLE_PRESETS) {
      if (!p.style.fx) continue
      expect(parseTextFx(JSON.parse(JSON.stringify(p.style.fx))), p.id).toEqual(p.style.fx)
    }
  })

  it('mã mẫu không trùng; mỗi nhóm có mẫu và có tên; mẫu cơ bản có tên', () => {
    expect(new Set(TEXT_STYLE_PRESETS.map((p) => p.id)).size).toBe(TEXT_STYLE_PRESETS.length)
    for (const c of TEXT_STYLE_CATEGORIES) {
      expect(presetsIn(c).length, c).toBeGreaterThan(0)
      expect(vi.textFx.categories[c]).toBeTruthy()
      expect(en.textFx.categories[c]).toBeTruthy()
    }
    for (const p of presetsIn('basic')) expect(vi.textPresets[p.id as keyof typeof vi.textPresets], p.id).toBeTruthy()
    expect(TEXT_STYLE_PRESETS.length).toBeGreaterThan(190)
  })

  it('dữ liệu hỏng: bỏ phần sai, kẹp giá trị, không làm hỏng chữ', () => {
    expect(parseTextFx(null)).toBeNull()
    const fx = parseTextFx({
      fill: { colors: ['#fff'] }, // 1 màu → không phải gradient
      outlines: [{ color: 'red', width: 99 }, 'x'],
      glow: { color: '#00ff00', blur: -5 },
      box: { shape: 'star', colors: ['#000', 'nope'], tilt: 400, pattern: { kind: 'zigzag' } },
      sparkles: { count: 1000 }
    })!
    expect(fx.fill).toBeNull()
    expect(fx.outlines).toEqual([{ color: '#000000', width: 1 }])
    expect(fx.glow).toEqual({ color: '#00ff00', blur: 0 })
    expect(fx.box).toMatchObject({ shape: 'rect', colors: ['#000'], tilt: 45, pattern: null })
    // trường cũ "sparkles" → trang trí sao lấp lánh
    expect(fx.decor).toEqual({ kind: 'sparkle', color: '#ffffff', count: 30 })
    expect(fx.shadow).toBeNull()
  })

  it('trường mới: chữ rỗng, màu cắt đôi, viền chuyển màu, bản sao lệch, kết cấu, vát cạnh, trang trí', () => {
    const fx = parseTextFx({
      hollow: true,
      fill: { colors: ['#fff', '#f00'], angle: 90, hard: true },
      outlines: [
        { color: '#fff', width: 0.05, colors: ['#f00', '#0f0'] },
        { color: '#000', width: 0.02, colors: ['#f00'] }
      ],
      echoes: [{ color: '#00e5ff', dx: 9, dy: -0.05, hollow: true, width: 0.03 }],
      texture: { kind: 'glitter', color: '#fff', amount: 3 },
      bevel: { light: '#fff', dark: '#000', size: 0.05 },
      decor: { kind: 'snow', color: '#fff', count: 5 }
    })!
    expect(fx.hollow).toBe(true)
    expect(fx.fill).toEqual({ colors: ['#fff', '#f00'], angle: 90, hard: true })
    expect(fx.outlines).toEqual([
      { color: '#fff', width: 0.05, colors: ['#f00', '#0f0'] },
      { color: '#000', width: 0.02 }
    ])
    expect(fx.echoes).toEqual([{ color: '#00e5ff', dx: 2, dy: -0.05, hollow: true, width: 0.03 }])
    expect(fx.texture).toEqual({ kind: 'glitter', color: '#fff', amount: 1 })
    expect(fx.bevel).toEqual({ light: '#fff', dark: '#000', size: 0.05 })
    expect(fx.decor).toEqual({ kind: 'snow', color: '#fff', count: 5 })
    expect(parseTextFx({ texture: { kind: 'lava' }, decor: { kind: 'unicorn' } })).toMatchObject({ texture: null, decor: null })
  })
})
