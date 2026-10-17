// Đọc file dự án: kiểm tra dữ liệu và nâng cấp file từ phiên bản cũ.
//
// Vì file JSON có thể bị sửa tay, hỏng giữa chừng, hoặc tạo bởi phiên bản Cutcap khác,
// KHÔNG BAO GIỜ tin dữ liệu đọc vào. Hàm parseProject() kiểm tra từng phần quan trọng
// và điền giá trị mặc định cho trường thiếu, để phần còn lại của app không bị crash.
import { defaultColorAdjust, defaultSettings, defaultTransform } from './factory'
import {
  ASPECT_RATIOS,
  FRAME_RATES,
  KEYFRAME_PROPS,
  MEDIA_KINDS,
  PROJECT_FORMAT_VERSION,
  RESOLUTIONS,
  TEXT_ANIMATIONS,
  TRACK_KINDS,
  TRANSITION_KINDS,
  type Clip,
  type Keyframes,
  type MediaAsset,
  type Project,
  type ProjectSettings,
  type Track
} from './schema'

/** Lỗi khi file dự án không hợp lệ. `code` dùng để hiển thị thông báo theo ngôn ngữ. */
export class ProjectFormatError extends Error {
  constructor(
    public readonly code: 'invalid-json' | 'not-a-project' | 'too-new' | 'corrupted',
    detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'ProjectFormatError'
  }
}

/**
 * Các hàm nâng cấp: MIGRATIONS[n] chuyển dữ liệu từ phiên bản n lên n+1.
 * Ví dụ khi có phiên bản 2:
 *   1: (p) => ({ ...p, formatVersion: 2, markers: [] })
 */
type RawObject = Record<string, unknown>
const MIGRATIONS: Record<number, (p: RawObject) => RawObject> = {}

// ───────────── Hàm kiểm tra nhỏ ─────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}
function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
}
/** Số nguyên không âm (dùng cho thời gian micro-giây). */
function micros(v: unknown, fallback = 0): number {
  return Math.round(num(v, fallback, 0))
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}
function isOneOf<T>(v: unknown, allowed: readonly T[]): v is T {
  return allowed.includes(v as T)
}
function oneOf<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return isOneOf(v, allowed) ? v : fallback
}
function nullableStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}
function requireId(v: unknown, where: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new ProjectFormatError('corrupted', `${where}: thiếu id`)
  return v
}

// ───────────── Kiểm tra từng phần ─────────────

function parseSettings(v: unknown): ProjectSettings {
  const d = defaultSettings()
  if (!isObj(v)) return d
  return {
    aspectRatio: oneOf(v.aspectRatio, ASPECT_RATIOS, d.aspectRatio),
    resolution: oneOf(v.resolution, RESOLUTIONS, d.resolution),
    fps: oneOf(v.fps, FRAME_RATES, d.fps),
    backgroundColor: str(v.backgroundColor, d.backgroundColor)
  }
}

function parseAsset(v: unknown, key: string): MediaAsset {
  if (!isObj(v)) throw new ProjectFormatError('corrupted', `asset ${key}`)
  const kind = v.kind
  if (!isOneOf(kind, MEDIA_KINDS)) throw new ProjectFormatError('corrupted', `asset ${key}: loại media không hợp lệ`)
  return {
    id: requireId(v.id, `asset ${key}`),
    kind,
    path: str(v.path, ''),
    name: str(v.name, ''),
    durationUs: micros(v.durationUs),
    width: typeof v.width === 'number' ? v.width : null,
    height: typeof v.height === 'number' ? v.height : null,
    fps: typeof v.fps === 'number' ? v.fps : null,
    hasAudio: bool(v.hasAudio, false)
  }
}

function parseTransform(v: unknown): Clip['transform'] {
  const d = defaultTransform()
  if (!isObj(v)) return d
  return {
    x: num(v.x, d.x),
    y: num(v.y, d.y),
    scale: num(v.scale, d.scale, 0.01, 100),
    rotation: num(v.rotation, d.rotation),
    opacity: num(v.opacity, d.opacity, 0, 1)
  }
}

/** Keyframe: bỏ qua thuộc tính lạ / giá trị hỏng thay vì báo file hỏng; luôn sắp xếp lại theo thời gian. */
function parseKeyframes(v: unknown): Keyframes {
  const out: Keyframes = {}
  if (!isObj(v)) return out
  for (const prop of KEYFRAME_PROPS) {
    const list = v[prop]
    if (!Array.isArray(list)) continue
    const kfs = list
      .filter((k): k is Record<string, unknown> => isObj(k) && Number.isFinite(k.time) && Number.isFinite(k.value))
      .map((k) => ({ time: Math.round(k.time as number), value: k.value as number }))
      .sort((a, b) => a.time - b.time)
    if (kfs.length > 0) out[prop] = kfs
  }
  return out
}

