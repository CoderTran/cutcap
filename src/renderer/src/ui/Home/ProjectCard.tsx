// Một dự án trên Trang chủ: ảnh thu nhỏ, tên, dung lượng | thời lượng, lần sửa cuối, menu ⋯.
// Bấm vào thẻ để mở. Menu: Mở, Đổi tên, Nhân bản, Hiện trong thư mục, Chuyển vào Thùng rác.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjectSummary } from '@shared/ipc'

interface Props {
  project: ProjectSummary
  layout: 'grid' | 'list'
  /** "6,4 GB | 11:32" */
  meta: string
  /** "Hôm nay 08:30" */
  when: string
  onOpen(): void
  /** Đã đổi tên / nhân bản / xóa → tải lại danh sách */
  onChanged(): void
}

export function ProjectCard({ project, layout, meta, when, onOpen, onChanged }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(project.name)
  const menuRef = useRef<HTMLDivElement>(null)

  // Bấm ra ngoài menu → đóng menu
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: PointerEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menuOpen])

  const act = (fn: () => void | Promise<unknown>) => async (): Promise<void> => {
    setMenuOpen(false)
    await fn()
  }

  const commitRename = async (): Promise<void> => {
    setRenaming(false)
    const name = draft.trim()
    if (name && name !== project.name) {
      await window.cutcap.libraryRename(project.path, name)
      onChanged()
    } else {
      setDraft(project.name)
    }
  }

  const trash = async (): Promise<void> => {
    // Thùng rác của Windows – người dùng vẫn khôi phục được từ Recycle Bin
    if (!window.confirm(t('home.trashConfirm', { name: project.name }))) return
    await window.cutcap.libraryTrash(project.path)
    onChanged()
  }

  return (
    <div
      className={`project-card ${layout}`}
      onClick={() => !renaming && !menuOpen && onOpen()}
      title={project.path}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !renaming && onOpen()}
    >
      <div className="project-thumb">
        {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" draggable={false} /> : <span className="project-thumb-icon">🎬</span>}
        {project.missingMedia > 0 && (
          <span className="badge warn" title={t('home.missingMedia', { count: project.missingMedia })}>
            ⚠ {project.missingMedia}
          </span>
        )}
      </div>

      <div className="project-info">
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setDraft(project.name)
                setRenaming(false)
              }
            }}
          />
        ) : (
          <b className="project-name">{project.name}</b>
        )}
        <small>{meta}</small>
        <small>{when}</small>
        {layout === 'list' && <small className="project-path">{project.path}</small>}
      </div>

      <div className="project-menu" ref={menuRef} onClick={(e) => e.stopPropagation()}>
        <button className="icon project-menu-button" onClick={() => setMenuOpen((o) => !o)} title={t('home.more')}>
          ⋯
        </button>
        {menuOpen && (
          <div className="menu-popup">
            <button onClick={act(onOpen)}>{t('home.open')}</button>
            <button onClick={act(() => setRenaming(true))}>{t('home.rename')}</button>
            <button
              onClick={act(async () => {
                await window.cutcap.libraryDuplicate(project.path, t('home.copySuffix'))
                onChanged()
              })}
            >
              {t('home.duplicate')}
            </button>
            <button onClick={act(() => window.cutcap.libraryReveal(project.path))}>{t('home.reveal')}</button>
            <button className="danger" onClick={act(trash)}>
              {t('home.trash')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
