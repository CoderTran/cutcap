// "Thư viện âm thanh của bạn" (tab Âm thanh): người dùng chọn một thư mục âm thanh trên máy; app quét, bỏ file trùng,
// làm gọn tên file và chia nhóm theo từ khóa trong tên (âm thanh KHÔNG được tải lên đâu cả – chỉ đọc trên máy).
// File này chỉ có hàm thuần (dùng ở main khi quét, có test).

export const SOUND_LIBRARY_CATEGORIES = [
  'transition',
  'ui',
  'typing',
  'camera',
  'paper',
  'pop',
  'money',
  'bell',
  'funny',
  'tension',
  'music',
  'other'
] as const
export type SoundLibraryCategory = (typeof SOUND_LIBRARY_CATEGORIES)[number]

export interface SoundLibraryItem {
  path: string
  /** Tên đã làm gọn để hiển thị. */
  name: string
  category: SoundLibraryCategory
  durationUs: number
  /** File video (mp4, mpeg…): cần tách lấy âm thanh trước khi dùng. */
  fromVideo: boolean
  size: number
  mtimeMs: number
}

export interface SoundLibrary {
  folder: string | null
  items: SoundLibraryItem[]
  /** Số file trùng đã bỏ qua. */
  duplicates: number
  /** Số file không đọc được / không có tiếng. */
  skipped: number
}

/** Dài hơn bấy nhiêu mà không khớp từ khóa nào → coi là nhạc nền. */
export const MUSIC_MIN_US = 30_000_000
/** Dài hơn bấy nhiêu thì dù tên giống hiệu ứng vẫn coi là nhạc nền. */
export const LONG_MUSIC_US = 90_000_000

/** Từ khóa của từng nhóm, xét theo thứ tự (nhóm trước được ưu tiên). */
const RULES: [SoundLibraryCategory, RegExp][] = [
  [
    'music',
    /\b(music|background|beats?|instrumental|ringtone|soundtrack|cinematic|ncs|synthwave|main version|type beat|lofi|song|inspiring)\b/
  ],
  ['typing', /typing|keyboard|typewriter|spacebar/],
  ['camera', /camera|shutter|focusing/],
  ['paper', /\b(pages?|paper|flip|crinkle|rip|ripping|tape|tearing|pencil|sketch|skatch|highlighter|resaltador|waving)\b/],
  ['transition', /whoosh|woosh|swoosh|swing|riser|reverse|transition|flashback|remembering|braaam|swell|levitate|glitch/],
  ['money', /money|monry|cash|ching|coin|deposit/],
  ['ui', /click|mouse|\bdial\b|relay|\bping\b|beep|loading|battery|walkie|digital|counting|robot|electric|plastic/],
  ['pop', /\bpop\b|bubble|water drop|pokemon|squish|sprung|spring|pluck/],
  ['bell', /bell|\bding\b|\bdone\b|twinkle|gleam|discovery|correct|right tick|wrong|magic|heavenly|sparkle|cute|love|dream/],
  [
    'funny',
    /funny|comical|\bgag\b|stupid|awkward|\bfail\b|disappointment|bonk|duck|trumpet|xylophone|cartoon|tickle|blushing|nani|\bevo\b|\bwow\b|sweat|slap|\bfall\b|vein|question|cuckoo|character gone|anime|joke|crock|\bwait\b|slopp|twitch|\bpoint\b|hua|gaaa/
  ],
  [
    'tension',
    /horror|tense|suspen|sespenc|doom|shock|dun dun|depression|\bdark\b|critical|investigation|metal gear|alert|boom|\bhits?\b|orchestral|anvil|bone|crack|dramatic|epic|jail|door|clock|ticking|fighting|angry|buzzer|stomp|clap/
  ]
]

/** Chia nhóm theo tên (đã làm gọn hoặc tên file gốc) và độ dài. */
export function classifySound(name: string, durationUs: number): SoundLibraryCategory {
  const text = ` ${name.toLowerCase().replace(/[_\-.]+/g, ' ')} `
  const matched = RULES.find(([, re]) => re.test(text))?.[0]
  if (!matched) return durationUs >= MUSIC_MIN_US ? 'music' : 'other'
  // Rất dài (vài phút) mà tên giống hiệu ứng → thường là bài nhạc (trừ đoạn gõ phím / tổng hợp tiếng hài dài)
  if (durationUs >= LONG_MUSIC_US && matched !== 'typing' && matched !== 'funny') return 'music'
  return matched
}