function parseClip(v: unknown, where: string): Clip {
  if (!isObj(v)) throw new ProjectFormatError('corrupted', where)
  const base = {
    id: requireId(v.id, where),
    start: micros(v.start),
    duration: Math.max(1, micros(v.duration, 1)),
    transform: parseTransform(v.transform),
    // Trường mới (Keyframe): file cũ không có → không có keyframe
    keyframes: parseKeyframes(v.keyframes)
  }

  switch (v.type) {
    case 'media': {
      const adj = isObj(v.adjust) ? v.adjust : {}
      const d = defaultColorAdjust()
      const tr = isObj(v.transitionIn) ? v.transitionIn : null
      return {
        ...base,
        type: 'media',
        assetId: requireId(v.assetId, `${where}.assetId`),
        sourceIn: micros(v.sourceIn),
        speed: num(v.speed, 1, 0.25, 4),
        volume: num(v.volume, 1, 0, 2),
        fadeIn: micros(v.fadeIn),
        fadeOut: micros(v.fadeOut),
        filter: nullableStr(v.filter),
        // Trường mới (Bước 11): file cũ không có → mặc định 100%
        filterIntensity: num(v.filterIntensity, 1, 0, 1),
        adjust: {
          brightness: num(adj.brightness, d.brightness, -100, 100),
          contrast: num(adj.contrast, d.contrast, -100, 100),
          saturation: num(adj.saturation, d.saturation, -100, 100)
        },
        transitionIn: tr
          ? { kind: oneOf(tr.kind, TRANSITION_KINDS, 'fade'), duration: micros(tr.duration, 500_000) }
          : null,
        // Trường mới (Xóa giọng hát): file cũ không có → null
        vocalsRemovedFrom: typeof v.vocalsRemovedFrom === 'string' && v.vocalsRemovedFrom ? v.vocalsRemovedFrom : null
      }
    }
    case 'text': {
      const s = isObj(v.style) ? v.style : {}
      return {
        ...base,
        type: 'text',
        text: str(v.text, ''),
        style: {
          fontFamily: str(s.fontFamily, 'Segoe UI'),
          fontSize: num(s.fontSize, 64, 1, 2000),
          color: str(s.color, '#ffffff'),
          bold: bool(s.bold, false),
          italic: bool(s.italic, false),
          align: oneOf(s.align, ['left', 'center', 'right'] as const, 'center'),
          strokeColor: nullableStr(s.strokeColor),
          strokeWidth: num(s.strokeWidth, 0, 0, 100),
          backgroundColor: nullableStr(s.backgroundColor)
        },
        animationIn: oneOf(v.animationIn, TEXT_ANIMATIONS, 'none'),
        animationDuration: micros(v.animationDuration, 500_000)
      }
    }
    case 'sticker':
      return { ...base, type: 'sticker', assetId: requireId(v.assetId, `${where}.assetId`) }
    default:
      throw new ProjectFormatError('corrupted', `${where}: loại clip không hợp lệ`)
  }
}

function parseTrack(v: unknown, index: number): Track {
  const where = `track[${index}]`
  if (!isObj(v)) throw new ProjectFormatError('corrupted', where)
  const kind = v.kind
  if (!isOneOf(kind, TRACK_KINDS)) throw new ProjectFormatError('corrupted', `${where}: loại track không hợp lệ`)
  const clips = Array.isArray(v.clips) ? v.clips.map((c, i) => parseClip(c, `${where}.clip[${i}]`)) : []
  clips.sort((a, b) => a.start - b.start)
  return {
    id: requireId(v.id, where),
    kind,
    name: str(v.name, ''),
    muted: bool(v.muted, false),
    hidden: bool(v.hidden, false),
    locked: bool(v.locked, false),
    clips
  }
}

// ───────────── Hàm chính ─────────────

/**
 * Chuyển dữ liệu JSON đã parse thành Project hợp lệ.
 * @throws ProjectFormatError nếu dữ liệu không phải dự án Cutcap hoặc bị hỏng nặng
 */
export function parseProject(raw: unknown): Project {
  if (!isObj(raw) || typeof raw.formatVersion !== 'number' || !Array.isArray(raw.tracks)) {
    throw new ProjectFormatError('not-a-project')
  }
  if (raw.formatVersion > PROJECT_FORMAT_VERSION) {
    throw new ProjectFormatError('too-new', `v${raw.formatVersion}`)
  }

  // Nâng cấp lần lượt v1 → v2 → … → phiên bản hiện tại
  let data: RawObject = raw
  for (let v = raw.formatVersion; v < PROJECT_FORMAT_VERSION; v++) {
    const migrate = MIGRATIONS[v]
    if (!migrate) throw new ProjectFormatError('corrupted', `không có migration từ v${v}`)
    data = migrate(data)
  }

  const assets: Project['assets'] = {}
  if (isObj(data.assets)) {
    for (const [key, value] of Object.entries(data.assets)) {
      const asset = parseAsset(value, key)
      assets[asset.id] = asset
    }
  }

  const now = new Date().toISOString()
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    id: requireId(data.id, 'project'),
    name: str(data.name, ''),
    createdAt: str(data.createdAt, now),
    updatedAt: str(data.updatedAt, now),
    settings: parseSettings(data.settings),
    assets,
    tracks: (data.tracks as unknown[]).map(parseTrack)
  }
}

/** Đọc chuỗi JSON thành Project. */
export function parseProjectJson(text: string): Project {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new ProjectFormatError('invalid-json', (err as Error).message)
  }
  return parseProject(raw)
}

/** Chuyển Project thành chuỗi JSON để ghi file (thụt lề 2 dấu cách cho dễ đọc). */
export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2)
}
