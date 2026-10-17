// Tab Chuyển tiếp: ô xem trước động cho từng kiểu. Bấm → gắn vào mối cắt gần đầu phát nhất
// (ưu tiên track của clip đang chọn). Chỉnh thời lượng ở bảng phải.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TRANSITION_KINDS, type TransitionKind } from '@shared/project/schema'
import { findClip } from '@shared/timeline/clips'
import { DEFAULT_TRANSITION, findCutNear } from '@shared/timeline/transitions'
import { setTransition } from '../../state/clipActions'
import { editorStore } from '../../state/editorStore'
import { projectStore } from '../../state/projectStore'
import { HelpTip } from '../HelpTip'
import { Icon } from '../icons'

export function TransitionsTab(): React.JSX.Element {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)

  const apply = (kind: TransitionKind): void => {
    const project = projectStore.getState().project
    const { currentTime, selectedClipIds } = editorStore.getState()
    const preferTrack = selectedClipIds[0] ? findClip(project, selectedClipIds[0])?.track.id : null
    const clipId = findCutNear(project, currentTime, preferTrack)
    if (!clipId) {
      setNotice(t('transitionsTab.noCut'))
      return
    }
    setTransition(clipId, kind, DEFAULT_TRANSITION)
    // Chọn clip phía sau mối cắt và mở tab Chuyển cảnh ở bảng phải để chỉnh thời lượng
    editorStore.getState().selectWithTab(clipId, 'transition')
    setNotice(null)
  }

  return (
    <div className="left-scroll">
      <h4 className="left-heading with-help">
        {t('transitionsTab.heading')}
        <HelpTip text={t('transitionsTab.hint')} />
      </h4>
      <div className="preset-grid">
        {TRANSITION_KINDS.map((kind) => (
          <button key={kind} className="preset-tile" onClick={() => apply(kind)} title={t('transitionsTab.hint')}>
            <span className={`transition-demo ${kind}`}>
              <span className="demo-a" />
              <span className="demo-b" />
            </span>
            <span className="preset-name">{t(`transition.kinds.${kind}`)}</span>
            <span className="tile-add">
              <Icon name="plus" size={14} />
            </span>
          </button>
        ))}
      </div>
      {notice && <p className="hint">{notice}</p>}
    </div>
  )
}
