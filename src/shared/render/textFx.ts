// Hiệu ứng văn bản: đọc an toàn từ file dự án + danh sách mẫu (tab Văn bản → Hiệu ứng văn bản).
// Vẽ: renderer/src/engine/text/drawText.ts (dùng chung cho Xem trước và Xuất video).
import {
  TEXT_BOX_PATTERNS,
  TEXT_BOX_SHAPES,
  TEXT_DECORS,
  TEXT_TEXTURES,
  type TextAnimation, type TextBox, type TextFx, type TextStyle } from '../project/schema'
import { MORE_TEXT_STYLE_PRESETS } from './textFxMore'

// ───────── Đọc từ file (không tin dữ liệu) ─────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const COLOR = /^#[0-9a-f]{3,8}$/i
const color = (v: unknown, fallback: string): string => (typeof v === 'string' && COLOR.test(v) ? v : fallback)
const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const colors = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string' && COLOR.test(c)).slice(0, 8) : []

function parseBox(v: unknown): TextBox | null {
  if (!isObj(v)) return null
  const cs = colors(v.colors)
  if (cs.length === 0) return null
  const pattern = isObj(v.pattern) && TEXT_BOX_PATTERNS.includes(v.pattern.kind as never) ? v.pattern : null
  return {
    shape: TEXT_BOX_SHAPES.includes(v.shape as never) ? (v.shape as TextBox['shape']) : 'rect',
    colors: cs,
    padX: num(v.padX, 0.35, 0, 3),
    padY: num(v.padY, 0.15, 0, 3),
    radius: num(v.radius, 0.15, 0, 3),
    tilt: num(v.tilt, 0, -45, 45),
    pattern: pattern ? { kind: pattern.kind as (typeof TEXT_BOX_PATTERNS)[number], color: color(pattern.color, '#ffffff40') } : null,
    stroke: isObj(v.stroke) ? { color: color(v.stroke.color, '#000000'), width: num(v.stroke.width, 0.04, 0, 1) } : null
  }
}

/** Hiệu ứng văn bản trong file → TextFx (sai dạng / không có → null). */
export function parseTextFx(v: unknown): TextFx | null {
  if (!isObj(v)) return null
  const fillColors = isObj(v.fill) ? colors(v.fill.colors) : []
  const fill =
    isObj(v.fill) && fillColors.length >= 2
      ? { colors: fillColors, angle: num(v.fill.angle, 90, -360, 360), ...(v.fill.hard === true ? { hard: true } : {}) }
      : null
  const outlines = Array.isArray(v.outlines)
    ? v.outlines
        .filter(isObj)
        .slice(0, 6)
        .map((o) => {
          const cs = colors(o.colors)
          return { color: color(o.color, '#000000'), width: num(o.width, 0.05, 0, 1), ...(cs.length >= 2 ? { colors: cs } : {}) }
        })
    : []
  const echoes = Array.isArray(v.echoes)
    ? v.echoes
        .filter(isObj)
        .slice(0, 6)
        .map((e) => ({
          color: color(e.color, '#000000'),
          dx: num(e.dx, 0.05, -2, 2),
          dy: num(e.dy, 0.05, -2, 2),
          hollow: e.hollow === true,
          width: num(e.width, 0.04, 0, 1)
        }))
    : []
  // Trường cũ "sparkles" (bản thử nghiệm) → trang trí kiểu sao lấp lánh
  const decorRaw = isObj(v.decor) ? v.decor : isObj(v.sparkles) ? { ...v.sparkles, kind: 'sparkle' } : null
  return {
    fill,
    hollow: v.hollow === true,
    outlines,
    glow: isObj(v.glow) ? { color: color(v.glow.color, '#ffffff'), blur: num(v.glow.blur, 0.3, 0, 3) } : null,
    shadow: isObj(v.shadow)
      ? {
          color: color(v.shadow.color, '#000000'),
          dx: num(v.shadow.dx, 0.05, -2, 2),
          dy: num(v.shadow.dy, 0.05, -2, 2),
          blur: num(v.shadow.blur, 0.05, 0, 3)
        }
      : null,
    extrude: isObj(v.extrude)
      ? { color: color(v.extrude.color, '#000000'), depth: num(v.extrude.depth, 0.1, 0, 1), angle: num(v.extrude.angle, 45, -360, 360) }
      : null,
    echoes,
    texture:
      isObj(v.texture) && TEXT_TEXTURES.includes(v.texture.kind as never)
        ? {
            kind: v.texture.kind as (typeof TEXT_TEXTURES)[number],
            color: color(v.texture.color, '#ffffff'),
            amount: num(v.texture.amount, 0.5, 0, 1)
          }
        : null,
    bevel: isObj(v.bevel)
      ? { light: color(v.bevel.light, '#ffffff'), dark: color(v.bevel.dark, '#000000'), size: num(v.bevel.size, 0.04, 0, 0.5) }
      : null,
    box: parseBox(v.box),
    decor:
      decorRaw && TEXT_DECORS.includes(decorRaw.kind as never)
        ? {
            kind: decorRaw.kind as (typeof TEXT_DECORS)[number],
            color: color(decorRaw.color, '#ffffff'),
            count: Math.round(num(decorRaw.count, 6, 0, 30))
          }
        : null
  }
}

