// Danh sách Hiệu ứng âm thanh (tab Âm thanh → Hiệu ứng âm thanh), gồm 2 loại – đều miễn phí, dùng được cả thương mại:
//   - TỔNG HỢP ngay trong app (engine/sfx/sfxSynth.ts) – SFX bên dưới
//   - file có sẵn trong bộ cài: hiệu ứng của Kenney.nl, giấy phép CC0 (resources/sfx/kenney) – SFX_BUNDLED
// Tên hiển thị: i18n sfx.items.<id>.
import { SFX_BUNDLED } from './sfxBundled'

export const SFX_CATEGORIES = [
  'trending',
  'transition',
  'impact',
  'ui',
  'cartoon',
  'funny',
  'tension',
  'bell',
  'money',
  'foley',
  'game',
  'jingle'
] as const
export type SfxCategory = (typeof SFX_CATEGORIES)[number]

export interface SfxDef {
  id: string
  /** Nhóm đầu tiên là nhóm chính; một hiệu ứng có thể nằm ở nhiều nhóm. */
  categories: readonly SfxCategory[]
  /** Độ dài (giây). */
  duration: number
  /** File có sẵn trong bộ cài (resources/sfx/kenney); không có = tổng hợp trong app. */
  file?: string
}

export const SFX = [
  { id: 'ding', categories: ['bell', 'trending', 'ui'], duration: 1.4 },
  { id: 'bell', categories: ['bell'], duration: 2.5 },
  { id: 'chime', categories: ['bell', 'ui'], duration: 1.2 },
  { id: 'magic', categories: ['cartoon', 'trending'], duration: 1.6 },
  { id: 'whoosh', categories: ['transition', 'trending'], duration: 0.9 },
  { id: 'swoosh', categories: ['transition'], duration: 0.4 },
  { id: 'riser', categories: ['transition', 'tension'], duration: 2.2 },
  { id: 'impact', categories: ['transition', 'tension', 'trending'], duration: 1.6 },
  { id: 'explosion', categories: ['tension', 'trending'], duration: 2.4 },
  { id: 'heartbeat', categories: ['tension'], duration: 2 },
  { id: 'clock', categories: ['tension', 'ui'], duration: 2 },
  { id: 'click', categories: ['ui'], duration: 0.15 },
  { id: 'typing', categories: ['ui', 'trending'], duration: 1.6 },
  { id: 'shutter', categories: ['ui'], duration: 0.4 },
  { id: 'notify', categories: ['ui', 'bell'], duration: 0.8 },
  { id: 'correct', categories: ['ui', 'funny'], duration: 0.6 },
  { id: 'wrong', categories: ['ui', 'funny'], duration: 0.6 },
  { id: 'pop', categories: ['cartoon', 'ui'], duration: 0.2 },
  { id: 'bubbles', categories: ['cartoon'], duration: 1.2 },
  { id: 'boing', categories: ['cartoon', 'funny'], duration: 0.9 },
  { id: 'slideUp', categories: ['cartoon', 'funny'], duration: 0.8 },
  { id: 'slideDown', categories: ['cartoon', 'funny'], duration: 0.8 },
  { id: 'coin', categories: ['cartoon', 'funny'], duration: 0.6 },
  { id: 'laser', categories: ['funny', 'cartoon'], duration: 0.4 },
  { id: 'glitch', categories: ['transition', 'tension'], duration: 0.8 }
] as const satisfies readonly SfxDef[]

export type SfxId = (typeof SFX)[number]['id']

/** Vài hiệu ứng có sẵn đưa thêm vào nhóm "Thịnh hành". */
const TRENDING_BUNDLED = new Set([
  'kImpactpunchHeavy000',
  'kPowerup1',
  'kConfirmation001',
  'kHandlecoins',
  'kJinglesNes00',
  'kJinglesHit00'
])

/** Toàn bộ hiệu ứng (tổng hợp + có sẵn), dạng SfxDef (dễ lọc / tìm). */
export const SFX_LIST: readonly SfxDef[] = [
  ...SFX,
  ...SFX_BUNDLED.map((s) => (TRENDING_BUNDLED.has(s.id) ? { ...s, categories: [...s.categories, 'trending' as const] } : s))
]

export const sfxById = (id: string): SfxDef | undefined => SFX_LIST.find((s) => s.id === id)
