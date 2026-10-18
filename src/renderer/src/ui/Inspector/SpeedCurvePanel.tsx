// Tốc độ → Uốn cong (giống CapCut): chọn mẫu (Dựng phim, Anh hùng, Viên đạn…) rồi chỉnh đường cong.
//   - Trục ngang: vị trí trong đoạn gốc của clip · trục dọc: tốc độ 0.1× – 1× – 10× (thang log)
//   - Kéo điểm lên/xuống (tốc độ), sang ngang (vị trí); "+" thêm điểm tại đầu phát, "−" xóa điểm đang chọn
//   - Mỗi lần kéo = 1 bước Undo. Độ dài clip trên timeline đổi theo (giữ nguyên nội dung).
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaClip } from '@shared/project/schema'
import { MICROS_PER_SECOND } from '@shared/project/time'
import { sourceSpanOf } from '@shared/timeline/clipTime'
import {
  bakeCurve,
  clampCurveSpeed,
  MAX_CURVE_SPEED,
  MIN_CURVE_SPEED,
  presetCurve,
  sourceFracAt,
  SPEED_CURVE_PRESETS,
  speedAtPoint,
  type SpeedCurve,
  type SpeedCurvePreset,
  type SpeedPoint
} from '@shared/timeline/speedCurve'
import { setClipSpeedCurve } from '../../state/clipActions'
import { useEditorStore } from '../../state/editorStore'
import { HelpTip } from '../HelpTip'
import { Icon } from '../icons'

const W = 400
const H = 170
const PAD = 14
/** Tốc độ → toạ độ y (thang log: 10× ở trên, 1× giữa, 0.1× dưới). */
const yOf = (v: number): number => H / 2 - (Math.log10(clampCurveSpeed(v)) * (H / 2 - PAD)) / Math.log10(MAX_CURVE_SPEED)
const vOf = (y: number): number => clampCurveSpeed(10 ** (((H / 2 - y) / (H / 2 - PAD)) * Math.log10(MAX_CURVE_SPEED)))
const xOf = (x: number): number => PAD + x * (W - 2 * PAD)
const seconds = (us: number): string => `${(us / MICROS_PER_SECOND).toFixed(1)}s`

/** Đường cong nhỏ cho ô mẫu. */
function MiniCurve({ points }: { points: SpeedPoint[] }): React.JSX.Element {
  const d = Array.from({ length: 41 }, (_, i) => {
    const x = i / 40
    return `${i ? 'L' : 'M'}${(4 + x * 52).toFixed(1)},${(20 - Math.log10(speedAtPoint(points, x)) * 13).toFixed(1)}`
  }).join('')
  return (
    <svg viewBox="0 0 60 40" className="curve-mini">
      <line x1="2" x2="58" y1="20" y2="20" className="curve-mini-axis" />
      <path d={d} />
    </svg>
  )
}

