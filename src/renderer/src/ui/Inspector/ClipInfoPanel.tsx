// Các mục thuộc tính của clip media (Inspector ghép chúng thành các tab kiểu CapCut):
// Tốc độ, Âm thanh (âm lượng, fade), Thông tin.
import { useTranslation } from 'react-i18next'
import type { Clip, MediaAsset, MediaClip, Track } from '@shared/project/schema'
import { MICROS_PER_SECOND, formatDuration, formatTimecode } from '@shared/project/time'
import { clipEnd } from '@shared/timeline/clips'
import { MAX_SPEED, MAX_VOLUME, MIN_SPEED, effectiveFades, planSpeed } from '@shared/timeline/clipProps'
import { setClipFades, setClipSpeed, setClipVolume } from '../../state/clipActions'
import { projectStore, useProjectStore } from '../../state/projectStore'
import { minClipDuration } from '../../state/timelineActions'
import { SliderField } from './SliderField'

const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4]

// Thanh trượt tốc độ theo thang logarit: 0.25× và 4× cách đều 1× → kéo cảm giác cân đối
const toSlider = (speed: number): number => Math.log2(speed)
const fromSlider = (v: number): number => Math.round(2 ** v * 100) / 100
/** Fade tối đa 10 giây (hoặc bằng độ dài clip nếu ngắn hơn). */
const MAX_FADE_US = 10 * MICROS_PER_SECOND

export function SpeedSection({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const fps = useProjectStore((s) => s.project.settings.fps)
  // Thử trước từng mức tốc độ: mức nào làm clip đè lên clip phía sau thì cảnh báo trên nút
  const preview = (speed: number) => planSpeed(projectStore.getState().project, clip.id, speed, minClipDuration())
  const sourceSpanUs = clip.duration * clip.speed

  return (
    <section className="inspector-section">
      <h4>{t('clip.speedTitle')}</h4>
      <SliderField
        label={t('clip.speed')}
        display={`${clip.speed}×`}
        value={toSlider(clip.speed)}
        min={toSlider(MIN_SPEED)}
        max={toSlider(MAX_SPEED)}
        step={0.01}
        disabled={disabled}
        onChange={(v, session) => setClipSpeed(clip.id, fromSlider(v), session)}
        onReset={() => setClipSpeed(clip.id, 1)}
      />
      <div className="segmented small">
        {SPEED_PRESETS.map((s) => (
          <button
            key={s}
            className={s === clip.speed ? 'active' : ''}
            disabled={disabled}
            onClick={() => setClipSpeed(clip.id, s)}
            title={preview(s)?.truncated ? t('clip.speedTruncated') : undefined}
          >
            {s}×
          </button>
        ))}
      </div>
      <p className="hint">
        {t('clip.speedResult', {
          source: formatTimecode(sourceSpanUs, fps),
          duration: formatTimecode(clip.duration, fps)
        })}
      </p>
    </section>
  )
}

export function AudioSection({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const { fadeIn, fadeOut } = effectiveFades(clip)
  const maxFade = Math.min(MAX_FADE_US, clip.duration)
  const seconds = (us: number): string => `${(us / MICROS_PER_SECOND).toFixed(1)}s`

  return (
    <section className="inspector-section">
      <h4>{t('clip.audioTitle')}</h4>
      <SliderField
        label={t('clip.volume')}
        display={clip.volume === 0 ? t('clip.muted') : `${Math.round(clip.volume * 100)}%`}
        value={clip.volume * 100}
        min={0}
        max={MAX_VOLUME * 100}
        step={1}
        disabled={disabled}
        onChange={(v, session) => setClipVolume(clip.id, v / 100, session)}
        onReset={() => setClipVolume(clip.id, 1)}
      />
      <SliderField
        label={t('clip.fadeIn')}
        display={seconds(fadeIn)}
        value={fadeIn}
        min={0}
        max={maxFade}
        step={MICROS_PER_SECOND / 10}
        disabled={disabled}
        onChange={(v, session) => setClipFades(clip.id, v, Math.min(fadeOut, clip.duration - v), session)}
        onReset={() => setClipFades(clip.id, 0, fadeOut)}
      />
      <SliderField
        label={t('clip.fadeOut')}
        display={seconds(fadeOut)}
        value={fadeOut}
        min={0}
        max={maxFade}
        step={MICROS_PER_SECOND / 10}
        disabled={disabled}
        onChange={(v, session) => setClipFades(clip.id, Math.min(fadeIn, clip.duration - v), v, session)}
        onReset={() => setClipFades(clip.id, fadeIn, 0)}
      />
      <p className="hint">{t('clip.resetHint')}</p>
    </section>
  )
}

export function InfoSection({ clip, track, asset }: { clip: Clip; track: Track; asset: MediaAsset | undefined }): React.JSX.Element {
  const { t } = useTranslation()
  const fps = useProjectStore((s) => s.project.settings.fps)
  const tc = (us: number): string => formatTimecode(us, fps)
  const rows: [string, string][] = [
    [t('clip.track'), t(`track.kind.${track.kind}`)],
    [t('clip.start'), tc(clip.start)],
    [t('clip.end'), tc(clipEnd(clip))],
    [t('clip.duration'), formatDuration(clip.duration)]
  ]
  if (clip.type === 'media') rows.push([t('clip.sourceIn'), tc(clip.sourceIn)])
  if (asset?.width && asset.height) rows.push([t('clip.resolution'), `${asset.width} × ${asset.height}`])

  return (
    <section className="inspector-section">
      <h4>{t('clip.infoTitle')}</h4>
      <dl className="info-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
