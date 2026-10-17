// Tự động lưu (giống CapCut): mỗi khi dự án có thay đổi,
//   - dự án ĐÃ có file .cutcap → lưu thẳng vào file đó
//   - dự án CHƯA có file (khôi phục từ bản chưa từng lưu) → ghi bản sao vào thư mục autosave của app
// Thời điểm: 2 giây sau lần sửa cuối (gom nhiều thao tác liên tiếp), nhưng đang sửa liên tục thì
// tối đa 20 giây cũng lưu 1 lần.
import { currentEntryId } from './history'
import { projectStore, selectIsDirty } from './projectStore'

const QUIET_MS = 2_000
const MAX_WAIT_MS = 20_000

export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingSince: number | null = null
  let saving = false

  const flush = async (): Promise<void> => {
    timer = null
    pendingSince = null
    const state = projectStore.getState()
    if (!selectIsDirty(state)) return
    if (saving) return schedule() // lần lưu trước chưa xong → hẹn lại
    saving = true
    try {
      if (state.filePath) {
        const entry = currentEntryId(state.history)
        const result = await window.cutcap.saveProject({ project: state.project, filePath: state.filePath, saveAs: false })
        // Chỉ đánh dấu nếu vẫn là dự án đó (người dùng có thể đã mở dự án khác trong lúc lưu)
        if (result && projectStore.getState().project.id === state.project.id) {
          projectStore.getState().markSaved(result.filePath, result.savedAt, entry)
        }
      } else {
        await window.cutcap.autosaveWrite(state.project, null)
      }
    } catch (err) {
      console.error('Tự động lưu thất bại', err)
    } finally {
      saving = false
    }
  }

  function schedule(): void {
    const now = Date.now()
    pendingSince ??= now
    if (timer) clearTimeout(timer)
    const wait = Math.min(QUIET_MS, Math.max(0, MAX_WAIT_MS - (now - pendingSince)))
    timer = setTimeout(() => void flush(), wait)
  }

  const stop = projectStore.subscribe((s, prev) => {
    const dirty = selectIsDirty(s)
    if (s.project !== prev.project && dirty) schedule()
    // Vừa chuyển từ "chưa lưu" → "đã lưu" trên cùng dự án: bản tự động lưu riêng (nếu có) không cần nữa
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