export function SpeedCurvePanel({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const active: SpeedCurvePreset | null = clip.speedCurve?.preset ?? null

  return (
    <section className="inspector-section">
      <div className="curve-grid">
        <button
          className={`curve-tile ${active === null ? 'active' : ''}`}
          disabled={disabled}
          onClick={() => setClipSpeedCurve(clip.id, null)}
        >
          <span className="curve-thumb">
            <Icon name="ban" size={22} />
          </span>
          <span>{t('speedCurve.none')}</span>
        </button>
        {SPEED_CURVE_PRESETS.map((p) => (
          <button
            key={p}
            className={`curve-tile ${active === p ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => setClipSpeedCurve(clip.id, presetCurve(p))}
          >
            <span className="curve-thumb">
              <MiniCurve points={presetCurve(p).points} />
            </span>
            <span>{t(`speedCurve.presets.${p}`)}</span>
          </button>
        ))}
      </div>
      {clip.speedCurve && <CurveEditor clip={clip} curve={clip.speedCurve} disabled={disabled} />}
    </section>
  )
}

function CurveEditor({ clip, curve, disabled }: { clip: MediaClip; curve: SpeedCurve; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const now = useEditorStore((s) => s.currentTime)
  // Clip đã cắt / tỉa: hiển thị (và chỉnh) đúng phần đường cong của clip này
  const shown = bakeCurve(curve)
  const points = shown.points
  const span = sourceSpanOf(clip)
  const local = (now - clip.start) / Math.max(1, clip.duration)
  const playX = local >= 0 && local <= 1 ? sourceFracAt(curve, local) : null

  const path = Array.from({ length: 121 }, (_, i) => {
    const x = i / 120
    return `${i ? 'L' : 'M'}${xOf(x).toFixed(1)},${yOf(speedAtPoint(points, x)).toFixed(1)}`
  }).join('')

  const commit = (next: SpeedPoint[], session?: string): void =>
    setClipSpeedCurve(clip.id, { preset: shown.preset, points: next, range: [0, 1] }, session)

  /** Kéo điểm i: dọc = tốc độ; ngang = vị trí (giữa 2 điểm kề; 2 điểm đầu/cuối chỉ kéo dọc). */
  const startDrag =
    (i: number) =>
    (e: React.PointerEvent): void => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      setSelected(i)
      const svg = svgRef.current!
      const session = `curve:${performance.now()}`
      const toLocal = (ev: PointerEvent | React.PointerEvent): { x: number; y: number } => {
        const r = svg.getBoundingClientRect()
        return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H }
      }
      const move = (ev: PointerEvent): void => {
        const p = toLocal(ev)
        const next = points.map((q) => ({ ...q }))
        const last = next.length - 1
        if (i > 0 && i < last) {
          const lo = next[i - 1].x + 0.02
          const hi = next[i + 1].x - 0.02
          next[i].x = Math.min(hi, Math.max(lo, (p.x - PAD) / (W - 2 * PAD)))
        }
        next[i].y = Math.round(vOf(p.y) * 100) / 100
        commit(next, session)
      }
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

  /** Thêm điểm tại đầu phát (hoặc giữa clip nếu đầu phát ở ngoài), giữ nguyên hình dạng đường cong. */
  const addPoint = (): void => {
    const x = playX ?? 0.5
    if (points.some((p) => Math.abs(p.x - x) < 0.03)) return
    const next = [...points, { x, y: Math.round(speedAtPoint(points, x) * 100) / 100 }].sort((a, b) => a.x - b.x)
    setSelected(next.findIndex((p) => p.x === x))
    commit(next)
  }
  const removePoint = (): void => {
    if (selected === null || selected === 0 || selected === points.length - 1) return
    commit(points.filter((_, i) => i !== selected))
    setSelected(null)
  }
  const canRemove = selected !== null && selected > 0 && selected < points.length - 1

  return (
    <div className="curve-editor">
      <div className="curve-head">
        <span className="with-help">
          {t('speedCurve.duration')}
          <HelpTip text={t('speedCurve.hint')} />
        </span>
        <span className="curve-duration">
          <s>{seconds(span)}</s> → <b>{seconds(clip.duration)}</b>
        </span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="curve-svg" onPointerDown={() => setSelected(null)}>
        {[MAX_CURVE_SPEED, 1, MIN_CURVE_SPEED].map((v) => (
          <g key={v}>
            <line x1={0} x2={W} y1={yOf(v)} y2={yOf(v)} className={v === 1 ? 'curve-axis' : 'curve-grid-line'} />
            <text x={4} y={yOf(v) + (v === MAX_CURVE_SPEED ? 11 : -3)} className="curve-label">
              {v}x
            </text>
          </g>
        ))}
        <path d={path} className="curve-line" />
        {playX !== null && <line x1={xOf(playX)} x2={xOf(playX)} y1={0} y2={H} className="curve-playhead" />}
        {points.map((p, i) => (
          <g key={i} className={`curve-point ${selected === i ? 'selected' : ''}`} onPointerDown={startDrag(i)}>
            <circle cx={xOf(p.x)} cy={yOf(p.y)} r={9} className="curve-hit" />
            <circle cx={xOf(p.x)} cy={yOf(p.y)} r={5} />
            <title>{`${p.y}×`}</title>
          </g>
        ))}
      </svg>
      <div className="curve-actions">
        <span className="hint">{selected !== null ? `${points[selected]?.y ?? ''}×` : ''}</span>
        <button
          disabled={disabled}
          onClick={() => setClipSpeedCurve(clip.id, presetCurve(shown.preset === 'custom' ? curve.preset : shown.preset))}
        >
          {t('speedCurve.reset')}
        </button>
        <button className="icon" disabled={disabled} title={t('speedCurve.addPoint')} onClick={addPoint}>
          <Icon name="plus" size={14} />
        </button>
        <button className="icon" disabled={disabled || !canRemove} title={t('speedCurve.removePoint')} onClick={removePoint}>
          −
        </button>
      </div>
    </div>
  )
}
