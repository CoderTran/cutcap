// Biến đổi lớp hình (video, ảnh, chữ): phóng to, xoay, độ mờ, đưa về giữa.
// Vị trí thì kéo trực tiếp trên khung Xem trước.
import { useTranslation } from 'react-i18next'
import type { Clip } from '@shared/project/schema'
import { setTransform } from '../../state/textActions'
import { SliderField } from './SliderField'

export function TransformSection({ clip, disabled }: { clip: Clip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const tf = clip.transform
  const centered = Math.abs(tf.x - 0.5) < 1e-6 && Math.abs(tf.y - 0.5) < 1e-6

  return (
    <section className="inspector-section">
      <h4>{t('transform.title')}</h4>
      <SliderField
        label={t('transform.scale')}
        display={`${Math.round(tf.scale * 100)}%`}
        // Thang logarit: 25% và 400% cách đều 100%
        value={Math.log2(tf.scale)}
        min={-3}
        max={2}
        step={0.01}
        disabled={disabled}
        onChange={(v, s) => setTransform(clip.id, { scale: Math.round(2 ** v * 100) / 100 }, s)}
        onReset={() => setTransform(clip.id, { scale: 1 })}
      />
      <SliderField
        label={t('transform.rotation')}
        display={`${Math.round(tf.rotation)}°`}
        value={tf.rotation}
        min={-180}
        max={180}
        step={1}
        disabled={disabled}
        onChange={(v, s) => setTransform(clip.id, { rotation: v }, s)}
        onReset={() => setTransform(clip.id, { rotation: 0 })}
      />
      <SliderField
        label={t('transform.opacity')}
        display={`${Math.round(tf.opacity * 100)}%`}
        value={tf.opacity * 100}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onChange={(v, s) => setTransform(clip.id, { opacity: v / 100 }, s)}
        onReset={() => setTransform(clip.id, { opacity: 1 })}
      />
      <div className="row">
        <span className="hint">{t('transform.dragHint')}</span>
        <button disabled={disabled || centered} onClick={() => setTransform(clip.id, { x: 0.5, y: 0.5 })}>
          {t('transform.center')}
        </button>
      </div>
    </section>
  )
}
