// Video → Làm đẹp → Làn da (giống CapCut): mỗi mức 0–100, kéo thanh hoặc gõ số.
// AI nhận diện khuôn mặt ngay trên máy; chỉ vùng mặt bị ảnh hưởng.
import { useTranslation } from 'react-i18next'
import { BEAUTY_KEYS, emptyBeauty, isBeautyEmpty } from '@shared/render/beauty'
import type { MediaClip } from '@shared/project/schema'
import { emptyFaceShape, FACE_SHAPE_SLIDERS, isFaceShapeEmpty } from '@shared/render/faceShape'
import { setBeautyEnabled, setBeautyLevel, setFaceShapeEnabled, setFaceShapeLevel } from '../../state/beautyActions'
import { HelpTip } from '../HelpTip'
import { Icon } from '../icons'
import { NumberBox } from './NumberBox'
import { SliderField } from './SliderField'

export function BeautyPanel({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  return (
    <>
      <SkinSection clip={clip} disabled={disabled} />
      <FaceShapeSection clip={clip} disabled={disabled} />
    </>
  )
}

function SkinSection({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const beauty = clip.beauty ?? emptyBeauty()
  const on = !isBeautyEmpty(clip.beauty)

  return (
    <section className="inspector-section beauty-panel">
      <div className="row">
        <label className="check-row beauty-title">
          <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => setBeautyEnabled(clip.id, e.target.checked)} />
          <b>{t('beauty.skin')}</b>
          <HelpTip text={t('beauty.hint')} />
        </label>
        <button
          className="icon ghost"
          disabled={disabled || !on}
          title={t('beauty.reset')}
          onClick={() => setBeautyEnabled(clip.id, false)}
        >
          <Icon name="undo" size={14} />
        </button>
      </div>
      {BEAUTY_KEYS.map((key) => (
        <SliderField
          key={key}
          label={t(`beauty.${key}`)}
          display=""
          value={beauty[key]}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          onChange={(v, session) => setBeautyLevel(clip.id, key, v, session)}
          onReset={() => setBeautyLevel(clip.id, key, 0)}
          extra={
            <NumberBox
              value={beauty[key]}
              digits={0}
              unit=""
              step={1}
              min={0}
              max={100}
              disabled={disabled}
              onCommit={(v) => setBeautyLevel(clip.id, key, v)}
            />
          }
        />
      ))}
    </section>
  )
}

/** Khuôn mặt: thanh 0–100 (thon gọn, hàm…) và thanh 2 chiều −100…100, giữa là 0 (cằm, chân tóc…). */
function FaceShapeSection({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const shape = clip.faceShape ?? emptyFaceShape()
  const on = !isFaceShapeEmpty(clip.faceShape)

  return (
    <section className="inspector-section beauty-panel">
      <div className="row">
        <label className="check-row beauty-title">
          <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => setFaceShapeEnabled(clip.id, e.target.checked)} />
          <b>{t('faceShape.title')}</b>
          <HelpTip text={t('faceShape.hint')} />
        </label>
        <button
          className="icon ghost"
          disabled={disabled || !on}
          title={t('faceShape.reset')}
          onClick={() => setFaceShapeEnabled(clip.id, false)}
        >
          <Icon name="undo" size={14} />
        </button>
      </div>
      {FACE_SHAPE_SLIDERS.map(({ key, bipolar }) => (
        <SliderField
          key={key}
          label={t(`faceShape.${key}`)}
          display=""
          value={shape[key]}
          min={bipolar ? -100 : 0}
          max={100}
          step={1}
          disabled={disabled}
          onChange={(v, session) => setFaceShapeLevel(clip.id, key, v, session)}
          onReset={() => setFaceShapeLevel(clip.id, key, 0)}
          extra={
            <NumberBox
              value={shape[key]}
              digits={0}
              unit=""
              step={1}
              min={bipolar ? -100 : 0}
              max={100}
              disabled={disabled}
              onCommit={(v) => setFaceShapeLevel(clip.id, key, v)}
            />
          }
        />
      ))}
    </section>
  )
}
