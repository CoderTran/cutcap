// Bảng phải khi chọn clip hiệu ứng: tên hiệu ứng, đổi sang hiệu ứng khác, thông tin thời gian.
import { useTranslation } from 'react-i18next'
import type { EffectClip } from '@shared/project/schema'
import { formatTimecode } from '@shared/project/time'
import { EFFECT_CATEGORIES, EFFECTS, findEffect } from '@shared/render/effects'
import { clipEnd } from '@shared/timeline/clips'
import { setEffectId } from '../../state/effectActions'
import { useProjectStore } from '../../state/projectStore'
import { HelpTip } from '../HelpTip'

export function EffectPanel({ clip, disabled }: { clip: EffectClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const fps = useProjectStore((s) => s.project.settings.fps)
  const known = !!findEffect(clip.effectId)

  return (
    <div className="form">
      {disabled && <p className="hint">🔒 {t('clip.locked')}</p>}
      <section className="inspector-section">
        <h4 className="with-help">
          {t('effects.panelTitle')}
          <HelpTip text={t('effects.panelHint')} />
        </h4>
        <label className="field">
          <span>{t('effects.current')}</span>
          <select value={clip.effectId} disabled={disabled} onChange={(e) => setEffectId(clip.id, e.target.value)}>
            {!known && <option value={clip.effectId}>{t('effects.unknown', { id: clip.effectId })}</option>}
            {EFFECT_CATEGORIES.map((cat) => (
              <optgroup key={cat} label={t(`effects.categories.${cat}`)}>
                {EFFECTS.filter((e) => e.category === cat).map((e) => (
                  <option key={e.id} value={e.id}>
                    {t(`effects.names.${e.id}`)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </section>
      <section className="inspector-section">
        <dl className="info-list">
          <div>
            <dt>{t('clip.start')}</dt>
            <dd>{formatTimecode(clip.start, fps)}</dd>
          </div>
          <div>
            <dt>{t('clip.end')}</dt>
            <dd>{formatTimecode(clipEnd(clip), fps)}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
