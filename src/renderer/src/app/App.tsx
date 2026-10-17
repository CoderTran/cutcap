// Hai màn hình: Trang chủ (danh sách dự án) và trình chỉnh sửa.
// Bố cục trình chỉnh sửa giống CapCut PC:
//   ┌──────────┬───────────────┬───────────┐
//   │  Media   │    Preview    │ Inspector │
//   ├──────────┴───────────────┴───────────┤
//   │               Timeline               │
//   └──────────────────────────────────────┘
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppInfo } from '@shared/ipc'
import { useAppStore } from '../state/appStore'
import { startExportSync } from '../state/exportStore'
import { startAutosave } from '../state/autosave'
import { handleCloseRequest, openProjectPath } from '../state/fileActions'
import { startMediaSync } from '../state/mediaActions'
import { projectStore, selectIsDirty, useProjectStore } from '../state/projectStore'
import { pruneSelection } from '../state/timelineActions'
import { ExportDialog } from '../ui/Export/ExportDialog'
import { HomeScreen } from '../ui/Home/HomeScreen'
import { Inspector } from '../ui/Inspector/Inspector'
import { MediaBin } from '../ui/MediaBin/MediaBin'
import { Panel } from '../ui/Panel'
import { PreviewStage } from '../ui/Preview/PreviewStage'
import { Timeline } from '../ui/Timeline/Timeline'
import { Toolbar } from '../ui/Toolbar'
import { useShortcuts } from './shortcuts'

/** Đồng bộ tiêu đề cửa sổ và trạng thái "chưa lưu" với main process. */
function useWindowState(): void {
  const { t } = useTranslation()
  const name = useProjectStore((s) => s.project.name)
  const dirty = useProjectStore(selectIsDirty)
  const view = useAppStore((s) => s.view)

  useEffect(() => {
    document.title = view === 'home' ? 'Cutcap' : `${dirty ? '● ' : ''}${name || t('project.untitled')} – Cutcap`
    window.cutcap.setDirty(dirty)
  }, [name, dirty, view, t])

  // Người dùng bấm nút X khi còn thay đổi chưa lưu
  useEffect(() => window.cutcap.onCloseRequested(() => void handleCloseRequest()), [])
}

export function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const view = useAppStore((s) => s.view)

  useShortcuts()
  useWindowState()

  useEffect(() => {
    window.cutcap.getAppInfo().then(setInfo).catch(console.error)
  }, [])

  // Đồng bộ thumbnail/proxy cho media trong dự án
  useEffect(() => startMediaSync(), [])
  useEffect(() => startExportSync(), [])
  useEffect(() => startAutosave(), [])
  // Bấm đúp file .cutcap trong Explorer (app đang chạy hoặc vừa mở) → mở file đó
  useEffect(
    () =>
      window.cutcap.onOpenRequested((path) => void openProjectPath(path)),
    []
  )

  // Undo/Redo có thể làm clip đang chọn biến mất → bỏ chọn clip không còn tồn tại
  useEffect(
    () =>
      projectStore.subscribe((s, prev) => {
        if (s.project.tracks !== prev.project.tracks) pruneSelection()
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
      {view === 'home' ? (
        <HomeScreen />
      ) : (
        <>
          <Toolbar />
          <EditorWorkspace />
        </>
      )}

      <ExportDialog />

      <footer className="statusbar">
        {info
          ? `${info.name} · ${t('status.version', { version: info.version })} · Electron ${info.electron} · ${info.platform}`
          : t('status.loading')}
      </footer>
    </div>
  )
}

/** Trình chỉnh sửa: Thư viện media | Xem trước | Thuộc tính, và Timeline bên dưới. */
function EditorWorkspace(): React.JSX.Element {
  const { t } = useTranslation()
  return (
      <main className="workspace">
        <Panel className="area-media" title={t('panels.media')}>
          <MediaBin />
        </Panel>

        <Panel className="area-preview" title={t('panels.preview')}>
          <PreviewStage />
        </Panel>

        <Panel className="area-inspector" title={t('panels.inspector')}>
          <Inspector />
        </Panel>

        <Panel className="area-timeline" title={t('panels.timeline')}>
          <Timeline />
        </Panel>
      </main>
  )
}
