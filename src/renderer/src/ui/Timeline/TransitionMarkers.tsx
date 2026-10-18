// Dấu nối giữa 2 clip liền nhau trên một track hình:
//  - chưa có chuyển cảnh: nút nhỏ "⋈" ở mối cắt (rê chuột mới hiện rõ)
//  - đã có: dải bao vùng chuyển cảnh kèm biểu tượng
// Bấm vào → chọn clip phía sau, panel Thuộc tính hiện mục Chuyển cảnh.
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project, Track, TransitionKind } from '@shared/project/schema'
import { timeToPx } from '@shared/timeline/ruler'
import { canHaveTransition, transitionAt } from '@shared/timeline/transitions'
import { editorStore } from '../../state/editorStore'

export const TRANSITION_ICON: Record<TransitionKind, string> = {
  fade: '◐',
  'slide-left': '⇠',
  'slide-right': '⇢',
  zoom: '⊕',
  rippleChroma: '◎',
  waveWipe: '≋',
  flashGlow: '✦',
  mosaic: '▦',
  swirl: '🌀',
  tearUp: '⇡'
}

interface Props {
  project: Project
  track: Track
  pxPerSecond: number
}

export const TransitionMarkers = memo(function TransitionMarkers({ project, track, pxPerSecond }: Props) {
  const { t } = useTranslation()
  if (track.kind === 'audio') return null

  return (
    <>
      {track.clips.map((clip, i) => {
        if (!canHaveTransition(project, track, i)) return null
        const active = transitionAt(project, track, i)
        const select = (e: React.PointerEvent): void => {
          e.stopPropagation() // không để track bắt sự kiện (sẽ bỏ chọn / dời đầu phát)
          if (e.button === 0) editorStore.getState().selectWithTab(clip.id, 'transition')
        }
        if (!active) {
          return (
            <button
              key={clip.id}
              className="tl-transition add"
              style={{ left: timeToPx(clip.start, pxPerSecond) }}
              onPointerDown={select}
              title={t('transition.add')}
            >
              ⋈
            </button>
          )
        }
        const left = timeToPx(active.from, pxPerSecond)
        const width = Math.max(14, timeToPx(active.duration, pxPerSecond))
        return (
          <button
            key={clip.id}
            className="tl-transition active"
            style={{ left, width, marginLeft: width === 14 ? timeToPx(active.duration, pxPerSecond) / 2 - 7 : 0 }}
            onPointerDown={select}
            title={`${t(`transition.kinds.${active.kind}`)} · ${(active.duration / 1e6).toFixed(1)}s`}
          >
            {TRANSITION_ICON[active.kind]}
          </button>
        )
      })}
    </>
  )
})
