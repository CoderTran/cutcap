// Nút keyframe của một dòng thuộc tính (giống CapCut):  ‹  ◇  ›
//   ◇ rỗng  = chưa có keyframe tại đầu phát → bấm để thêm (giữ giá trị hiện tại)
//   ◆ xanh  = đang đứng đúng keyframe → bấm để xóa
//   ‹ ›     = nhảy đầu phát tới keyframe trước / sau
import { useTranslation } from 'react-i18next'
import type { Clip, KeyframeProp } from '@shared/project/schema'
import { hasKeyframes, isKeyframeAt, neighborKeyframe } from '@shared/timeline/keyframes'
import { useEditorStore } from '../../state/editorStore'
import { playheadInside, seekKeyframe, toggleKeyframeAt } from '../../state/keyframeActions'

interface Props {
  clip: Clip
  props: readonly KeyframeProp[]
  disabled?: boolean
}

export function KeyframeButton({ clip, props, disabled }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const now = useEditorStore((s) => s.currentTime)
  const inside = playheadInside(clip, now)
  const active = inside && isKeyframeAt(clip, props, now)
  const animated = hasKeyframes(clip, props)
  const prev = neighborKeyframe(clip, props, now, -1)
  const next = neighborKeyframe(clip, props, now, 1)

  // Nút nằm trong <label> của thanh trượt → chặn để bấm nút không "bấm" luôn thanh trượt
  const stop = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <span className={`kf-controls ${animated ? 'animated' : ''}`} onDoubleClick={stop}>
      <button
        className="kf-nav"
        disabled={prev === null}
        title={t('keyframe.prev')}
        onClick={(e) => {
          stop(e)
          seekKeyframe(clip.id, props, -1)
        }}
      >
        ‹
      </button>
      <button
        className={`kf-toggle ${active ? 'active' : ''}`}
        disabled={disabled || !inside}
        title={!inside ? t('keyframe.outside') : active ? t('keyframe.remove') : t('keyframe.add')}
        onClick={(e) => {
          stop(e)
          toggleKeyframeAt(clip.id, props)
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M6 1 11 6 6 11 1 6Z" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      <button
        className="kf-nav"
        disabled={next === null}
        title={t('keyframe.next')}
        onClick={(e) => {
          stop(e)
          seekKeyframe(clip.id, props, 1)
        }}
      >
        ›
      </button>
    </span>
  )
}
