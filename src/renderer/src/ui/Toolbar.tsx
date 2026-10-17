// Thanh công cụ trên cùng: tệp (Mới / Mở / Lưu), Undo/Redo, tên dự án, nút Xuất.
import { useTranslation } from 'react-i18next'
import { openExportDialog, useExportStore } from '../state/exportStore'
import { newProject, openProject, saveProject } from '../state/fileActions'
import { redo, undo } from '../state/projectActions'
import {
  selectCanRedo,
  selectCanUndo,
  selectIsDirty,
  selectRedoLabel,
  selectUndoLabel,
  useProjectStore
} from '../state/projectStore'

export function Toolbar(): React.JSX.Element {
  const { t } = useTranslation()
  const name = useProjectStore((s) => s.project.name)
  const dirty = useProjectStore(selectIsDirty)
  const canUndo = useProjectStore(selectCanUndo)
  const canRedo = useProjectStore(selectCanRedo)
  const undoLabel = useProjectStore(selectUndoLabel)
  const redoLabel = useProjectStore(selectRedoLabel)
  const exporting = useExportStore((s) => s.phase === 'running')
  const exportPercent = useExportStore((s) => Math.round((s.progress?.progress ?? 0) * 100))

  return (
    <header className="toolbar">
      <span className="brand">Cutcap</span>

      <div className="toolbar-group">
        <button onClick={() => void newProject()} title={`${t('toolbar.newProject')} (Ctrl+N)`}>
          {t('toolbar.newProject')}
        </button>
        <button onClick={() => void openProject()} title={`${t('toolbar.open')} (Ctrl+O)`}>
          {t('toolbar.open')}
        </button>
        <button onClick={() => void saveProject(false)} title={`${t('toolbar.save')} (Ctrl+S)`}>
          {t('toolbar.save')}
        </button>
        <button onClick={() => void saveProject(true)} title={`${t('toolbar.saveAs')} (Ctrl+Shift+S)`}>
          {t('toolbar.saveAs')}
        </button>
      </div>

      <div className="toolbar-group">
        <button
          onClick={undo}
          disabled={!canUndo}
          title={undoLabel ? `${t('toolbar.undo')}: ${t(undoLabel)} (Ctrl+Z)` : t('toolbar.undo')}
        >
          ↶ {t('toolbar.undo')}
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title={redoLabel ? `${t('toolbar.redo')}: ${t(redoLabel)} (Ctrl+Y)` : t('toolbar.redo')}
        >
          ↷ {t('toolbar.redo')}
        </button>
      </div>

      <div className="project-title" title={dirty ? t('project.unsaved') : undefined}>
        {name || t('project.untitled')}
        {dirty && <span className="dirty-dot">●</span>}
      </div>

      {exporting ? (
        // Đang xuất chạy nền: hiện tiến trình, bấm để mở lại hộp thoại
        <button className="export-pill" onClick={openExportDialog} title={t('toolbar.exportRunning')}>
          <span className="export-pill-bar" style={{ width: `${exportPercent}%` }} />
          <span>⏳ {exportPercent}%</span>
        </button>
      ) : (
        <button className="primary" onClick={openExportDialog} title={`${t('toolbar.export')} (Ctrl+E)`}>
          {t('toolbar.export')}
        </button>
      )}
    </header>
  )
}