// ───────── Mẫu ─────────

export const TEXT_STYLE_CATEGORIES = [
  'trending',
  'basic',
  'outline',
  'hollow',
  'glow',
  'gradient',
  'metal',
  '3d',
  'box',
  'shadow',
  'texture',
  'decor',
  'sparkle',
  'glitch',
  'fun'
] as const
export type TextStyleCategory = (typeof TEXT_STYLE_CATEGORIES)[number]

export interface TextStylePreset {
  id: string
  /** Nhóm chính; trending: thêm vào "Đang thịnh hành". */
  category: Exclude<TextStyleCategory, 'trending'>
  trending?: boolean
  style: Partial<TextStyle>
  animationIn?: TextAnimation
}

const fx = (p: Partial<TextFx>): TextFx => ({
  fill: null,
  hollow: false,
  outlines: [],
  glow: null,
  shadow: null,
  extrude: null,
  echoes: [],
  texture: null,
  bevel: null,
  box: null,
  decor: null,
  ...p
})
const box = (p: Partial<TextBox> & Pick<TextBox, 'colors'>): TextBox => ({
  shape: 'rect',
  padX: 0.35,
  padY: 0.15,
  radius: 0.15,
  tilt: 0,
  pattern: null,
  stroke: null,
  ...p
})
/** Kiểu chữ ngắn gọn: màu chữ, viền thường (màu, độ dày), hiệu ứng. */
const s = (
  color: string,
  stroke: [string, number] | null,
  effects: Partial<TextFx> = {},
  extra: Partial<TextStyle> = {}
): Partial<TextStyle> => ({
  color,
  strokeColor: stroke?.[0] ?? null,
  strokeWidth: stroke?.[1] ?? 0,
  backgroundColor: null,
  bold: true,
  italic: false,
  fx: fx(effects),
  ...extra
})

