// Phím tắt toàn ứng dụng. Thêm phím tắt mới = thêm 1 dòng vào SHORTCUTS.
import { useEffect } from 'react'
import { appStore } from '../state/appStore'
import { editorStore } from '../state/editorStore'
import { openExportDialog } from '../state/exportStore'
import { newProject, openProject, saveProject } from '../state/fileActions'
import { goToEnd, goToStart, stepFrames, togglePlay } from '../state/playbackActions'
import { redo, undo } from '../state/projectActions'
import { projectStore } from '../state/projectStore'
import {
  copySelected,
  cutSelected,
  deleteSelected,
  paste,
  selectAll,
  splitAtPlayhead
} from '../state/timelineActions'

interface Shortcut {
  /** Dạng "Ctrl+Shift+S". Phím chữ viết hoa; phím đặc biệt theo KeyboardEvent.key: "Delete", " "… */
  keys: string
  run: () => void
  /** true = vẫn chạy khi đang gõ trong ô nhập chữ (mặc định: không). */
  allowInInput?: boolean
  /** true = dùng được ở Trang chủ (mặc định: chỉ trong trình chỉnh sửa). */
  onHome?: boolean
}

const SHORTCUTS: Shortcut[] = [
  { keys: 'Ctrl+N', run: () => void newProject(), onHome: true },
  { keys: 'Ctrl+O', run: () => void openProject(), onHome: true },
  { keys: 'Ctrl+S', run: () => void saveProject(false), allowInInput: true },
  { keys: 'Ctrl+Shift+S', run: () => void saveProject(true), allowInInput: true },
  { keys: 'Ctrl+Z', run: undo },
  { keys: 'Ctrl+Y', run: redo },
  { keys: 'Ctrl+Shift+Z', run: redo },
  { keys: 'Ctrl+B', run: splitAtPlayhead },
  { keys: 'Delete', run: deleteSelected },
  { keys: 'Backspace', run: deleteSelected },
  { keys: 'Ctrl+C', run: copySelected },
  { keys: 'Ctrl+X', run: cutSelected },
  { keys: 'Ctrl+V', run: paste },
  { keys: 'Ctrl+A', run: selectAll },
  { keys: 'Escape', run: () => editorStore.getState().clearSelection() },
  { keys: 'Space', run: togglePlay },
  { keys: 'ArrowLeft', run: () => stepFrames(-1) },
  { keys: 'ArrowRight', run: () => stepFrames(1) },
  // Shift + mũi tên: nhảy 1 giây
  { keys: 'Shift+ArrowLeft', run: () => stepFrames(-fps()) },
  { keys: 'Shift+ArrowRight', run: () => stepFrames(fps()) },
  { keys: 'Home', run: goToStart },
  { keys: 'End', run: goToEnd },
  { keys: 'Ctrl+E', run: openExportDialog }
]

function fps(): number {
  return projectStore.getState().project.settings.fps
}

/** Chuyển sự kiện bàn phím thành chuỗi dạng "Ctrl+Shift+S" để so sánh. */
export function eventToKeys(e: Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey' | 'key' | 'code'>): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  // Phím chữ: dùng vị trí phím vật lý (e.code = "KeyB") thay vì ký tự, để phím tắt vẫn chạy
  // khi đang bật bộ gõ tiếng Việt (Unikey/EVKey) hoặc bàn phím ngôn ngữ khác.
  if (e.code?.startsWith('Key')) parts.push(e.code.slice(3))
  else if (e.code === 'Space') parts.push('Space')
  else parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
  return parts.join('+')
}

/** Các loại <input> mà người dùng gõ chữ vào. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'number', 'email', 'password', 'url', 'tel'])
/** Phím mà thanh trượt / ô chọn dùng cho chính nó (đổi giá trị). */
const CONTROL_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

/** Đang gõ chữ? Khi đó Ctrl+Z phải là undo của ô nhập, không phải của dự án. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type)
}

/**
 * Phím có nên để cho phần tử đang focus tự xử lý không:
 *  - ô nhập chữ: mọi phím (trừ phím tắt được đánh dấu allowInInput)
 *  - thanh trượt, ô chọn: chỉ các phím điều hướng; Ctrl+Z, Space… vẫn là phím tắt của app
 */
function belongsToFocusedControl(e: KeyboardEvent): boolean {
  if (isTypingTarget(e.target)) return true
  const el = e.target
  const isControl = el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === 'range')
  return isControl && CONTROL_KEYS.has(e.key)
}

/** Gắn phím tắt cho cả cửa sổ. Gọi 1 lần trong App. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const keys = eventToKeys(e)
      const shortcut = SHORTCUTS.find((s) => s.keys === keys)
      if (!shortcut) return
      if (appStore.getState().view === 'home' && !shortcut.onHome) return
      // Đang mở hộp thoại (vd. Xuất video) → không để phím tắt tác động lên timeline phía sau
      if (document.querySelector('[aria-modal="true"]')) return
      if (!shortcut.allowInInput && belongsToFocusedControl(e)) return
      e.preventDefault()
      shortcut.run()
    }
    // Space trên một nút đang được focus sẽ "bấm" nút đó khi NHẢ phím → chặn, để Space chỉ là Play/Pause
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
}
