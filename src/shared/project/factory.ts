// Các hàm tạo object mới với giá trị mặc định.
// Luôn tạo dữ liệu qua đây thay vì tự viết object bằng tay, để không quên trường nào.
import {
  PROJECT_FORMAT_VERSION,
  type ColorAdjust,
  type Id,
  type Project,
  type ProjectSettings,
  type Track,
  type TrackKind,
  type Transform
} from './schema'

/** Tạo id ngẫu nhiên. crypto.randomUUID có sẵn cả trong Node.js lẫn Chromium. */
export function createId(): Id {
  return crypto.randomUUID()
}

export function defaultSettings(): ProjectSettings {
  return {
    aspectRatio: '16:9',
    resolution: '1080p',
    fps: 30,
    backgroundColor: '#000000'
  }
}

export function defaultTransform(): Transform {
  return { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 }
}

export function defaultColorAdjust(): ColorAdjust {
  return { brightness: 0, contrast: 0, saturation: 0 }
}

export function createTrack(kind: TrackKind, name = ''): Track {
  return { id: createId(), kind, name, muted: false, hidden: false, locked: false, clips: [] }
}

/**
 * Tạo dự án trống, có sẵn 1 track video chính (giống CapCut).
 * @param name tên dự án
 * @param now  thời điểm tạo – truyền vào để test cho kết quả cố định
 */
export function createEmptyProject(name: string, now: Date = new Date()): Project {
  const iso = now.toISOString()
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    id: createId(),
    name,
    createdAt: iso,
    updatedAt: iso,
    settings: defaultSettings(),
    assets: {},
    tracks: [createTrack('video')]
  }
}
