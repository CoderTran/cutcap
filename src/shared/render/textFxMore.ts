// Hiệu ứng văn bản – bộ mẫu mở rộng (dựng theo các kiểu chữ phổ biến trên CapCut: viền chuyển màu, chữ rỗng,
// kết cấu kim tuyến, trang trí tuyết / lửa / tim, glitch, khung cọ…). Dùng chung kiểu dữ liệu với textFx.ts.
import type { TextBox, TextFx, TextStyle } from '../project/schema'
import type { TextStylePreset } from './textFx'

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
/** Kiểu chữ: màu chữ, viền thường [màu, độ dày], hiệu ứng, thuộc tính khác. */
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
/** Một lớp viền thêm (em); colors: viền chuyển màu. */
const o = (color: string, width: number, colors?: string[]): TextFx['outlines'][number] => ({ color, width, ...(colors ? { colors } : {}) })
const grad = (colors: string[], angle = 90, hard = false): TextFx['fill'] => ({ colors, angle, ...(hard ? { hard: true } : {}) })
const glow = (color: string, blur = 0.4): TextFx['glow'] => ({ color, blur })
const shadow = (color: string, dx: number, dy: number, blur = 0): TextFx['shadow'] => ({ color, dx, dy, blur })
const ext = (color: string, depth = 0.1, angle = 60): TextFx['extrude'] => ({ color, depth, angle })
const echo = (color: string, dx: number, dy: number, hollow = false, width = 0.035): NonNullable<TextFx['echoes']>[number] => ({
  color,
  dx,
  dy,
  hollow,
  width
})
const decor = (kind: NonNullable<TextFx['decor']>['kind'], color: string, count = 6): TextFx['decor'] => ({ kind, color, count })
const tex = (kind: NonNullable<TextFx['texture']>['kind'], color: string, amount = 0.5): TextFx['texture'] => ({ kind, color, amount })
const bevel = (light = '#ffffffcc', dark = '#00000088', size = 0.05): TextFx['bevel'] => ({ light, dark, size })

type P = Omit<TextStylePreset, 'id'> & { id: string }
const p = (id: string, category: P['category'], style: Partial<TextStyle>, trending = false): P => ({
  id,
  category,
  style,
  ...(trending ? { trending: true } : {})
})

