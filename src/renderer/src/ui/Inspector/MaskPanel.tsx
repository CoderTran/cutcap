// Điều chỉnh → Mặt nạ (giống CapCut): Tách, Cuộn phim, Hình tròn, Hình chữ nhật (Văn bản, Cọ, Bút: sắp có).
// Chỉ giữ vùng trong mặt nạ, phần ngoài trong suốt → lộ track bên dưới. Video xuất ra giống khung Xem trước.
import type { Draft } from 'immer'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Id, MediaAsset, MediaClip } from '@shared/project/schema'
import { defaultMask, MASK_SHAPES, MASK_SHAPES_SOON, type ClipMask, type MaskShape } from '@shared/render/mask'
import { findClip } from '@shared/timeline/clips'
import { maskAt, MASK_PROPS, type MaskProp } from '@shared/timeline/keyframes'
import { editorStore, useEditorStore } from '../../state/editorStore'
import { editTimeFor } from '../../state/keyframeActions'
import { setMaskValues } from '../../state/maskActions'
import { projectStore } from '../../state/projectStore'
import { HelpTip } from '../HelpTip'
import { Icon } from '../icons'
import { KeyframeButton } from './KeyframeButton'
import { NumberBox } from './NumberBox'
import { SliderField } from './SliderField'

const coalesce = (session?: string) => (session ? { coalesceKey: session, coalesceWindowMs: Number.POSITIVE_INFINITY } : undefined)

function setMask(clipId: Id, mask: ClipMask | null): void {
  projectStore.getState().apply('history.mask', (d) => {
    const c = findClip(d, clipId)?.clip
    if (c?.type !== 'media') return
    c.mask = mask
    if (!mask) for (const p of MASK_PROPS) delete c.keyframes[p]
  })
}

function editMask(clipId: Id, recipe: (m: Draft<ClipMask>) => void, session?: string): void {
  projectStore.getState().apply(
    'history.mask',
    (d) => {
      const c = findClip(d, clipId)?.clip
      if (c?.type === 'media' && c.mask) recipe(c.mask)
    },
    coalesce(session)
  )
}

/** Biểu tượng nhỏ cho từng loại mặt nạ. */
function ShapeIcon({ shape }: { shape: MaskShape | (typeof MASK_SHAPES_SOON)[number] }): React.JSX.Element {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }
  return (
    <svg viewBox="0 0 32 32" width="30" height="30">
      <rect x="4" y="6" width="24" height="20" rx="2" {...common} />
      {shape === 'linear' && <line x1="4" y1="16" x2="28" y2="16" {...common} />}
      {shape === 'mirror' && (
        <>
          <line x1="4" y1="12" x2="28" y2="12" {...common} />
          <line x1="4" y1="20" x2="28" y2="20" {...common} />
        </>
      )}
      {shape === 'circle' && <circle cx="16" cy="16" r="6" {...common} />}
      {shape === 'rect' && <rect x="10" y="11" width="12" height="10" {...common} />}
      {shape === 'text' && <path d="M11 12h10M16 12v9" {...common} />}
      {shape === 'brush' && <path d="M11 21c3-1 3-4 6-6l3-3" {...common} />}
      {shape === 'pen' && <path d="M11 21l3-8 6-2-2 6z" {...common} />}
    </svg>
  )
}