const BASE_PRESETS: TextStylePreset[] = [
  // Cơ bản (các mẫu cũ – giữ nguyên mã để Yêu thích cũ vẫn đúng)
  { id: 'default', category: 'basic', style: {} },
  { id: 'title', category: 'basic', style: { fontSize: 140, strokeWidth: 0, strokeColor: null }, animationIn: 'zoom' },
  {
    id: 'subtitle',
    category: 'basic',
    style: { fontSize: 56, bold: false, strokeColor: null, strokeWidth: 0, backgroundColor: '#000000' },
    animationIn: 'none'
  },
  { id: 'yellow', category: 'basic', style: { color: '#ffd400', strokeColor: '#000000', strokeWidth: 6 } },
  { id: 'red', category: 'basic', style: { color: '#ff3b3b', strokeColor: '#ffffff', strokeWidth: 5 } },
  { id: 'boxed', category: 'basic', style: { color: '#111111', strokeColor: null, strokeWidth: 0, backgroundColor: '#ffffff' } },
  {
    id: 'elegant',
    category: 'basic',
    style: { fontFamily: 'Times New Roman', bold: false, italic: true, strokeColor: null, strokeWidth: 0 },
    animationIn: 'fade'
  },
  { id: 'neon', category: 'basic', style: { color: '#ffffff', strokeColor: '#22c3e6', strokeWidth: 6 }, animationIn: 'typewriter' },

  // Viền
  {
    id: 'fxYellowThick',
    category: 'outline',
    trending: true,
    style: s('#ffd400', ['#000000', 9], { outlines: [{ color: '#ffffff', width: 0.03 }] })
  },
  {
    id: 'fxPinkDouble',
    category: 'outline',
    trending: true,
    style: s('#ffffff', ['#ff4fa3', 6], {
      outlines: [
        { color: '#ffffff', width: 0.05 },
        { color: '#3a0a22', width: 0.035 }
      ]
    })
  },
  { id: 'fxBlueDouble', category: 'outline', style: s('#ffffff', ['#1e90ff', 6], { outlines: [{ color: '#ffffff', width: 0.05 }] }) },
  { id: 'fxBlackWhite', category: 'outline', style: s('#111111', ['#ffffff', 7], { outlines: [{ color: '#111111', width: 0.035 }] }) },
  { id: 'fxGreenPop', category: 'outline', style: s('#7cfc00', ['#0b3d0b', 6], { outlines: [{ color: '#ffffff', width: 0.05 }] }) },
  { id: 'fxPurpleWhite', category: 'outline', style: s('#a259ff', ['#ffffff', 6], { outlines: [{ color: '#3b0a6b', width: 0.045 }] }) },
  { id: 'fxRedYellow', category: 'outline', style: s('#ff2d2d', ['#ffd400', 6], { outlines: [{ color: '#000000', width: 0.045 }] }) },
  {
    id: 'fxRainbowOutline',
    category: 'outline',
    style: s('#ffffff', null, {
      outlines: [
        { color: '#ff3b3b', width: 0.035 },
        { color: '#ffd400', width: 0.035 },
        { color: '#2ecc71', width: 0.035 },
        { color: '#1e90ff', width: 0.035 }
      ]
    })
  },
  { id: 'fxThinSerif', category: 'outline', style: s('#ffffff', ['#000000', 2], {}, { fontFamily: 'Georgia', italic: true }) },

  // Phát sáng
  { id: 'fxWhiteGlow', category: 'glow', trending: true, style: s('#ffffff', null, { glow: { color: '#ffffff', blur: 0.35 } }) },
  { id: 'fxNeonPink', category: 'glow', trending: true, style: s('#ffe6f5', ['#ff2fb3', 4], { glow: { color: '#ff2fb3', blur: 0.5 } }) },
  { id: 'fxNeonBlue', category: 'glow', style: s('#e6f7ff', ['#1ec8ff', 4], { glow: { color: '#1ec8ff', blur: 0.5 } }) },
  { id: 'fxNeonGreen', category: 'glow', style: s('#eaffea', ['#39ff14', 4], { glow: { color: '#39ff14', blur: 0.5 } }) },
  { id: 'fxNeonPurple', category: 'glow', style: s('#f3e6ff', ['#9b30ff', 4], { glow: { color: '#9b30ff', blur: 0.5 } }) },
  { id: 'fxRedGlow', category: 'glow', trending: true, style: s('#ffffff', ['#8b0000', 5], { glow: { color: '#ff1a1a', blur: 0.45 } }) },
  { id: 'fxGoldGlow', category: 'glow', style: s('#ffe08a', ['#b8860b', 3], { glow: { color: '#ffb300', blur: 0.4 } }) },
  { id: 'fxDarkRedGlow', category: 'glow', style: s('#1a0000', null, { glow: { color: '#ff0000', blur: 0.45 } }) },
  { id: 'fxDarkHalo', category: 'glow', style: s('#ffffff', null, { glow: { color: '#000000', blur: 0.3 } }) },

  // Gradient
  {
    id: 'fxSunset',
    category: 'gradient',
    trending: true,
    style: s('#ffd200', ['#3a0a0a', 4], { fill: { colors: ['#ffd200', '#ff5e62'], angle: 90 } })
  },
  { id: 'fxOcean', category: 'gradient', style: s('#7ee8fa', ['#ffffff', 4], { fill: { colors: ['#7ee8fa', '#1e3cff'], angle: 90 } }) },
  {
    id: 'fxCandy',
    category: 'gradient',
    style: s('#ff9a9e', ['#ff4f8b', 4], {
      fill: { colors: ['#ffffff', '#ff9ac8'], angle: 90 },
      outlines: [{ color: '#ffffff', width: 0.04 }]
    })
  },
  {
    id: 'fxPurpleBlue',
    category: 'gradient',
    style: s('#c471f5', ['#1b0b3a', 4], { fill: { colors: ['#c471f5', '#5b86e5'], angle: 90 } })
  },
  {
    id: 'fxFire',
    category: 'gradient',
    trending: true,
    style: s('#ff7a00', ['#3a0000', 4], {
      fill: { colors: ['#fff200', '#ff7a00', '#ff0000'], angle: 90 },
      glow: { color: '#ff5a00', blur: 0.3 }
    })
  },
  { id: 'fxMint', category: 'gradient', style: s('#96e6a1', ['#1e5a2e', 4], { fill: { colors: ['#d4fc79', '#96e6a1'], angle: 90 } }) },
  {
    id: 'fxRainbow',
    category: 'gradient',
    style: s('#ffffff', ['#ffffff', 4], {
      fill: { colors: ['#ff3b3b', '#ffb300', '#ffe600', '#2ecc71', '#1e90ff', '#9b30ff'], angle: 0 },
      outlines: [{ color: '#111111', width: 0.04 }]
    })
  },
  { id: 'fxPeach', category: 'gradient', style: s('#fcb69f', ['#7a3b1e', 4], { fill: { colors: ['#ffecd2', '#fcb69f'], angle: 90 } }) },

  // Kim loại
  {
    id: 'fxGold',
    category: 'metal',
    trending: true,
    style: s('#ffd700', ['#5a3d00', 3], {
      fill: { colors: ['#fff6c2', '#ffd700', '#b8860b', '#ffe680'], angle: 90 },
      shadow: { color: '#00000099', dx: 0.03, dy: 0.05, blur: 0.06 }
    })
  },
  {
    id: 'fxSilver',
    category: 'metal',
    style: s('#c0c0c0', ['#2a2a2a', 3], { fill: { colors: ['#ffffff', '#c0c0c0', '#6e6e6e', '#e8e8e8'], angle: 90 } })
  },
  {
    id: 'fxChrome',
    category: 'metal',
    style: s('#7aa7c7', ['#0b1a24', 3], { fill: { colors: ['#e0f7ff', '#7aa7c7', '#1f3b4d', '#bfe9ff'], angle: 90 } })
  },
  {
    id: 'fxRoseGold',
    category: 'metal',
    style: s('#e8a0a0', ['#5a2a32', 3], { fill: { colors: ['#ffe4e1', '#e8a0a0', '#b76e79', '#ffd1dc'], angle: 90 } })
  },
  {
    id: 'fxBronze',
    category: 'metal',
    style: s('#cd7f32', ['#2e1a05', 3], { fill: { colors: ['#ffe0b2', '#cd7f32', '#6b3e12'], angle: 90 } })
  },

  // 3D
  {
    id: 'fxPurple3d',
    category: '3d',
    trending: true,
    style: s('#d18cff', ['#ffffff', 3], {
      fill: { colors: ['#f3d4ff', '#b44cff'], angle: 90 },
      extrude: { color: '#4a1270', depth: 0.12, angle: 60 }
    })
  },
  {
    id: 'fxYellow3d',
    category: '3d',
    trending: true,
    style: s('#ffe14d', ['#000000', 3], { extrude: { color: '#7b2ff7', depth: 0.1, angle: 60 } })
  },
  { id: 'fxRed3d', category: '3d', style: s('#ff3b3b', ['#ffffff', 4], { extrude: { color: '#7a0000', depth: 0.12, angle: 60 } }) },
  { id: 'fxBlue3d', category: '3d', style: s('#5ec8ff', ['#ffffff', 3], { extrude: { color: '#0b3d91', depth: 0.12, angle: 60 } }) },
  { id: 'fxRetro3d', category: '3d', style: s('#ffe9b0', ['#000000', 2], { extrude: { color: '#ff6b35', depth: 0.14, angle: 35 } }) },
  { id: 'fxBlack3d', category: '3d', style: s('#ffffff', ['#000000', 4], { extrude: { color: '#000000', depth: 0.09, angle: 60 } }) },
  { id: 'fxPink3d', category: '3d', style: s('#ff7ac8', ['#ffffff', 4], { extrude: { color: '#8a0050', depth: 0.12, angle: 60 } }) },
  { id: 'fxGreen3d', category: '3d', style: s('#8cff66', ['#0a3d0a', 3], { extrude: { color: '#0a3d0a', depth: 0.1, angle: 60 } }) },

  // Khung nền
  {
    id: 'fxYellowBrush',
    category: 'box',
    trending: true,
    style: s('#111111', null, { box: box({ shape: 'ragged', colors: ['#e6ff00'], tilt: -2 }) })
  },
  { id: 'fxRedSkew', category: 'box', trending: true, style: s('#ffffff', null, { box: box({ shape: 'skew', colors: ['#ff2d55'] }) }) },
  { id: 'fxBlackRagged', category: 'box', style: s('#ffffff', null, { box: box({ shape: 'ragged', colors: ['#111111'], tilt: 1.5 }) }) },
  { id: 'fxWhitePill', category: 'box', style: s('#111111', null, { box: box({ shape: 'pill', colors: ['#ffffff'] }) }) },
  {
    id: 'fxPinkCloud',
    category: 'box',
    trending: true,
    style: s('#ffffff', ['#ff4f8b', 4], { box: box({ shape: 'cloud', colors: ['#ffc0dc'], padX: 0.3, padY: 0.18 }) })
  },
  {
    id: 'fxBlueStripes',
    category: 'box',
    style: s('#ffffff', ['#0a2a6b', 4], { box: box({ colors: ['#2f6bff'], tilt: -3, pattern: { kind: 'stripes', color: '#ffffff40' } }) })
  },
  {
    id: 'fxPurpleGrid',
    category: 'box',
    style: s('#ffffff', ['#4b1a7a', 4], { box: box({ colors: ['#e3c6ff'], pattern: { kind: 'grid', color: '#ffffff99' }, radius: 0.08 }) })
  },
  { id: 'fxBlackBox', category: 'box', style: s('#ffffff', null, { box: box({ colors: ['#000000'], radius: 0.05 }) }) },
  { id: 'fxGradientPill', category: 'box', style: s('#ffffff', null, { box: box({ shape: 'pill', colors: ['#ff5f6d', '#ffc371'] }) }) },
  {
    id: 'fxTape',
    category: 'box',
    style: s('#3b2a1a', null, { box: box({ shape: 'ragged', colors: ['#e8d3a9'], tilt: -2 }) }, { fontFamily: 'Courier New' })
  },
  {
    id: 'fxYellowDots',
    category: 'box',
    style: s('#111111', null, { box: box({ colors: ['#ffd400'], pattern: { kind: 'dots', color: '#00000026' }, radius: 0.1 }) })
  },
  {
    id: 'fxGreenRagged',
    category: 'box',
    style: s('#ffffff', ['#000000', 3], { box: box({ shape: 'ragged', colors: ['#2ecc40', '#118a2a'] }) })
  },
  {
    id: 'fxSpeech',
    category: 'box',
    style: s('#111111', null, {
      box: box({ shape: 'cloud', colors: ['#ffffff'], padX: 0.3, padY: 0.18, stroke: { color: '#111111', width: 0.04 } })
    })
  },
  {
    id: 'fxRedFrame',
    category: 'box',
    style: s('#ffffff', null, { box: box({ colors: ['#c1121f'], radius: 0.04, stroke: { color: '#000000', width: 0.06 } }) })
  },

  // Bóng đổ
  { id: 'fxDropShadow', category: 'shadow', style: s('#ffffff', null, { shadow: { color: '#000000b0', dx: 0.05, dy: 0.06, blur: 0.08 } }) },
  {
    id: 'fxHardShadow',
    category: 'shadow',
    trending: true,
    style: s('#ffd400', ['#000000', 3], { shadow: { color: '#000000', dx: 0.08, dy: 0.08, blur: 0 } })
  },
  {
    id: 'fxSoftShadow',
    category: 'shadow',
    style: s('#ffffff', ['#000000', 2], { shadow: { color: '#000000', dx: 0, dy: 0.1, blur: 0.25 } })
  },
  {
    id: 'fxPinkHard',
    category: 'shadow',
    style: s('#ffffff', ['#ff4f8b', 4], { shadow: { color: '#ff4f8b', dx: 0.07, dy: 0.07, blur: 0 } })
  },
  {
    id: 'fxBlueHard',
    category: 'shadow',
    style: s('#ffffff', ['#1e3cff', 4], { shadow: { color: '#000000', dx: 0.1, dy: 0.1, blur: 0 } })
  },

  // Lấp lánh
  {
    id: 'fxGoldSparkle',
    category: 'sparkle',
    trending: true,
    style: s('#ffd700', ['#3a2600', 3], {
      fill: { colors: ['#fff6c2', '#ffd700', '#c08a00'], angle: 90 },
      decor: { kind: 'sparkle', color: '#fff3b0', count: 7 },
      glow: { color: '#ffd700', blur: 0.2 }
    })
  },
  { id: 'fxPinkSparkle', category: 'sparkle', style: s('#ffd6ec', ['#ff2f8f', 4], { decor: { kind: 'sparkle', color: '#ffffff', count: 6 } }) },
  {
    id: 'fxWhiteSparkle',
    category: 'sparkle',
    style: s('#ffffff', ['#000000', 3], { decor: { kind: 'sparkle', color: '#ffffff', count: 8 }, glow: { color: '#ffffff', blur: 0.2 } })
  },
  {
    id: 'fxBlueSparkle',
    category: 'sparkle',
    style: s('#5ec8ff', ['#0b3d91', 3], { fill: { colors: ['#e0f7ff', '#5ec8ff'], angle: 90 }, decor: { kind: 'sparkle', color: '#ffffff', count: 6 } })
  },

  // Vui nhộn (font khác)
  {
    id: 'fxComic',
    category: 'fun',
    trending: true,
    style: s('#ffef5a', ['#ff6a00', 5], { outlines: [{ color: '#000000', width: 0.04 }] }, { fontFamily: 'Comic Sans MS' })
  },
  { id: 'fxMeme', category: 'fun', style: s('#ffffff', ['#000000', 6], {}, { fontFamily: 'Impact', bold: false }) },
  {
    id: 'fxTypewriter',
    category: 'fun',
    style: s('#222222', null, { box: box({ colors: ['#f5f0e1'], radius: 0.04 }) }, { fontFamily: 'Courier New' })
  },
  {
    id: 'fxSerifShadow',
    category: 'fun',
    style: s('#ffffff', null, { shadow: { color: '#000000c0', dx: 0.04, dy: 0.05, blur: 0.12 } }, { fontFamily: 'Georgia', italic: true })
  },
  {
    id: 'fxArialBlackPink',
    category: 'fun',
    style: s('#ff7ac8', ['#ffffff', 5], { outlines: [{ color: '#ff2f8f', width: 0.04 }] }, { fontFamily: 'Arial Black' })
  }
]

/** Toàn bộ mẫu: bộ gốc + bộ mở rộng (textFxMore.ts). */
export const TEXT_STYLE_PRESETS: TextStylePreset[] = [...BASE_PRESETS, ...MORE_TEXT_STYLE_PRESETS]

/** Mẫu theo nhóm ("trending" = các mẫu có cờ trending). */
export function presetsIn(category: TextStyleCategory): TextStylePreset[] {
  return category === 'trending' ? TEXT_STYLE_PRESETS.filter((p) => p.trending) : TEXT_STYLE_PRESETS.filter((p) => p.category === category)
}