/** Bỏ đuôi file. */
const stem = (fileName: string): string => fileName.replace(/\.[^.]+$/, '')

/**
 * Làm gọn tên file để hiển thị: bỏ tiền tố / hậu tố của trang tải, bitrate, mã video YouTube, "(1)", "Sound Effect",
 * "No copyright"…, đổi "_" thành khoảng trắng.
 */
export function cleanSoundName(fileName: string): string {
  let s = stem(fileName).replace(/\s*\(\d+\)/g, ' ') // "(1)", "(2)" của bản sao
  s = s
    .replace(/_?F0_9F(_[0-9A-F]{2}){2,}_?/g, ' ') // emoji bị mã hóa trong tên file
    .replace(/_?E2(_[0-9A-F]{2}){2}_?/g, ' ')
    .replace(/_5B/g, '[')
    .replace(/_5D/g, ']')
    .replace(/⬇️?/g, '') // "⬇️"
    .replace(/^Y2Mate\.is\s*-\s*/i, '')
    .replace(/^ES_/, '')
    .replace(/\s*-\s*SFX Producer/i, '')
    .replace(/DOWNLOAD-.*$/i, '')
    .replace(/-{1,2}[A-Za-z0-9_-]{11}-\d+k-\d+\s*$/, '') // "-alGcEs7XYo-128k-1655499992662"
    .replace(/-main-version.*$/i, '')
    .replace(/-\d{4,}\s*$/, '') // mã số của trang tải ("-24147")
    .replace(/\((\d+k|\d+ ?kbps|\d+p|getmp3\.pro)\)/gi, ' ')
    .replace(/(mp3cut|mp3)\s*$/i, '')
    .replace(/_high_quality/gi, ' ')
    .replace(/[_]+/g, ' ')
  // Tên viết liền bằng gạch ngang ("cherry-blossom-prigida") → khoảng trắng
  if (!/\s/.test(s.trim()) && (s.match(/-/g) ?? []).length >= 2) s = s.replace(/-/g, ' ')
  s = s
    .replace(/([a-z])([A-Z])/g, '$1 $2') // "ChaChingCashRegister" → "Cha Ching Cash Register"
    .replace(/#\w+/g, ' ')
    .replace(/\b(no|non)[ -]?copyr\w*( claim)?\b/gi, ' ')
    .replace(/\[\s*music\s*\]/gi, ' ') // "[NO COPYRIGHT MUSIC]" sau khi bỏ "no copyright"
    .replace(/\b(copyright[ -]?free|royalty[ -]?free|free to use|for editing|for youtube videos|official music)\b/gi, ' ')
    .replace(/\b(sound effects?|sfx|hd|non)\b/gi, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s*[([]\s*$/, '') // ngoặc mở còn sót ở cuối
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—.,!|]+|[\s\-–—.,|]+$/g, '')
    .trim()
  if (!s) s = stem(fileName).replace(/[_]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Bản sao ("tên(1).mp3") xếp sau bản gốc → khi bỏ trùng thì giữ bản gốc. */
export const isCopyName = (fileName: string): boolean => /\(\d+\)\s*$/.test(stem(fileName))

/** Khóa nhận ra bản sao: tên file (bỏ "(1)", "(2)", hoa/thường, đuôi) + dung lượng. */
export function duplicateKey(fileName: string, size: number): string {
  return `${stem(fileName)
    .replace(/\s*\(\d+\)/g, '')
    .trim()
    .toLowerCase()}|${size}`
}

/** Tên hiển thị trùng nhau → thêm " 2", " 3"… */
export function uniqueNames<T extends { name: string }>(items: T[]): T[] {
  const seen = new Map<string, number>()
  return items.map((it) => {
    const key = it.name.toLowerCase()
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return n === 1 ? it : { ...it, name: `${it.name} ${n}` }
  })
}
