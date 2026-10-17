// Màn hình bắt đầu khi mở app:
//  - nếu lần trước app bị tắt ngang khi còn thay đổi chưa lưu → hỏi khôi phục bản tự động lưu
//  - danh sách dự án gần đây (bấm để mở), nút Dự án mới / Mở dự án
// Không có gì để hiện (lần đầu dùng app) → tự đóng.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecentProject, RecoverableProject } from '@shared/ipc'
import { newProject, openProject, openProjectPath, recoverProject } from '../../state/fileActions'

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })

export function StartDialog({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const { t } = useTranslation()
  const [recent, setRecent] = useState<RecentProject[] | null>(null)
  const [recoverable, setRecoverable] = useState<RecoverableProject[]>([])

  useEffect(() => {
    let alive = true
    Promise.all([window.cutcap.recentList(), window.cutcap.autosaveList()])
      .then(([r, a]) => {
        if (!alive) return
        if (r.length === 0 && a.length === 0) return onClose() // lần đầu dùng app: vào thẳng trình chỉnh sửa
        setRecent(r)
        setRecoverable(a)
      })
      .catch(() => onClose())
    return () => {
      alive = false
    }
  }, [onClose])

  if (recent === null) return null

  const run = (action: () => Promise<unknown>) => async (): Promise<void> => {
    onClose()
    await action()
  }
  const discardRecovery = async (): Promise<void> => {
    await Promise.all(recoverable.map((r) => window.cutcap.autosaveClear(r.projectId)))
    setRecoverable([])
  }

  return (
    <div className="modal-backdrop">
      <div className="modal start-modal" role="dialog" aria-modal="true">
        <h2 className="modal-title">{t('start.title')}</h2>

        {recoverable.length > 0 && (
          <div className="recover-box">
            <strong>⚠ {t('start.recoverTitle')}</strong>
            <span className="hint">{t('start.recoverText')}</span>
            {recoverable.map((r) => (
              <div key={r.projectId} className="start-item">
                <div>
                  <b>{r.name || t('project.untitled')}</b>
                  <small>
                    {t('start.savedAt', { time: formatTime(r.savedAt) })} · {r.filePath ?? t('start.neverSaved')}
                  </small>
                </div>
                <button className="primary" onClick={run(() => recoverProject(r.projectId))}>
                  {t('start.recover')}
                </button>
              </div>
            ))}
            <div className="row">
              <span />
              <button onClick={() => void discardRecovery()}>{t('start.discard')}</button>
            </div>
          </div>
        )}

        <div className="start-layout">
          <div className="start-actions">
            <button className="primary" onClick={run(newProject)}>
              + {t('start.new')}
            </button>
            <button onClick={run(openProject)}>📂 {t('start.open')}</button>
          </div>
          <div>
            <h4 className="hint">{t('start.recent')}</h4>
            <div className="start-list">
              {recent.length === 0 && <p className="hint">{t('start.noRecent')}</p>}
              {recent.map((r) => (
                <div key={r.path} className="start-item" onClick={run(() => openProjectPath(r.path))} title={r.path}>
                  <div>
                    <b>{r.name}</b>
                    <small>{r.path}</small>
                    <small>{formatTime(r.openedAt)}</small>
                  </div>
                  <button
                    className="icon"
                    title={t('start.remove')}
                    onClick={(e) => {
                      e.stopPropagation()
                      void window.cutcap.recentRemove(r.path)
                      setRecent((list) => list?.filter((x) => x.path !== r.path) ?? null)
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>{t('start.close')}</button>
        </div>
      </div>
    </div>
  )
}
