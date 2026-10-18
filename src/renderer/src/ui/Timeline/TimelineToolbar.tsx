// Thanh công cụ timeline kiểu CapCut:
//   trái:  Hoàn tác · Làm lại | Tách (Ctrl+B) · Xóa trái (Q) · Xóa phải (W) · Xóa (Delete)
//   phải:  Hút vào đoạn chính (N) · Nam châm (hít) | Thu nhỏ · thanh zoom · Phóng to · Vừa khung
import { useTranslation } from 'react-i18next'
import { MAX_PX_PER_SECOND, MIN_PX_PER_SECOND } from '@shared/timeline/ruler'
import { editorStore, useEditorStore } from '../../state/editorStore'
import { redo, undo } from '../../state/projectActions'
import { selectCanRedo, selectCanUndo, selectRedoLabel, selectUndoLabel, useProjectStore } from '../../state/projectStore'
import { deleteSelected, splitAtPlayhead, toggleMagnet, trimAtPlayhead } from '../../state/timelineActions'
import { Icon, type IconName } from '../icons'

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

function ToolButton({ icon, title, onClick, disabled, active }: { icon: IconName; title: string; onClick: () => void; disabled?: boolean; active?: boolean }): React.JSX.Element {
  return (
    <button className={`tool-button ${active ? 'active' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      <Icon name={icon} size={18} />
    </button>
  )
}

export function TimelineToolbar({ durationUs, onZoom, onFit }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const pps = useEditorStore((s) => s.pxPerSecond)
  const snapping = useEditorStore((s) => s.snapping)
  const magnet = useEditorStore((s) => s.magnet)
  const hasSelection = useEditorStore((s) => s.selectedClipIds.length > 0)
  const canUndo = useProjectStore(selectCanUndo)
  const canRedo = useProjectStore(selectCanRedo)
  const undoLabel = useProjectStore(selectUndoLabel)
  const redoLabel = useProjectStore(selectRedoLabel)
  const empty = durationUs === 0

  return (
    <div className="tl-toolbar">
      <div className="tl-tools">
        <ToolButton icon="undo" onClick={undo} disabled={!canUndo} title={undoLabel ? `${t('toolbar.undo')}: ${t(undoLabel)} (Ctrl+Z)` : t('toolbar.undo')} />
        <ToolButton icon="redo" onClick={redo} disabled={!canRedo} title={redoLabel ? `${t('toolbar.redo')}: ${t(redoLabel)} (Ctrl+Y)` : t('toolbar.redo')} />
        <span className="tool-sep" />
        <ToolButton icon="split" onClick={splitAtPlayhead} disabled={empty} title={t('timeline.splitHint')} />
        <ToolButton icon="splitLeft" onClick={() => trimAtPlayhead('left')} disabled={empty} title={t('timeline.trimLeftHint')} />
        <ToolButton icon="splitRight" onClick={() => trimAtPlayhead('right')} disabled={empty} title={t('timeline.trimRightHint')} />
        <ToolButton icon="trash" onClick={deleteSelected} disabled={!hasSelection} title={t('timeline.deleteHint')} />
      </div>
      <div className="tl-zoom">
        <ToolButton
          icon="autoAttach"
          onClick={toggleMagnet}
          active={magnet}
          title={t(magnet ? 'timeline.magnetOff' : 'timeline.magnetOn')}
        />
        <ToolButton icon="magnet" onClick={() => editorStore.getState().toggleSnapping()} active={snapping} title={t('timeline.snapHint')} />
        <span className="tool-sep" />
        <ToolButton icon="zoomOut" onClick={() => onZoom(pps / 1.5)} title={t('timeline.zoomOut')} />
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={toSlider(pps)}
          onChange={(e) => onZoom(fromSlider(Number(e.target.value)))}
          onPointerUp={(e) => e.currentTarget.blur()}
          aria-label={t('timeline.zoom')}
        />
        <ToolButton icon="zoomIn" onClick={() => onZoom(pps * 1.5)} title={t('timeline.zoomIn')} />
        <ToolButton icon="fit" onClick={onFit} disabled={empty} title={t('timeline.fitHint')} />
      </div>
    </div>
  )
}
