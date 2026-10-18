// Mục "Chuyển cảnh" của clip: chuyển cảnh từ clip ngay trước vào clip này.
import { HelpTip } from '../HelpTip'
import { useTranslation } from 'react-i18next'
import { TRANSITION_KINDS, type MediaClip, type Track } from '@shared/project/schema'
import { MICROS_PER_SECOND } from '@shared/project/time'
import { defaultTransitionFor, MIN_TRANSITION, maxTransitionDuration, transitionAt } from '@shared/timeline/transitions'
import { setTransition } from '../../state/clipActions'
import { useProjectStore } from '../../state/projectStore'
import { TRANSITION_ICON } from '../Timeline/TransitionMarkers'
import { SliderField } from './SliderField'

export function TransitionSection({ clip, track }: { clip: MediaClip; track: Track }): React.JSX.Element {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const index = track.clips.indexOf(clip)
  const prev = track.clips[index - 1]
  const active = transitionAt(project, track, index)
  const max = maxTransitionDuration(prev, clip)
  const disabled = track.locked

  return (
    <section className="inspector-section">
      <h4 className="with-help">
        {t('transition.title')}
        <HelpTip text={t('transition.hint')} />
      </h4>
      <div className="transition-grid">
        <button className={!active ? 'active' : ''} disabled={disabled} onClick={() => setTransition(clip.id, null, 0)}>
          ✕ {t('transition.none')}
        </button>
        {TRANSITION_KINDS.map((kind) => (
          <button
            key={kind}
            className={active?.kind === kind ? 'active' : ''}
            disabled={disabled}
            onClick={() => setTransition(clip.id, kind, active?.duration ?? Math.min(defaultTransitionFor(kind), max))}
          >
            {TRANSITION_ICON[kind]} {t(`transition.kinds.${kind}`)}
          </button>
        ))}
      </div>
      {active && (
        <SliderField
          label={t('transition.duration')}
          display={`${(active.duration / MICROS_PER_SECOND).toFixed(1)}s`}
          value={active.duration}
          min={MIN_TRANSITION}
          max={Math.max(MIN_TRANSITION, max)}
          step={100_000}
          disabled={disabled || max <= MIN_TRANSITION}
          onChange={(v, s) => setTransition(clip.id, active.kind, v, s)}
          onReset={() => setTransition(clip.id, active.kind, defaultTransitionFor(active.kind))}
        />
      )}
    </section>
  )
}
