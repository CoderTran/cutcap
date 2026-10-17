// Thanh công cụ trên timeline: thời gian hiện tại / tổng, thu phóng.
import { useTranslation } from 'react-i18next'
import { formatTimecode } from '@shared/project/time'
import { MAX_PX_PER_SECOND, MIN_PX_PER_SECOND } from '@shared/timeline/ruler'
import { useEditorStore } from '../../state/editorStore'
import { addTextAtPlayhead } from '../../state/textActions'
import { deleteSelected, splitAtPlayhead } from '../../state/timelineActions'
import { useProjectStore } from '../../state/projectStore'

// Thanh trượt zoom dùng thang logarit: mỗi nấc tăng/giảm theo tỉ lệ, cảm giác đều tay hơn
const LOG_MIN = Math.log(MIN_PX_PER_SECOND)
const LOG_MAX = Math.log(MAX_PX_PER_SECOND)
const toSlider = (pps: number): number => ((Math.log(pps) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100
const fromSlider = (v: number): number => Math.exp(LOG_MIN + (v / 100) * (LOG_MAX - LOG_MIN))

interface Props {
  durationUs: number
  /** Đổi zoom, giữ nguyên vị trí đầu phát trên màn hình. */
  onZoom(pxPerSecond: number): void
  onFit(): void
}

export function TimelineToolbar({ durationUs, onZoom, onFit }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const pps = useEditorStore((s) => s.pxPerSecond)
  const currentTime = useEditorStore((s) => s.currentTime)
  const fps = useProjectStore((s) => s.project.settings.fps)
  const hasSelection = useEditorStore((s) => s.selectedClipIds.length > 0)

  return (
    <div className="tl-toolbar">
      <div className="tl-tools">
        <button onClick={splitAtPlayhead} disabled={durationUs === 0} title={t('timeline.splitHint')}>
          ✂ {t('timeline.split')}
        </button>
        <button onClick={deleteSelected} disabled={!hasSelection} title={t('timeline.deleteHint')}>
          🗑 {t('timeline.delete')}
        </button>
        <button onClick={() => addTextAtPlayhead(t('text.default'))} title={t('timeline.addTextHint')}>
          T+ {t('timeline.addText')}
        </button>
      </div>
      <span className="tl-time">
        <b>{formatTimecode(currentTime, fps)}</b> / {formatTimecode(durationUs, fps)}
      </span>
      <div className="tl-zoom">
        <button className="icon" onClick={() => onZoom(pps / 1.5)} title={t('timeline.zoomOut')}>
          −
        </button>
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={toSlider(pps)}
          onChange={(e) => onZoom(fromSlider(Number(e.target.value)))}
          aria-label={t('timeline.zoom')}
        />
        <button className="icon" onClick={() => onZoom(pps * 1.5)} title={t('timeline.zoomIn')}>
          +
        </button>
        <button onClick={onFit} disabled={durationUs === 0} title={t('timeline.fitHint')}>
          {t('timeline.fit')}
        </button>
      </div>
    </div>
  )
}
