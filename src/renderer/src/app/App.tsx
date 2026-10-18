// Hai màn hình: Trang chủ (danh sách dự án) và trình chỉnh sửa.
// Bố cục trình chỉnh sửa theo CapCut PC:
//   ┌────────────────────── thanh tiêu đề ──────────────────────┐
//   ├──────────────┬────────────────────┬──────────────────────┤
//   │  Bảng trái   │     Xem trước      │      Bảng phải       │
//   │ (media, chữ…)│                    │   (thuộc tính clip)  │
//   ├══════════════╧════ thanh kéo ═════╧══════════════════════┤
//   │                        Timeline                          │
//   └──────────────────────────────────────────────────────────┘
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../state/appStore'
import { startAutosave } from '../state/autosave'
import { startExportSync } from '../state/exportStore'
import { loadFavorites } from '../state/favoritesStore'
import { handleCloseRequest, openProjectPath } from '../state/fileActions'
import { startMediaSync } from '../state/mediaActions'
import { projectStore, selectIsDirty, useProjectStore } from '../state/projectStore'
import { editorStore } from '../state/editorStore'
import { pruneSelection, removeEmptyTexts } from '../state/timelineActions'
import { CoverDialog } from '../ui/Cover/CoverDialog'
import { ExportDialog } from '../ui/Export/ExportDialog'
import { HomeScreen } from '../ui/Home/HomeScreen'
import { Inspector } from '../ui/Inspector/Inspector'
import { LeftPanel } from '../ui/LeftPanel/LeftPanel'
import { PreviewStage } from '../ui/Preview/PreviewStage'
import { Timeline } from '../ui/Timeline/Timeline'
import { TitleBar } from '../ui/TitleBar'
import { useShortcuts } from './shortcuts'

/** Đồng bộ tiêu đề cửa sổ và trạng thái "chưa lưu" với main process. */
function useWindowState(): void {
  const { t } = useTranslation()
  const name = useProjectStore((s) => s.project.name)
  const dirty = useProjectStore(selectIsDirty)
  const view = useAppStore((s) => s.view)

  // Yêu thích (★): nạp 1 lần khi mở app
  useEffect(() => void loadFavorites(), [])

  useEffect(() => {
    document.title = view === 'home' ? 'Cutcap' : `${dirty ? '● ' : ''}${name || t('project.untitled')} – Cutcap`
    window.cutcap.setDirty(dirty)
  }, [name, dirty, view, t])

  // Người dùng bấm nút X khi còn thay đổi chưa lưu
  useEffect(() => window.cutcap.onCloseRequested(() => void handleCloseRequest()), [])
}

export function App(): React.JSX.Element {
  const view = useAppStore((s) => s.view)

  useShortcuts()
  useWindowState()

  // Đồng bộ thumbnail/proxy cho media trong dự án
  useEffect(() => startMediaSync(), [])
  useEffect(() => startExportSync(), [])
  useEffect(() => startAutosave(), [])
  // Bấm đúp file .cutcap trong Explorer (app đang chạy hoặc vừa mở) → mở file đó
  useEffect(() => window.cutcap.onOpenRequested((path) => void openProjectPath(path)), [])

  // Undo/Redo có thể làm clip đang chọn biến mất → bỏ chọn clip không còn tồn tại
  useEffect(
    () =>
      projectStore.subscribe((s, prev) => {
        if (s.project.tracks !== prev.project.tracks) pruneSelection()
      }),
    []
  )

  // Bỏ chọn một clip chữ đã bị xóa hết nội dung → xóa luôn clip đó
  useEffect(
    () =>
      editorStore.subscribe((s, prev) => {
        if (s.selectedClipIds === prev.selectedClipIds) return
        const left = prev.selectedClipIds.filter((id) => !s.selectedClipIds.includes(id))
        if (left.length > 0) removeEmptyTexts(left)
      }),
    []
  )

  // Thả file ra ngoài vùng Thư viện media: mặc định Chromium sẽ MỞ file đó thay cho app → chặn lại
  useEffect(() => {
    const block = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  return (
    <div className="app">
      <TitleBar mode={view} />
      {view === 'home' ? <HomeScreen /> : <EditorWorkspace />}
      <ExportDialog />
      <CoverDialog />
    </div>
  )
}

const TIMELINE_HEIGHT_KEY = 'cutcap.timelineHeight'
const MIN_TIMELINE = 160
const MIN_TOP = 260

function loadTimelineHeight(): number {
  try {
    const v = Number(localStorage.getItem(TIMELINE_HEIGHT_KEY))
    return Number.isFinite(v) && v >= MIN_TIMELINE ? v : 360
  } catch {
    return 360
  }
}

/** Trình chỉnh sửa: 3 bảng phía trên, timeline phía dưới, thanh kéo để đổi chiều cao timeline. */
function EditorWorkspace(): React.JSX.Element {
  const [timelineHeight, setTimelineHeight] = useState(loadTimelineHeight)
  const rootRef = useRef<HTMLDivElement>(null)

  const startResize = (e: React.PointerEvent<HTMLDivElement>): void => {
    const root = rootRef.current
    if (!root) return
    e.preventDefault()
    const startY = e.clientY
    const startHeight = timelineHeight
    const max = root.clientHeight - MIN_TOP
    let latest = startHeight
    const move = (ev: PointerEvent): void => {
      latest = Math.round(Math.min(max, Math.max(MIN_TIMELINE, startHeight + startY - ev.clientY)))
      setTimelineHeight(latest)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try {
        localStorage.setItem(TIMELINE_HEIGHT_KEY, String(latest))
      } catch {
        // không nhớ được cũng không sao
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="workspace" ref={rootRef} style={{ gridTemplateRows: `minmax(${MIN_TOP}px, 1fr) 6px ${timelineHeight}px` }}>
      <LeftPanel />
      <PreviewStage />
      <Inspector />
      <div className="row-resizer" onPointerDown={startResize} role="separator" aria-orientation="horizontal" />
      <section className="panel timeline-panel">
        <Timeline />
      </section>
    </div>
  )
}