export const MORE_TEXT_STYLE_PRESETS: TextStylePreset[] = [
  // ── Viền chữ (thêm)
  p(
    'x2WhiteSticker',
    'outline',
    s('#ffffff', ['#111111', 6], { outlines: [o('#ffffff', 0.07)], shadow: shadow('#00000080', 0.03, 0.06, 0.06) }),
    true
  ),
  p('x2MintDark', 'outline', s('#b8ffd9', ['#0b4a32', 5], { outlines: [o('#ffffff', 0.05)] })),
  p('x2PinkPurple', 'outline', s('#ffffff', ['#ff5fb8', 5], { fill: grad(['#ffd1ec', '#ff7ac8']), outlines: [o('#6a1b9a', 0.05)] })),
  p('x2BluePlainThick', 'outline', s('#3aa0ff', ['#ffffff', 7], { outlines: [o('#0b2a6b', 0.03)] })),
  p('x2LimeWhite', 'outline', s('#a8ff3e', ['#ffffff', 6], { outlines: [o('#1f4d0a', 0.04)] })),
  p('x2OrangeWhite', 'outline', s('#ff8a1f', ['#ffffff', 6], { outlines: [o('#5a2300', 0.035)] })),
  p('x2PurpleBubble', 'outline', s('#b06bff', ['#ffffff', 8], { outlines: [o('#4b1a7a', 0.04)] }), true),
  p('x2PinkBubble', 'outline', s('#ff8ccf', ['#111111', 7], { outlines: [o('#ffffff', 0.05)] })),
  p('x2BlueWhiteRed', 'outline', s('#2f6bff', ['#ffffff', 6], { outlines: [o('#ff2d2d', 0.05)] })),
  p('x2YellowRedBlue', 'outline', s('#ffe14d', ['#ff2d2d', 5], { outlines: [o('#1e3cff', 0.05)] })),
  p('x2GreenYellowBlack', 'outline', s('#3ccf3c', ['#ffe14d', 5], { outlines: [o('#111111', 0.05)] })),
  p('x2RoseThin', 'outline', s('#ffc2d6', ['#4a1a2a', 3])),
  p('x2CreamGreen', 'outline', s('#fff6d6', ['#2e5a2e', 3])),
  p('x2LightPinkGray', 'outline', s('#ffe4ef', ['#ffffff', 5], { outlines: [o('#8a8a8a', 0.03)] })),
  p('x2RedWhiteBlack', 'outline', s('#ff2d2d', ['#ffffff', 6], { outlines: [o('#111111', 0.05)] }), true),
  p('x2GoldBubbly', 'outline', s('#ffc93c', ['#ffffff', 6], { fill: grad(['#ffe680', '#ff9f1c']), outlines: [o('#7a3d00', 0.045)] })),
  p('x2SilverPlain', 'outline', s('#c8c8c8', ['#4a4a4a', 2])),

  // ── Viền chuyển màu / chữ rỗng
  p(
    'x2RainbowHollow',
    'hollow',
    s('#ffffff', null, { hollow: true, outlines: [o('#fff', 0.05, ['#ff3b3b', '#ffb300', '#2ecc71', '#1e90ff', '#9b30ff'])] }),
    true
  ),
  p(
    'x2RedHollow',
    'hollow',
    s('#ffffff', null, { hollow: true, outlines: [o('#ff2d2d', 0.05, ['#ff2d2d', '#ff9f1c']), o('#2a0000', 0.03)] })
  ),
  p('x2GrayHollowGlow', 'hollow', s('#ffffff', null, { hollow: true, outlines: [o('#bdbdbd', 0.045)], glow: glow('#000000', 0.35) })),
  p(
    'x2WhiteHollowDouble',
    'hollow',
    s('#ffffff', null, { hollow: true, outlines: [o('#ffffff', 0.035), o('#111111', 0.035), o('#ffffff', 0.03)] })
  ),
  p('x2OliveHollow', 'hollow', s('#ffffff', null, { hollow: true, outlines: [o('#6b6b2a', 0.05)] })),
  p('x2DarkPurpleHollow', 'hollow', s('#ffffff', null, { hollow: true, outlines: [o('#7a3cff', 0.045)], glow: glow('#7a3cff', 0.35) })),
  p('x2TealHollow', 'hollow', s('#ffffff', null, { hollow: true, outlines: [o('#1fb5a8', 0.045), o('#0b3d3a', 0.03)] })),
  p('x2GrayHollow', 'hollow', s('#ffffff', null, { hollow: true, outlines: [o('#9e9e9e', 0.04)] })),
  p(
    'x2CyanGradOutline',
    'hollow',
    s('#ffffff', null, { outlines: [o('#fff', 0.06, ['#00e5ff', '#2f6bff'])], glow: glow('#00b7ff', 0.3) }),
    true
  ),
  p('x2OrangeGradOutline', 'outline', s('#3a1500', null, { outlines: [o('#fff', 0.07, ['#ffe14d', '#ff7a00', '#ff2d2d'])] })),
  p('x2MultiOutline', 'outline', s('#ffffff', null, { outlines: [o('#fff', 0.06, ['#1fb5a8', '#ff9f1c', '#ff4f8b'])] })),
  p(
    'x2PastelRainbow',
    'outline',
    s('#ffffff', ['#ffb3d9', 5], { outlines: [o('#fff', 0.05, ['#a0e7ff', '#ffd6a5', '#caffbf']), o('#7a5cff', 0.025)] })
  ),
  p(
    'x2NavyMagenta',
    'outline',
    s('#ff2fb3', null, { fill: grad(['#ff2fb3', '#3a0a6b']), outlines: [o('#fff', 0.05, ['#1e3cff', '#00e5ff'])] })
  ),

  // ── Phát sáng (thêm)
  p('x2YellowNeon', 'glow', s('#fff9b0', ['#ffe600', 4], { glow: glow('#ffe600', 0.5) }), true),
  p('x2BlueWhiteGlow', 'glow', s('#5ec8ff', ['#ffffff', 3], { glow: glow('#ffffff', 0.4) })),
  p('x2PinkWhiteGlow', 'glow', s('#ff4fa3', ['#ffffff', 4], { glow: glow('#ff4fa3', 0.45) })),
  p('x2LavenderGlow', 'glow', s('#e6d6ff', ['#9b5cff', 4], { glow: glow('#b38bff', 0.45) })),
  p('x2PinkRedNeon', 'glow', s('#ffe1e6', ['#ff2d55', 4], { glow: glow('#ff2d55', 0.5) })),
  p('x2RedWhiteGlow', 'glow', s('#ff2d2d', ['#ffffff', 5], { glow: glow('#ff2d2d', 0.5) })),
  p('x2LimeGlow', 'glow', s('#c6ff3d', ['#1f4d0a', 4], { glow: glow('#7cff00', 0.45) })),
  p('x2WhiteViolet', 'glow', s('#ffffff', ['#5b2bff', 4], { glow: glow('#8a5cff', 0.5) })),
  p('x2HotPinkGlow', 'glow', s('#ffffff', ['#ff1f8f', 3], { glow: glow('#ff1f8f', 0.55) })),
  p('x2SoftPinkGlow', 'glow', s('#fff0f6', null, { glow: glow('#ffb3d9', 0.4) })),
  p('x2OrangeGlow', 'glow', s('#ffd1a0', ['#ff7a00', 3], { glow: glow('#ff7a00', 0.45) })),

  // ── Chuyển màu (thêm)
  p('x2PinkGrad', 'gradient', s('#ff9ac8', ['#ffffff', 5], { fill: grad(['#ffd1e8', '#ff5fa8']), outlines: [o('#c2185b', 0.035)] }), true),
  p('x2SkyRoyal', 'gradient', s('#5ec8ff', ['#ffffff', 4], { fill: grad(['#a0e9ff', '#1e3cff']) })),
  p('x2PurpleMagenta', 'gradient', s('#c471f5', null, { fill: grad(['#ff6ec4', '#7873f5']), outlines: [o('#ffffff', 0.04)] })),
  p('x2Violet', 'gradient', s('#9b5cff', ['#2a0a4a', 3], { fill: grad(['#d9b3ff', '#7a3cff']) })),
  p('x2LimeYellow', 'gradient', s('#d4fc79', ['#1e5a2e', 4], { fill: grad(['#fff35c', '#7cff00']) })),
  p('x2OrangeTeal', 'gradient', s('#ff9f1c', ['#ffffff', 4], { fill: grad(['#ff9f1c', '#1fb5a8'], 0) })),
  p('x2PeachSoft', 'gradient', s('#ffcfa8', ['#ffffff', 4], { fill: grad(['#fff0e0', '#ff9a6b']) })),
  p('x2OrangeRedGrad', 'gradient', s('#ff7a00', ['#ffffff', 5], { fill: grad(['#ffd200', '#ff3b3b']), outlines: [o('#3a0a0a', 0.035)] })),
  p('x2YellowOrange', 'gradient', s('#ffd200', ['#ffe680', 3], { fill: grad(['#fff35c', '#ff8a00']), outlines: [o('#7a3d00', 0.03)] })),
  p('x2HalfOrange', 'gradient', s('#ff8a1f', ['#3a1500', 3], { fill: grad(['#ffffff', '#ff8a1f'], 90, true) }), true),
  p('x2HalfYellowBlack', 'gradient', s('#ffe600', ['#111111', 3], { fill: grad(['#111111', '#ffe600'], 90, true) })),
  p('x2HalfRedWhite', 'gradient', s('#ffffff', ['#111111', 4], { fill: grad(['#ffffff', '#ff2d2d'], 90, true) })),
  p(
    'x2HalfPinkBlue',
    'gradient',
    s('#ffffff', ['#ffffff', 4], { fill: grad(['#ff7ac8', '#5ec8ff'], 0, true), outlines: [o('#2a0a4a', 0.035)] })
  ),

  // ── Kim loại (thêm)
  p('x2Champagne', 'metal', s('#f3e5c0', ['#6b5a2e', 2], { fill: grad(['#ffffff', '#e8d3a0', '#b89b5e', '#fff1c9']), bevel: bevel() })),
  p(
    'x2Gold3d',
    'metal',
    s('#ffd700', ['#5a3d00', 3], { fill: grad(['#fff6c2', '#ffd700', '#b8860b']), extrude: ext('#6b4500', 0.08), bevel: bevel() }),
    true
  ),
  p(
    'x2GoldEmboss',
    'metal',
    s('#ffd24d', ['#4a3000', 2], { fill: grad(['#fff2b3', '#e6a800', '#fff2b3', '#b37700']), bevel: bevel('#fffbe0', '#5a3d00aa', 0.06) })
  ),
  p('x2SilverEmboss', 'metal', s('#d9d9d9', ['#222222', 2], { fill: grad(['#ffffff', '#9e9e9e', '#f5f5f5', '#5e5e5e']), bevel: bevel() })),
  p('x2Copper', 'metal', s('#d9825b', ['#3a1a0a', 2], { fill: grad(['#ffd6bf', '#c46a3a', '#ffb38a', '#7a3418']), bevel: bevel() })),
  p('x2GoldOlive', 'metal', s('#d4b44a', ['#3d3a12', 3], { fill: grad(['#f7e7a0', '#a88f2a']) })),

  // ── 3D (thêm)
  p('x2Peach3d', '3d', s('#ffd9a0', ['#ffffff', 3], { extrude: ext('#c46a3a', 0.1) })),
  p('x2Lavender3d', '3d', s('#d9c7ff', ['#ffffff', 4], { extrude: ext('#6a4bb5', 0.11) })),
  p('x2Magenta3d', '3d', s('#ff2fb3', ['#ffffff', 3], { extrude: ext('#6a004a', 0.12) }), true),
  p('x2DarkPurple3d', '3d', s('#6a2bb5', ['#e0c8ff', 3], { extrude: ext('#1a0033', 0.12) })),
  p('x2Pastel3d', '3d', s('#fff1d6', ['#ffffff', 3], { extrude: ext('#e0b48a', 0.1), outlines: [o('#8a5a3a', 0.025)] })),
  p('x2Comic3d', '3d', s('#ffe14d', ['#111111', 4], { extrude: ext('#00b7ff', 0.1, 45) })),
  p('x2White3dGray', '3d', s('#ffffff', ['#cfcfcf', 2], { extrude: ext('#6e6e6e', 0.08) })),
  p('x2BlueOutline3d', '3d', s('#ffffff', ['#1e3cff', 5], { extrude: ext('#0b1a4a', 0.12) })),

  // ── Khung nền (thêm)
  p('x2PinkScribble', 'box', s('#ffffff', ['#ff4f8b', 4], { box: box({ shape: 'scribble', colors: ['#ffb3d1'] }) }), true),
  p('x2GreenScribble', 'box', s('#ffffff', ['#1f4d0a', 4], { box: box({ shape: 'scribble', colors: ['#7ed957'] }) })),
  p('x2BlueScribble', 'box', s('#ffffff', ['#0b2a6b', 4], { box: box({ shape: 'scribble', colors: ['#2f6bff'] }) })),
  p(
    'x2BlackGlitterBox',
    'box',
    s('#ffffff', null, { box: box({ shape: 'ragged', colors: ['#1a1a1a'] }), texture: tex('glitter', '#bdbdbd', 0.6) })
  ),
  p('x2WhiteRaggedBox', 'box', s('#111111', null, { box: box({ shape: 'ragged', colors: ['#ffffff'] }) })),
  p(
    'x2BlackWhiteFrame',
    'box',
    s('#ffffff', null, { box: box({ colors: ['#111111'], radius: 0.03, stroke: { color: '#ffffff', width: 0.05 } }) })
  ),
  p('x2LavenderBox', 'box', s('#ffffff', ['#6a4bb5', 3], { box: box({ colors: ['#c9b3ff'], radius: 0.06 }) })),
  p(
    'x2PinkGridBox',
    'box',
    s('#ffffff', ['#c2185b', 4], { box: box({ colors: ['#ffc2e0'], pattern: { kind: 'grid', color: '#ffffffaa' }, radius: 0.06 }) })
  ),
  p('x2SalmonHearts', 'box', s('#3a0a0a', null, { box: box({ colors: ['#ff9e8a'], radius: 0.04 }), decor: decor('heart', '#ffffff', 5) })),
  p(
    'x2ComicBurst',
    'box',
    s('#ffe14d', ['#111111', 5], {
      box: box({ shape: 'ragged', colors: ['#ff2d2d'], padX: 0.4, padY: 0.25 }),
      extrude: ext('#00b7ff', 0.06, 45)
    }),
    true
  ),
  p('x2RedSplatBox', 'box', s('#ffffff', ['#111111', 4], { box: box({ shape: 'ragged', colors: ['#d10f1f'], tilt: -2 }) })),
  p(
    'x2YellowStripesBox',
    'box',
    s('#ffe600', ['#111111', 5], { box: box({ colors: ['#111111'], pattern: { kind: 'stripes', color: '#ffe60055' }, radius: 0.05 }) })
  ),
  p('x2BrownBrush', 'box', s('#ffffff', null, { box: box({ shape: 'brush', colors: ['#8a4a1f'] }) }), true),
  p('x2TanBrush', 'box', s('#3b2a1a', null, { box: box({ shape: 'brush', colors: ['#d8b07a'] }) })),
  p('x2BlackBrush', 'box', s('#ffffff', null, { box: box({ shape: 'brush', colors: ['#111111'] }) })),
  p('x2PinkBrush', 'box', s('#ffffff', null, { box: box({ shape: 'brush', colors: ['#ff4f8b'] }) })),
  p('x2DarkRedBox', 'box', s('#ffffff', null, { box: box({ colors: ['#7a0a14'], radius: 0.02 }) })),
  p('x2PaperGreen', 'box', s('#2e8b3a', ['#ffffff', 3], { box: box({ shape: 'ragged', colors: ['#f2ead3'], tilt: 2 }) })),
  p('x2GreenBlock', 'box', s('#111111', null, { box: box({ colors: ['#9be37b'], radius: 0.03 }) })),
  p(
    'x2StitchBlue',
    'box',
    s('#ffffff', ['#1e3cff', 3], {
      box: box({
        colors: ['#a8c8ff'],
        radius: 0.08,
        pattern: { kind: 'dots', color: '#ffffff99' },
        stroke: { color: '#ffffff', width: 0.03 }
      })
    })
  ),
  p('x2RibbonRed', 'box', s('#ffffff', null, { box: box({ shape: 'banner', colors: ['#e0262f'] }) }), true),
  p('x2RibbonBlue', 'box', s('#ffffff', null, { box: box({ shape: 'banner', colors: ['#2f6bff', '#1a3ca8'] }) })),
  p('x2RibbonGold', 'box', s('#3a2600', null, { box: box({ shape: 'banner', colors: ['#ffe680', '#d4a017'] }) })),
  p('x2TornWhiteRed', 'box', s('#e0262f', null, { box: box({ shape: 'ragged', colors: ['#ffffff'], tilt: -1.5 }) })),
  p(
    'x2TealStripesRed',
    'box',
    s('#ff2d2d', ['#ffffff', 4], { box: box({ shape: 'ragged', colors: ['#1fb5a8'], pattern: { kind: 'stripes', color: '#ffffff40' } }) })
  ),
  p('x2SmokeBox', 'box', s('#ffffff', null, { box: box({ shape: 'ragged', colors: ['#5e5e5e', '#2a2a2a'] }), glow: glow('#000000', 0.2) })),

  // ── Bóng đổ (thêm)
  p('x2RedRetro', 'shadow', s('#ff2d2d', ['#ffffff', 4], { shadow: shadow('#ffffff', 0.07, 0.07) })),
  p('x2BeigeShadow', 'shadow', s('#f3e5c0', null, { shadow: shadow('#3a2a1a', 0.05, 0.06, 0.03) })),
  p('x2WhiteGrayShadow', 'shadow', s('#ffffff', null, { shadow: shadow('#9e9e9e', 0.06, 0.06) })),
  p('x2LongShadow', 'shadow', s('#ffffff', null, { extrude: ext('#00000066', 0.3, 45) })),

  // ── Kết cấu
  p('x2WhiteGlitter', 'texture', s('#ffffff', ['#2a2a2a', 4], { texture: tex('glitter', '#ff9ac8', 0.6) }), true),
  p('x2PinkGlitter', 'texture', s('#ff7ac8', ['#ffffff', 4], { texture: tex('glitter', '#ffffff', 0.7) })),
  p('x2GrayGlitter', 'texture', s('#a0a0a0', ['#2a2a2a', 3], { texture: tex('glitter', '#ffffff', 0.7) })),
  p(
    'x2GoldGlitter',
    'texture',
    s('#ffd700', ['#4a3000', 3], { fill: grad(['#fff2b3', '#d4a017']), texture: tex('glitter', '#ffffff', 0.6) })
  ),
  p('x2Grunge', 'texture', s('#ffffff', ['#111111', 5], { texture: tex('noise', '#111111', 0.6) })),
  p('x2GrungeRed', 'texture', s('#e0262f', ['#111111', 4], { texture: tex('noise', '#2a0000', 0.6) })),
  p('x2Halftone', 'texture', s('#ffe14d', ['#111111', 5], { texture: tex('halftone', '#ff4f8b', 0.9) })),
  p('x2HalftoneBlue', 'texture', s('#5ec8ff', ['#111111', 5], { texture: tex('halftone', '#ffffff', 0.8) })),
  p('x2Candy', 'texture', s('#ffffff', ['#c2185b', 5], { texture: tex('stripes', '#ff2d55', 0.9) }), true),
  p('x2XmasStripes', 'texture', s('#ffffff', ['#0b5a2a', 5], { texture: tex('stripes', '#e0262f', 0.9) })),
  p('x2DenimStripes', 'texture', s('#3a6bd1', ['#ffffff', 4], { texture: tex('stripes', '#1a3c8a', 0.6) })),

  // ── Trang trí
  p('x2SnowRed', 'decor', s('#e0262f', ['#ffffff', 4], { outlines: [o('#111111', 0.035)], decor: decor('snow', '#ffffff') }), true),
  p('x2SnowWhite', 'decor', s('#ffffff', ['#1e3cff', 4], { decor: decor('snow', '#ffffff') })),
  p(
    'x2Fire',
    'decor',
    s('#ffd200', ['#3a0000', 4], { fill: grad(['#fff35c', '#ff7a00']), decor: decor('flame', '#ff5a00'), glow: glow('#ff5a00', 0.25) }),
    true
  ),
  p('x2FireDark', 'decor', s('#2a0a00', ['#ff7a00', 3], { decor: decor('flame', '#ff3b00'), glow: glow('#ff3b00', 0.3) })),
  p('x2Drip', 'decor', s('#ffd200', ['#7a00b3', 4], { fill: grad(['#fff35c', '#ff8a00']), decor: decor('drip', '#7a00b3', 6) })),
  p('x2DripPink', 'decor', s('#ff7ac8', ['#ffffff', 4], { decor: decor('drip', '#ff7ac8', 6) })),
  p('x2Hearts', 'decor', s('#ff7ac8', ['#ffffff', 5], { decor: decor('heart', '#ff4f8b', 6) }), true),
  p('x2HeartsWhite', 'decor', s('#ffffff', ['#ff4fa3', 5], { decor: decor('heart', '#ffffff', 5) })),
  p('x2Stars', 'decor', s('#ffffff', ['#111111', 4], { decor: decor('star', '#ffd400', 6) })),
  p('x2StarsBig', 'decor', s('#ffffff', ['#c9a227', 3], { decor: decor('star', '#ffe680', 4), glow: glow('#ffd400', 0.2) })),
  p('x2StarYellow', 'decor', s('#ffe14d', ['#111111', 5], { decor: decor('star', '#ffffff', 5) })),
  p('x2Bubbles', 'decor', s('#ffffff', ['#ff4fa3', 5], { decor: decor('bubble', '#ffffff', 10) })),
  p('x2Confetti', 'decor', s('#ffffff', ['#111111', 5], { decor: decor('confetti', '#ffffff', 14) })),
  p('x2Party', 'decor', s('#3ccf3c', ['#ffffff', 4], { decor: decor('confetti', '#ffd400', 14) })),
  p('x2PurpleStars', 'decor', s('#c471f5', ['#ffffff', 4], { decor: decor('star', '#ffffff', 6), glow: glow('#c471f5', 0.25) })),

  // ── Lệch màu (glitch) / bản sao lệch
  p('x2GlitchRgb', 'glitch', s('#ffffff', null, { echoes: [echo('#ff0040', -0.05, 0), echo('#00e5ff', 0.05, 0)] }), true),
  p('x2GlitchDark', 'glitch', s('#111111', null, { echoes: [echo('#ff2fb3', -0.05, 0.02), echo('#00e5ff', 0.05, -0.02)] })),
  p('x2GlitchBlueYellow', 'glitch', s('#ffffff', ['#111111', 3], { echoes: [echo('#1e3cff', 0.06, 0.06), echo('#ffd400', -0.05, -0.04)] })),
  p(
    'x2EchoPink',
    'glitch',
    s('#ffffff', null, { echoes: [echo('#ff4f8b', 0.07, 0.07, true, 0.035), echo('#ff4f8b', 0.14, 0.14, true, 0.03)] })
  ),
  p(
    'x2EchoRainbow',
    'glitch',
    s('#ffffff', ['#111111', 3], { echoes: [echo('#ff3b3b', 0.12, 0.12), echo('#ffd400', 0.08, 0.08), echo('#2ecc71', 0.04, 0.04)] })
  ),
  p('x2EchoBlue', 'glitch', s('#111111', null, { echoes: [echo('#2f6bff', 0.06, 0.04), echo('#111111', 0.1, 0.07, true, 0.025)] })),
  p('x2SplashColor', 'glitch', s('#ffffff', ['#111111', 4], { echoes: [echo('#ffd400', -0.07, 0.05), echo('#2f6bff', 0.07, -0.05)] })),
  p(
    'x2GhostGray',
    'glitch',
    s('#ffffff', null, { hollow: false, echoes: [echo('#9e9e9e', 0.05, 0.05, true, 0.03)], glow: glow('#00000088', 0.2) })
  )
]
