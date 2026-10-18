// Điều chỉnh → Vòng tròn màu (giống CapCut): Vùng tối, Xám trung bình, Vùng sáng, Offset.
// Kéo chấm trong vòng: hướng = màu, xa tâm = mạnh hơn. Thanh dọc bên cạnh: độ sáng. Bấm đúp vòng: về giữa.
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaClip } from '@shared/project/schema'
import { emptyGrade, WHEELS, type Wheel, type WheelKey } from '@shared/render/grade'
import { updateGrade } from '../../state/gradeActions'
import { HelpTip } from '../HelpTip'
import { Icon } from '../icons'
import { GradeSlider } from './GradePanel'

/** Màu thuần của góc (độ) – r, g, b 0–1. */
function hueRgb(h: number): [number, number, number] {
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

/** Vị trí chấm (−1…1, y hướng lên) → độ lệch r, g, b. */
export function wheelFromPoint(x: number, y: number): Pick<Wheel, 'r' | 'g' | 'b'> {
  const m = Math.min(1, Math.hypot(x, y))
  if (m < 1e-4) return { r: 0, g: 0, b: 0 }
  // 0° = đỏ ở trên cùng, đi theo chiều kim đồng hồ (giống bánh xe màu của CapCut)
  const hue = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360
  const [r, g, b] = hueRgb(hue)
  const avg = (r + g + b) / 3
  const k = (v: number): number => Math.round((v - avg) * m * 2 * 100) / 100
  return { r: k(r), g: k(g), b: k(b) }
}

/** Ngược lại: độ lệch r, g, b → vị trí chấm. */
export function pointFromWheel(w: Pick<Wheel, 'r' | 'g' | 'b'>): { x: number; y: number } {
  const max = Math.max(w.r, w.g, w.b)
  const min = Math.min(w.r, w.g, w.b)
  const m = (max - min) / 2
  if (m < 1e-4) return { x: 0, y: 0 }
  const d = max - min
  let h = max === w.r ? (w.g - w.b) / d : max === w.g ? (w.b - w.r) / d + 2 : (w.r - w.g) / d + 4
  h = (((h * 60) % 360) + 360) % 360
  const rad = (h * Math.PI) / 180
  return { x: Math.sin(rad) * Math.min(1, m), y: Math.cos(rad) * Math.min(1, m) }
}

export function ColorWheels({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const wheels = (clip.grade ?? emptyGrade()).wheels
  const changed = WHEELS.some((k) => wheels[k].r || wheels[k].g || wheels[k].b || wheels[k].y)
  return (
    <section className="inspector-section">
      <div className="row">
        <h4 className="with-help">
          {t('grade.tabs.wheels')}
          <HelpTip text={t('grade.wheelsHint')} />
        </h4>
        <button
          className="icon ghost"
          disabled={disabled || !changed}
          title={t('grade.reset')}
          onClick={() => updateGrade(clip.id, (d) => void (d.wheels = emptyGrade().wheels))}
        >
          <Icon name="undo" size={14} />
        </button>
      </div>
      <GradeSlider
        label={t('grade.intensity')}
        value={wheels.intensity}
        min={0}
        disabled={disabled}
        onChange={(v, s) => updateGrade(clip.id, (d) => void (d.wheels.intensity = Math.round(v)), s)}
      />
      <div className="wheel-grid">
        {WHEELS.map((k) => (
          <WheelControl key={k} clip={clip} which={k} wheel={wheels[k]} disabled={disabled} />
        ))}
      </div>
    </section>
  )
}

function WheelControl({
  clip,
  which,
  wheel,
  disabled
}: {
  clip: MediaClip
  which: WheelKey
  wheel: Wheel
  disabled: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const dot = pointFromWheel(wheel)
  const set = (changes: Partial<Wheel>, session?: string): void =>
    updateGrade(clip.id, (d) => void Object.assign(d.wheels[which], changes), session)

  const onDown = (e: React.PointerEvent): void => {
    if (disabled || e.button !== 0) return
    e.preventDefault()
    const session = `wheel:${performance.now()}`
    const move = (ev: { clientX: number; clientY: number }): void => {
      const r = ref.current!.getBoundingClientRect()
      const x = ((ev.clientX - r.left) / r.width) * 2 - 1
      const y = 1 - ((ev.clientY - r.top) / r.height) * 2
      // Gần tâm thì "hít" về 0 cho dễ trả lại trung tính
      set(Math.hypot(x, y) < 0.06 ? { r: 0, g: 0, b: 0 } : wheelFromPoint(x, y), session)
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
    <div className="wheel">
      <div className="row">
        <span className="wheel-title">{t(`grade.wheels.${which}`)}</span>
        <button
          className="icon ghost"
          disabled={disabled || !(wheel.r || wheel.g || wheel.b || wheel.y)}
          title={t('grade.reset')}
          onClick={() => set({ r: 0, g: 0, b: 0, y: 0 })}
        >
          <Icon name="undo" size={12} />
        </button>
      </div>
      <div className="wheel-body">
        <div ref={ref} className="wheel-disc" onPointerDown={onDown} onDoubleClick={() => set({ r: 0, g: 0, b: 0 })}>
          <span className="wheel-dot" style={{ left: `${50 + dot.x * 50}%`, top: `${50 - dot.y * 50}%` }} />
        </div>
        <input
          type="range"
          className="wheel-luma"
          min={-100}
          max={100}
          step={1}
          value={Math.round(wheel.y * 100)}
          disabled={disabled}
          title={t('grade.wheelLuma')}
          onChange={(e) => set({ y: Number(e.target.value) / 100 }, `wheel-y:${which}`)}
          onDoubleClick={() => set({ y: 0 })}
        />
      </div>
      <div className="wheel-values">
        {(['r', 'g', 'b'] as const).map((c) => (
          <span key={c} className={`wheel-value ${c}`}>
            {wheel[c].toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  )
}
