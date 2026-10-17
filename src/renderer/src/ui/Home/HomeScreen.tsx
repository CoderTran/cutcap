// Trang chủ: tạo dự án mới, làm tiếp dự án đang dở, khôi phục bản tự động lưu.
// Bố cục theo CapCut nhưng chỉ giữ phần hữu ích: không đăng nhập / gói Pro / công cụ AI / mẫu.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjectSummary, RecoverableProject } from '@shared/ipc'
import { formatDuration } from '@shared/project/time'
import { newProject, openProject, openProjectPath, recoverProject } from '../../state/fileActions'
import { formatBytes, formatWhen } from '../format'
import { ProjectCard } from './ProjectCard'

type Layout = 'grid' | 'list'
const LAYOUT_KEY = 'cutcap.home.layout'

/** Kiểu xem lưới/danh sách – nhớ trên máy (chỉ là tiện ích, không quan trọng nếu mất). */
function loadLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export function HomeScreen(): React.JSX.Element {
  const { t } = useTranslation()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [recoverable, setRecoverable] = useState<RecoverableProject[]>([])
  const [query, setQuery] = useState('')
  const [layout, setLayout] = useState<Layout>(loadLayout)

  const refresh = useCallback(async () => {
    const [list, recover] = await Promise.all([window.cutcap.libraryList(), window.cutcap.autosaveList()])
    setProjects(list)
    setRecoverable(recover)
  }, [])

  // Tải khi mở Trang chủ, và mỗi khi quay lại cửa sổ (có thể vừa chép/xóa file dự án bên ngoài)
  useEffect(() => {
    void refresh()
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const changeLayout = (next: Layout): void => {
    setLayout(next)
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // không lưu được cũng không sao
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi')
    return (projects ?? []).filter((p) => !q || p.name.toLocaleLowerCase('vi').includes(q))
  }, [projects, query])

  const discardRecovery = async (): Promise<void> => {
    await Promise.all(recoverable.map((r) => window.cutcap.autosaveClear(r.projectId)))
    setRecoverable([])
  }

  const when = (iso: string): string => formatWhen(iso, { today: t('home.today'), yesterday: t('home.yesterday') })

  return (
    <div className="home">
      <header className="home-header">
        <span className="brand">Cutcap</span>
        <button onClick={() => void openProject()} title={`${t('home.openOther')} (Ctrl+O)`}>
          📂 {t('home.openOther')}
        </button>
      </header>

      <main className="home-body">
        <button className="home-create" onClick={() => void newProject()} title="Ctrl+N">
          <span className="home-create-icon">+</span>
          <span>{t('home.create')}</span>
        </button>

        {recoverable.length > 0 && (
          <section className="recover-box">
            <strong>⚠ {t('home.recoverTitle')}</strong>
            <span className="hint">{t('home.recoverText')}</span>
            {recoverable.map((r) => (
              <div key={r.projectId} className="recover-item">
                <div>
                  <b>{r.name || t('project.untitled')}</b>
                  <small>{t('home.autosavedAt', { time: when(r.savedAt) })}</small>
                </div>
                <button className="primary" onClick={() => void recoverProject(r.projectId)}>
                  {t('home.recover')}
                </button>
              </div>
            ))}
            <div className="row">
              <span />
              <button onClick={() => void discardRecovery()}>{t('home.discardRecovery')}</button>
            </div>
          </section>
        )}

        <section className="home-projects">
          <div className="home-projects-head">
            <h2>
              {t('home.projects')} {projects && <span className="hint">({projects.length})</span>}
            </h2>
            <div className="home-tools">
              <input
                className="home-search"
                type="search"
                placeholder={`🔍 ${t('home.search')}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="segmented small">
                <button className={layout === 'grid' ? 'active' : ''} onClick={() => changeLayout('grid')} title={t('home.grid')}>
                  ▦
                </button>
                <button className={layout === 'list' ? 'active' : ''} onClick={() => changeLayout('list')} title={t('home.list')}>
                  ☰
                </button>
              </div>
            </div>
          </div>

          {projects === null && <p className="hint">{t('home.loading')}</p>}
          {projects?.length === 0 && <p className="hint home-empty">{t('home.empty')}</p>}
          {projects && projects.length > 0 && visible.length === 0 && <p className="hint">{t('home.noMatch')}</p>}

          <div className={layout === 'grid' ? 'project-grid' : 'project-list'}>
            {visible.map((p) => (
              <ProjectCard
                key={p.path}
                project={p}
                layout={layout}
                meta={`${formatBytes(p.mediaBytes)} | ${formatDuration(p.durationUs)}`}
                when={when(p.updatedAt)}
                onOpen={() => void openProjectPath(p.path)}
                onChanged={() => void refresh()}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
