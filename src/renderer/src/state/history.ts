// Lịch sử Undo/Redo dựa trên "patch" của Immer.
//
// Thay vì lưu cả bản sao dự án sau mỗi thao tác (tốn bộ nhớ), ta chỉ lưu:
//   - patches: những gì đã thay đổi (để Redo)
//   - inverse: cách đảo ngược thay đổi đó (để Undo)
// Immer tự tính 2 danh sách này khi ta sửa dữ liệu trong produceWithPatches().
//
// File này chỉ chứa hàm thuần (không React, không DOM) nên test được dễ dàng.
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'

enablePatches()

export interface HistoryEntry {
  /** Mã số duy nhất – dùng để biết trạng thái nào đã được lưu xuống file. */
  id: number
  /** Khóa i18n mô tả thao tác, ví dụ "history.addTrack" – hiện ở tooltip nút Undo. */
  label: string
  patches: Patch[]
  inverse: Patch[]
  /** Các thao tác liên tiếp cùng khóa (vd. kéo thanh trượt) được gộp thành 1 bước Undo. */
  coalesceKey: string | null
  time: number
}

export interface History {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export interface CommitOptions {
  coalesceKey?: string
  /** Chỉ gộp nếu thao tác trước cách đây không quá bấy nhiêu ms. */
  coalesceWindowMs?: number
  /** Số bước Undo tối đa giữ lại. */
  limit?: number
  /** Không cho gộp vào bước có id này (bước tương ứng với lần lưu gần nhất). */
  protectedId?: number | null
  now?: number
}

export const DEFAULT_HISTORY_LIMIT = 200
let nextEntryId = 1

export function emptyHistory(): History {
  return { past: [], future: [] }
}

/** id của bước mới nhất đã thực hiện, null nếu chưa có bước nào. */
export function currentEntryId(history: History): number | null {
  return history.past.at(-1)?.id ?? null
}

/**
 * Thực hiện một thao tác và ghi vào lịch sử.
 * @returns state và history mới. Nếu thao tác không thay đổi gì, trả về nguyên giá trị cũ.
 */
export function commit<T>(
  state: T,
  history: History,
  label: string,
  recipe: (draft: Draft<T>) => void,
  options: CommitOptions = {}
): { state: T; history: History } {
  const [nextState, patches, inverse] = produceWithPatches(state, recipe)
  if (patches.length === 0) return { state, history }

  const now = options.now ?? Date.now()
  const key = options.coalesceKey ?? null
  const last = history.past.at(-1)
  const canMerge =
    key !== null &&
    last !== undefined &&
    last.coalesceKey === key &&
    last.id !== options.protectedId &&
    now - last.time <= (options.coalesceWindowMs ?? 1000)

  let past: HistoryEntry[]
  if (canMerge) {
    // Gộp: làm lại = patch cũ rồi patch mới; hoàn tác = đảo mới trước rồi đảo cũ
    const merged: HistoryEntry = {
      ...last,
      patches: [...last.patches, ...patches],
      inverse: [...inverse, ...last.inverse],
      time: now
    }
    past = [...history.past.slice(0, -1), merged]
  } else {
    const entry: HistoryEntry = { id: nextEntryId++, label, patches, inverse, coalesceKey: key, time: now }
    past = [...history.past, entry]
  }

  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT
  if (past.length > limit) past = past.slice(past.length - limit)

  // Thao tác mới làm mất nhánh Redo
  return { state: nextState, history: { past, future: [] } }
}

export function undo<T>(state: T, history: History): { state: T; history: History } | null {
  const entry = history.past.at(-1)
  if (!entry) return null
  return {
    state: applyPatches(state as object, entry.inverse) as T,
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] }
  }
}

export function redo<T>(state: T, history: History): { state: T; history: History } | null {
  const [entry, ...rest] = history.future
  if (!entry) return null
  return {
    state: applyPatches(state as object, entry.patches) as T,
    history: { past: [...history.past, entry], future: rest }
  }
}
