// Tự động lưu: khi dự án có thay đổi chưa lưu, ghi một bản sao vào thư mục autosave của app
// (KHÔNG ghi đè file .cutcap của người dùng).
//   - ghi 3 giây sau lần sửa cuối (gom nhiều thao tác liên tiếp thành 1 lần ghi)
//   - nhưng đang sửa liên tục thì tối đa 30 giây cũng ghi 1 lần
//   - người dùng Lưu xong (hoặc Undo về đúng trạng thái đã lưu) → xóa bản tự động lưu
import { projectStore, selectIsDirty } from './projectStore'

const QUIET_MS = 3_000
const MAX_WAIT_MS = 30_000

export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingSince: number | null = null

  const flush = (): void => {
    timer = null
    pendingSince = null
    const state = projectStore.getState()
    if (!selectIsDirty(state)) return
    window.cutcap.autosaveWrite(state.project, state.filePath).catch((err) => console.error('Tự động lưu thất bại', err))
  }

  const schedule = (): void => {
    const now = Date.now()
    pendingSince ??= now
    if (timer) clearTimeout(timer)
    const wait = Math.min(QUIET_MS, Math.max(0, MAX_WAIT_MS - (now - pendingSince)))
    timer = setTimeout(flush, wait)
  }

  const stop = projectStore.subscribe((s, prev) => {
    const dirty = selectIsDirty(s)
    if (s.project !== prev.project && dirty) schedule()
    // Vừa chuyển từ "chưa lưu" → "đã lưu" trên cùng dự án: không cần bản tự động lưu nữa
    if (!dirty && selectIsDirty(prev) && s.project.id === prev.project.id) {
      if (timer) clearTimeout(timer)
      timer = null
      pendingSince = null
      void window.cutcap.autosaveClear(s.project.id)
    }
  })

  return () => {
    stop()
    if (timer) clearTimeout(timer)
  }
}
