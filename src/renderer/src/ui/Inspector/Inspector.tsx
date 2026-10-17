// Panel "Thuộc tính": chọn 1 clip → thuộc tính clip (chữ hoặc media); không chọn gì → cài đặt dự án.
import { useTranslation } from 'react-i18next'
import { findClip } from '@shared/timeline/clips'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import { ClipInfoPanel } from './ClipInfoPanel'
import { ProjectSettingsPanel } from './ProjectSettingsPanel'
import { TextPanel } from './TextPanel'

export function Inspector(): React.JSX.Element {
  const { t } = useTranslation()
  const selected = useEditorStore((s) => s.selectedClipIds)
  const project = useProjectStore((s) => s.project)

  if (selected.length > 1) return <p className="hint">{t('inspector.multiSelected', { count: selected.length })}</p>
  const found = selected.length === 1 ? findClip(project, selected[0]) : null
  if (found?.clip.type === 'text') return <TextPanel key={found.clip.id} clip={found.clip} track={found.track} />
  if (found) return <ClipInfoPanel key={found.clip.id} clip={found.clip} track={found.track} />
  return <ProjectSettingsPanel />
}
