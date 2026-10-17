// Thanh thời lượng 2 đầu của hiệu ứng động "Kết hợp" (giống CapCut):
//   [■■■ vào ●───────────────● ra ■■]   thanh dài bằng cả clip
//   - núm trái: phần VÀO kéo dài từ đầu clip tới đây
//   - núm phải: phần RA bắt đầu từ đây tới cuối clip
// Kéo bằng chuột, hoặc bấm vào núm rồi dùng phím ← → (mỗi lần 0.1 giây). Mỗi lần kéo = 1 bước Undo.
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaClip } from '@shared/project/schema'
import { MICROS_PER_SECOND } from '@shared/project/time'
import { comboSpans } from '@shared/render/clipAnims'
import { MIN_ANIM_US, setComboDurations } from '../../state/animActions'
import { HelpTip } from '../HelpTip'

const STEP = MICROS_PER_SECOND / 10
const seconds = (us: number): string => `${(us / MICROS_PER_SECOND).toFixed(1)}s`

export function ComboRangeSlider({ clip, disabled, help }: { clip: MediaClip; disabled: boolean; help?: string }): React.JSX.Element {
  const { t } = useTranslation()
  const trackRef = useRef<HTMLDivElement>(null)
  const D = clip.duration
  const { inUs, outUs } = comboSpans(clip)
  const leftPct = (inUs / D) * 100
  const rightPct = ((D - outUs) / D) * 100

  /** Đổi vị trí con trỏ thành thời gian trên clip (làm tròn 0.1 giây). */
  const timeAt = (clientX: number): number => {
    const r = trackRef.current!.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    return Math.round((f * D) / STEP) * STEP
  }

  const apply = (handle: 'in' | 'out', time: number, session: string): void => {
    if (handle === 'in') setComboDurations(clip.id, Math.min(time, D - outUs), outUs, session)
    else setComboDurations(clip.id, inUs, Math.min(D - time, D - inUs), session)
  }

  const startDrag =
    (handle: 'in' | 'out') =>
    (e: React.PointerEvent<HTMLButtonElement>): void => {
      if (disabled || e.button !== 0) return
      e.preventDefault()
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      target.focus()
      const session = `combo-${handle}:${performance.now()}`
      // 2 núm trùng chỗ (vào + ra = cả clip): chuột luôn trúng núm trên cùng → xem hướng kéo để chọn núm:
      // kéo sang trái = thu phần vào (núm trái), sang phải = thu phần ra (núm phải)
      const overlapped = inUs + outUs >= D - STEP / 2
      const startX = e.clientX
      let which: 'in' | 'out' | null = overlapped ? null : handle
      const move = (ev: PointerEvent): void => {
        if (!which) {
          if (Math.abs(ev.clientX - startX) < 2) return
          which = ev.clientX < startX ? 'in' : 'out'
        }
        apply(which, timeAt(ev.clientX), session)
      }
      const up = (): void => {
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
        target.removeEventListener('pointercancel', up)
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
      target.addEventListener('pointercancel', up)
    }

  /** Bấm lên thanh (không trúng núm): kéo núm gần nhất tới đó. */
  const onTrackDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (disabled || e.target !== e.currentTarget) return
    const time = timeAt(e.clientX)
    const nearIn = Math.abs(time - inUs) <= Math.abs(time - (D - outUs))
    apply(nearIn ? 'in' : 'out', time, `combo-click:${performance.now()}`)
  }

  const onKey =
    (handle: 'in' | 'out') =>
    (e: React.KeyboardEvent): void => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      e.stopPropagation() // không để phím mũi tên tua đầu phát
      const delta = e.key === 'ArrowRight' ? STEP : -STEP
      const session = `combo-key:${performance.now()}`
      if (handle === 'in') setComboDurations(clip.id, Math.max(MIN_ANIM_US, inUs + delta), outUs, session)
      else setComboDurations(clip.id, inUs, Math.max(MIN_ANIM_US, outUs - delta), session)
    }

  return (
    <div className={`combo-range ${disabled ? 'disabled' : ''}`}>
      <div className="slider-head">
        <span className="with-help">
          {t('anim.duration')}
          {help && <HelpTip text={help} />}
        </span>
        <b>
          {t('anim.comboIn')} {seconds(inUs)} · {t('anim.comboOut')} {seconds(outUs)}
        </b>
      </div>
      <div className="combo-track" ref={trackRef} onPointerDown={onTrackDown}>
        <div className="combo-fill" style={{ left: 0, width: `${leftPct}%` }} />
        <div className="combo-fill" style={{ left: `${rightPct}%`, right: 0 }} />
        <button
          className="combo-handle"
          style={{ left: `${leftPct}%` }}
          disabled={disabled}
          role="slider"
          aria-label={t('anim.comboIn')}
          aria-valuenow={inUs / MICROS_PER_SECOND}
          title={`${t('anim.comboIn')}: ${seconds(inUs)}`}
          onPointerDown={startDrag('in')}
          onKeyDown={onKey('in')}
        >
          ‹
        </button>
        <button
          className="combo-handle"
          style={{ left: `${rightPct}%` }}
          disabled={disabled}
          role="slider"
          aria-label={t('anim.comboOut')}
          aria-valuenow={outUs / MICROS_PER_SECOND}
          title={`${t('anim.comboOut')}: ${seconds(outUs)}`}
          onPointerDown={startDrag('out')}
          onKeyDown={onKey('out')}
        >
          ›
        </button>
      </div>
    </div>
  )
}
