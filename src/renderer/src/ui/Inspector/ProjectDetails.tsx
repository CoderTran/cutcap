// Tab "Chi tiết" của dự án: nơi lưu file, kích thước video, thời lượng, số media/clip.
import { useTranslation } from 'react-i18next'
import { canvasSize } from '@shared/project/canvas'
import { formatDuration } from '@shared/project/time'
import { projectDuration } from '@shared/timeline/clips'
import { useProjectStore } from '../../state/projectStore'

export function ProjectDetails(): React.JSX.Element {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const filePath = useProjectStore((s) => s.filePath)
  const size = canvasSize(project.settings.aspectRatio, project.settings.resolution)
  const clipCount = project.tracks.reduce((n, tr) => n + tr.clips.length, 0)
  const when = (iso: string): string => new Date(iso).toLocaleString('vi-VN')

  const rows: [string, string][] = [
    [t('details.size'), `${size.width} × ${size.height} · ${project.settings.fps} fps`],
    [t('details.duration'), formatDuration(projectDuration(project))],
    [t('details.media'), String(Object.keys(project.assets).length)],
    [t('details.clips'), String(clipCount)],
    [t('details.tracks'), String(project.tracks.length)],
    [t('details.created'), when(project.createdAt)],
    [t('details.updated'), when(project.updatedAt)]
  ]
  return (
    <div className="form">
      <dl className="info-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="field">
        <span>{t('details.location')}</span>
        <code className="path-box" title={filePath ?? ''}>
          {filePath ?? t('project.notSavedYet')}
        </code>
      </div>
    </div>
  )
}
