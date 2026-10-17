// Biến đổi lớp hình (video, ảnh, chữ): kích thước, vị trí, xoay, độ mờ – mỗi dòng có nút keyframe ‹ ◇ ›.
// Giá trị hiển thị là giá trị TẠI ĐẦU PHÁT (có keyframe thì đổi theo thời gian).
// Vị trí cũng kéo trực tiếp được trên khung Xem trước.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { canvasSize } from '@shared/project/canvas'
import type { Clip } from '@shared/project/schema'
import { transformAt } from '@shared/timeline/keyframes'
import { useEditorStore } from '../../state/editorStore'
import { editTimeFor } from '../../state/keyframeActions'
import { useProjectStore } from '../../state/projectStore'
import { setTransform } from '../../state/textActions'
import { KeyframeButton } from './KeyframeButton'
import { SliderField } from './SliderField'

export function TransformSection({ clip, disabled }: { clip: Clip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const now = useEditorStore((s) => s.currentTime)
  const settings = useProjectStore((s) => s.project.settings)
  const tf = transformAt(clip, editTimeFor(clip, now))
  const centered = Math.abs(tf.x - 0.5) < 1e-6 && Math.abs(tf.y - 0.5) < 1e-6
  // Vị trí hiển thị theo pixel của video xuất ra, gốc (0, 0) ở giữa khung – giống CapCut
  const frame = canvasSize(settings.aspectRatio, settings.resolution)

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
        extra={<KeyframeButton clip={clip} props={['scale']} disabled={disabled} />}
      />
      <div className="field">
        <span className="slider-head">
          <span>{t('transform.position')}</span>
          <KeyframeButton clip={clip} props={['x', 'y']} disabled={disabled} />
        </span>
        <div className="position-row">
          <PixelInput
            label="X"
            value={(tf.x - 0.5) * frame.width}
            disabled={disabled}
            onCommit={(px) => setTransform(clip.id, { x: 0.5 + px / frame.width })}
          />
          <PixelInput
            label="Y"
            value={(tf.y - 0.5) * frame.height}
            disabled={disabled}
            onCommit={(px) => setTransform(clip.id, { y: 0.5 + px / frame.height })}
          />
          <button disabled={disabled || centered} onClick={() => setTransform(clip.id, { x: 0.5, y: 0.5 })}>
            {t('transform.center')}
          </button>
        </div>
      </div>
      <SliderField
        label={t('transform.rotation')}
        display={`${Math.round(tf.rotation)}°`}
        value={Math.max(-180, Math.min(180, tf.rotation))}
        min={-180}
        max={180}
        step={1}
        disabled={disabled}
        onChange={(v, s) => setTransform(clip.id, { rotation: v }, s)}
        onReset={() => setTransform(clip.id, { rotation: 0 })}
        extra={<KeyframeButton clip={clip} props={['rotation']} disabled={disabled} />}
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
        extra={<KeyframeButton clip={clip} props={['opacity']} disabled={disabled} />}
      />
      <p className="hint">{t('transform.dragHint')}</p>
    </section>
  )
}

/** Ô nhập số pixel: gõ xong bấm Enter hoặc rời ô thì mới áp dụng (1 bước Undo). */
function PixelInput({
  label,
  value,
  disabled,
  onCommit
}: {
  label: string
  value: number
  disabled: boolean
  onCommit: (px: number) => void
}): React.JSX.Element {
  const shown = String(Math.round(value))
  const [text, setText] = useState(shown)
  const [editing, setEditing] = useState(false)
  // Esc = bỏ qua phần đang gõ (blur ngay sau đó không được áp dụng giá trị)
  const cancelled = useRef(false)
  useEffect(() => {
    if (!editing) setText(shown)
  }, [shown, editing])

  const commit = (): void => {
    setEditing(false)
    if (cancelled.current) {
      cancelled.current = false
      setText(shown)
      return
    }
    const n = Number(text.replace(',', '.'))
    if (Number.isFinite(n) && Math.round(n) !== Math.round(value)) onCommit(n)
    else setText(shown)
  }

  return (
    <label className="pixel-input">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={editing ? text : shown}
        disabled={disabled}
        onFocus={(e) => {
          setEditing(true)
          setText(shown)
          e.currentTarget.select()
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}