export function MaskPanel({ clip, asset, disabled }: { clip: MediaClip; asset: MediaAsset; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  // Đang mở mục này → khung Xem trước hiện khung kéo mặt nạ
  useEffect(() => {
    editorStore.getState().setMaskEditing(true)
    return () => editorStore.getState().setMaskEditing(false)
  }, [])
  // Đơn vị pixel như CapCut: theo kích thước khung hình gốc của clip
  const frame = { w: asset.width ?? 1920, h: asset.height ?? 1080 }
  const mask = clip.mask
  const choose = (shape: MaskShape | null): void => {
    if (shape === null) setMask(clip.id, null)
    // Đổi loại: giữ vị trí / xoay / lông vũ / đảo ngược, lấy kích thước mặc định của loại mới
    else
      setMask(
        clip.id,
        mask
          ? { ...defaultMask(shape), x: mask.x, y: mask.y, rotation: mask.rotation, feather: mask.feather, invert: mask.invert }
          : defaultMask(shape)
      )
  }
  return (
    <section className="inspector-section">
      <div className="row">
        <h4 className="with-help">
          {t('mask.title')}
          <HelpTip text={t('mask.hint')} />
        </h4>
        <button className="icon ghost" disabled={disabled || !mask} title={t('mask.remove')} onClick={() => choose(null)}>
          <Icon name="undo" size={14} />
        </button>
      </div>
      <div className="curve-grid mask-grid">
        <button className={`curve-tile ${!mask ? 'active' : ''}`} disabled={disabled} onClick={() => choose(null)}>
          <span className="curve-thumb">
            <Icon name="ban" size={22} />
          </span>
          <span>{t('mask.none')}</span>
        </button>
        {MASK_SHAPES.map((s) => (
          <button key={s} className={`curve-tile ${mask?.shape === s ? 'active' : ''}`} disabled={disabled} onClick={() => choose(s)}>
            <span className="curve-thumb">
              <ShapeIcon shape={s} />
            </span>
            <span>{t(`mask.shapes.${s}`)}</span>
          </button>
        ))}
        {MASK_SHAPES_SOON.map((s) => (
          <button key={s} className="curve-tile" disabled title={t('mask.soon')}>
            <span className="curve-thumb">
              <ShapeIcon shape={s} />
            </span>
            <span>{t(`mask.shapes.${s}`)}</span>
          </button>
        ))}
      </div>
      {mask && <MaskOptions clip={clip} mask={mask} frame={frame} disabled={disabled} />}
    </section>
  )
}

/**
 * "Tùy chọn cài đặt mặt nạ" (bố cục như CapCut): Vị trí X / Y (pixel, gốc ở giữa khung, Y hướng lên),
 * Xoay (ô số + núm xoay), Kích thước (pixel), Bo góc, Làm mờ viền; nút Đảo ngược và Đặt lại ở tiêu đề.
 */
function MaskOptions({
  clip,
  mask: base,
  frame,
  disabled
}: {
  clip: MediaClip
  mask: ClipMask
  frame: { w: number; h: number }
  disabled: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  // Giá trị tại đầu phát (đã nội suy keyframe) – giống các thanh Biến đổi
  const now = useEditorStore((st) => st.currentTime)
  const mask = maskAt(clip, editTimeFor(clip, now)) ?? base
  /** Đổi một thông số: đã có keyframe → tạo/cập nhật keyframe tại đầu phát (giống CapCut). */
  const setVal = (prop: MaskProp, value: number, session?: string): void => setMaskValues(clip.id, { [prop]: value }, session)
  const kf = (props: MaskProp[]): React.JSX.Element => <KeyframeButton clip={clip} props={props} disabled={disabled} />
  const short = Math.min(frame.w, frame.h)
  const px = (v: number): number => Math.round(v)
  const box = (label: string, value: number, onCommit: (v: number) => void, min: number, max: number, unit = '', digits = 0) => (
    <span className="mask-num">
      {label && <i>{label}</i>}
      <NumberBox value={value} digits={digits} unit={unit} step={1} min={min} max={max} disabled={disabled} onCommit={onCommit} />
    </span>
  )
  const defaults = defaultMask(mask.shape)
  const sized = mask.shape === 'circle' || mask.shape === 'rect'
  return (
    <div className="mask-options">
      <div className="row">
        <h4>{t('mask.options')}</h4>
        <span className="mask-head-actions">
          {kf(MASK_PROPS)}
          <button
            className={`icon ghost ${mask.invert ? 'active' : ''}`}
            disabled={disabled}
            title={t('mask.invertHint')}
            onClick={() => editMask(clip.id, (m) => void (m.invert = !m.invert))}
          >
            <Icon name="invert" size={15} />
          </button>
          <button
            className="icon ghost"
            disabled={disabled}
            title={t('mask.reset')}
            onClick={() =>
              projectStore.getState().apply('history.mask', (d) => {
                const c = findClip(d, clip.id)?.clip
                if (c?.type !== 'media' || !c.mask) return
                Object.assign(c.mask, { ...defaults, invert: c.mask.invert })
                for (const p of MASK_PROPS) delete c.keyframes[p]
              })
            }
          >
            <Icon name="undo" size={14} />
          </button>
        </span>
      </div>

      <div className="mask-row">
        <span>{t('mask.position')}</span>
        {box('X', px((mask.x - 0.5) * frame.w), (v) => setVal('maskX', 0.5 + v / frame.w), -frame.w, frame.w)}
        {box('Y', px((0.5 - mask.y) * frame.h), (v) => setVal('maskY', 0.5 - v / frame.h), -frame.h, frame.h)}
        {kf(['maskX', 'maskY'])}
      </div>

      <div className="mask-row">
        <span>{t('mask.rotation')}</span>
        {box('', mask.rotation, (v) => setVal('maskRotation', v), -180, 180, '°', 1)}
        <RotationKnob value={mask.rotation} disabled={disabled} onChange={(v, s) => setVal('maskRotation', v, s)} />
        {kf(['maskRotation'])}
      </div>

      {sized && (
        <div className="mask-row">
          <span>{t('mask.size')}</span>
          {box('W', px(mask.width * short), (v) => setVal('maskWidth', Math.max(1, v) / short), 1, short * 3)}
          {box('H', px(mask.height * short), (v) => setVal('maskHeight', Math.max(1, v) / short), 1, short * 3)}
          {kf(['maskWidth', 'maskHeight'])}
        </div>
      )}
      {mask.shape === 'mirror' && (
        <div className="mask-row">
          <span>{t('mask.size')}</span>
          {box('↕', px(mask.width * short), (v) => setVal('maskWidth', Math.max(1, v) / short), 1, short * 3)}
          <span />
          {kf(['maskWidth'])}
        </div>
      )}
      {mask.shape === 'rect' && (
        <SliderField
          label={t('mask.roundness')}
          display=""
          value={mask.roundness}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          onChange={(v, s) => setVal('maskRoundness', v, s)}
          onReset={() => setVal('maskRoundness', 0)}
          extra={
            <>
              <NumberBox
                value={mask.roundness}
                digits={0}
                unit=""
                step={1}
                min={0}
                max={100}
                disabled={disabled}
                onCommit={(v) => setVal('maskRoundness', v)}
              />
              {kf(['maskRoundness'])}
            </>
          }
        />
      )}
      <SliderField
        label={t('mask.feather')}
        display=""
        value={mask.feather}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onChange={(v, s) => setVal('maskFeather', v, s)}
        onReset={() => setVal('maskFeather', 0)}
        extra={
          <>
            <NumberBox
              value={mask.feather}
              digits={0}
              unit=""
              step={1}
              min={0}
              max={100}
              disabled={disabled}
              onCommit={(v) => setVal('maskFeather', v)}
            />
            {kf(['maskFeather'])}
          </>
        }
      />
    </div>
  )
}

/** Núm xoay: kéo chuột quanh tâm để đổi góc (giữ Shift: bước 15°). Bấm đúp: về 0°. */
function RotationKnob({
  value,
  disabled,
  onChange
}: {
  value: number
  disabled: boolean
  onChange: (v: number, session?: string) => void
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const onDown = (e: React.PointerEvent): void => {
    if (disabled || e.button !== 0) return
    e.preventDefault()
    const session = `knob:${performance.now()}`
    const move = (ev: PointerEvent | React.PointerEvent): void => {
      const r = ref.current!.getBoundingClientRect()
      // 0° = kim chỉ sang phải (như CapCut), chiều kim đồng hồ là dương
      let deg = (Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)) * 180) / Math.PI
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15
      onChange(Math.round(deg * 10) / 10, session)
    }
    move(e)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <span ref={ref} className={`rotation-knob ${disabled ? 'disabled' : ''}`} onPointerDown={onDown} onDoubleClick={() => onChange(0)}>
      <i style={{ transform: `rotate(${value}deg)` }} />
    </span>
  )
}
