// Thanh tiêu đề tự vẽ (cửa sổ không dùng khung của Windows – xem titleBarOverlay trong main/index.ts).
//   trái:  logo · Menu · "Tự động lưu: 08:33:34"
//   giữa:  tên dự án (bấm để đổi tên)
//   phải:  nút Xuất  (3 nút thu nhỏ / phóng to / đóng của Windows nằm ngay bên phải)
// Cả thanh kéo được để di chuyển cửa sổ (-webkit-app-region: drag); nút bấm thì không.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppInfo } from '@shared/ipc'
import { openExportDialog, useExportStore } from '../state/exportStore'
import { goHome, newProject, openProject, saveProject } from '../state/fileActions'
import { renameProject } from '../state/projectActions'
import { selectIsDirty, useProjectStore } from '../state/projectStore'
import { Icon } from './icons'

interface MenuItem {
  label: string
  shortcut?: string
  run?: () => void
  disabled?: boolean
}

function AppMenu({ items }: { items: (MenuItem | 'divider')[] }): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div className="titlebar-menu" ref={ref}>
      <button className={`titlebar-button ${open ? 'active' : ''}`} onClick={() => setOpen((o) => !o)}>
        {t('titlebar.menu')} <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="menu-popup left">
          {items.map((item, i) =>
            item === 'divider' ? (
              <hr key={i} />
            ) : (
              <button
                key={item.label}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.run?.()
                }}
              >
                <span>{item.label}</span>
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

/** Tên dự án ở giữa thanh – bấm để đổi tên. */
function ProjectName(): React.JSX.Element {
  const { t } = useTranslation()
  const name = useProjectStore((s) => s.project.name)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  useEffect(() => setDraft(name), [name])

  if (editing) {
    return (
      <input
        className="titlebar-name-input"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          if (draft.trim() && draft.trim() !== name) renameProject(draft)
          else setDraft(name)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(name)
            setEditing(false)
          }
        }}
      />
    )
  }
  return (
    <button className="titlebar-name" onClick={() => setEditing(true)} title={t('titlebar.rename')}>
      {name || t('project.untitled')}
    </button>
  )
}

/** "Tự động lưu: 08:33:34" / "Đang có thay đổi…" / "Chưa lưu". */
function SaveStatus(): React.JSX.Element {
  const { t } = useTranslation()
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt)
  const dirty = useProjectStore(selectIsDirty)
  const hasFile = useProjectStore((s) => s.filePath !== null)
  const time = lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString('vi-VN') : null

  if (!hasFile) return <span className="save-status warn">{t('titlebar.notSaved')}</span>
  return (
    <span className="save-status" title={dirty ? t('titlebar.pending') : undefined}>
      <span className={`save-dot ${dirty ? 'pending' : ''}`}>
        <Icon name="check" size={11} />
      </span>
      {time ? t('titlebar.autosaved', { time }) : t('titlebar.pending')}
    </span>
  )
}

export function TitleBar({ mode }: { mode: 'home' | 'editor' }): React.JSX.Element {
  const { t } = useTranslation()
  const exporting = useExportStore((s) => s.phase === 'running')
  const exportPercent = useExportStore((s) => Math.round((s.progress?.progress ?? 0) * 100))
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    window.cutcap.getAppInfo().then(setInfo).catch(() => {})
  }, [])

  const about: MenuItem = { label: info ? `Cutcap ${info.version} · Electron ${info.electron}` : 'Cutcap', disabled: true }
  const items: (MenuItem | 'divider')[] =
    mode === 'home'
      ? [
          { label: t('titlebar.newProject'), shortcut: 'Ctrl+N', run: () => void newProject() },
          { label: t('titlebar.open'), shortcut: 'Ctrl+O', run: () => void openProject() },
          'divider',
          about
        ]
      : [
          { label: t('titlebar.home'), run: () => void goHome() },
          { label: t('titlebar.newProject'), shortcut: 'Ctrl+N', run: () => void newProject() },
          { label: t('titlebar.open'), shortcut: 'Ctrl+O', run: () => void openProject() },
          'divider',
          { label: t('titlebar.save'), shortcut: 'Ctrl+S', run: () => void saveProject(false) },
          { label: t('titlebar.saveAs'), shortcut: 'Ctrl+Shift+S', run: () => void saveProject(true) },
          'divider',
          { label: t('titlebar.export'), shortcut: 'Ctrl+E', run: openExportDialog },
          'divider',
          about
        ]

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <button className="titlebar-brand" onClick={() => mode === 'editor' && void goHome()} title={mode === 'editor' ? t('titlebar.home') : undefined}>
          <img src="./logo.png" alt="" draggable={false} />
          <span>Cutcap</span>
        </button>
        <AppMenu items={items} />
        {mode === 'editor' && <SaveStatus />}
      </div>

      <div className="titlebar-center">{mode === 'editor' && <ProjectName />}</div>

      <div className="titlebar-right">
        {mode === 'editor' &&
          (exporting ? (
            <button className="export-pill" onClick={openExportDialog} title={t('toolbar.exportRunning')}>
              <span className="export-pill-bar" style={{ width: `${exportPercent}%` }} />
              <span>
                <Icon name="export" size={15} /> {exportPercent}%
              </span>
            </button>
          ) : (
            <button className="primary titlebar-export" onClick={openExportDialog} title="Ctrl+E">
              <Icon name="export" size={15} /> {t('titlebar.export')}
            </button>
          ))}
      </div>
    </header>
  )
}
