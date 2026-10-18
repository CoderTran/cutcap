// Điều chỉnh → Đường cong (giống CapCut): Độ sáng, Red, Green, Blue.
// Bấm vào chỗ trống để thêm điểm, kéo điểm để chỉnh, bấm đúp vào điểm để xóa (2 đầu chỉ kéo lên/xuống).
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaClip } from '@shared/project/schema'
import { CURVE_CHANNELS, curveTable, emptyGrade, type CurveChannel, type CurvePoint } from '@shared/render/grade'
import { updateGrade } from '../../state/gradeActions'
import { HelpTip } from '../HelpTip'
import { Icon } from '../icons'

const SIZE = 240
const COLORS: Record<CurveChannel, string> = { luma: '#ffffff', r: '#ff3b3b', g: '#33dd55', b: '#3b6bff' }
const isStraight = (pts: CurvePoint[]): boolean => pts.every((p) => Math.abs(p.x - p.y) < 1e-6)

export function GradeCurves({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const curves = (clip.grade ?? emptyGrade()).curves
  const changed = CURVE_CHANNELS.some((c) => !isStraight(curves[c]))
  return (
    <section className="inspector-section">
      <div className="row">
        <h4 className="with-help">
          {t('grade.curvesAll')}
          <HelpTip text={t('grade.curvesHint')} />
        </h4>
        <button
          className="icon ghost"
          disabled={disabled || !changed}
          title={t('grade.reset')}
          onClick={() => updateGrade(clip.id, (d) => void (d.curves = emptyGrade().curves))}
        >
          <Icon name="undo" size={14} />
        </button>
      </div>
      {CURVE_CHANNELS.map((ch) => (
        <CurveBox key={ch} clip={clip} channel={ch} points={curves[ch]} disabled={disabled} />
      ))}
    </section>
  )
}

function CurveBox({
  clip,
  channel,
  points,
  disabled
}: {
  clip: MediaClip
  channel: CurveChannel
  points: CurvePoint[]
  disabled: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const color = COLORS[channel]
  const table = curveTable(points)
  const path = Array.from({ length: 65 }, (_, i) => {
    const x = i / 64
    return `${i ? 'L' : 'M'}${(x * SIZE).toFixed(1)},${((1 - table[Math.round(x * 255)]) * SIZE).toFixed(1)}`
  }).join('')

  const toPoint = (ev: { clientX: number; clientY: number }): CurvePoint => {
    const r = svgRef.current!.getBoundingClientRect()
    const clamp = (v: number): number => Math.min(1, Math.max(0, v))
    return { x: clamp((ev.clientX - r.left) / r.width), y: clamp(1 - (ev.clientY - r.top) / r.height) }
  }
  const commit = (next: CurvePoint[], session?: string): void =>
    updateGrade(clip.id, (d) => void (d.curves[channel] = next.map((p) => ({ x: round(p.x), y: round(p.y) }))), session)

  /** Kéo điểm i (2 đầu chỉ kéo dọc; điểm giữa không vượt điểm kề). */
  const drag = (i: number, start: CurvePoint[], session: string) => {
    const move = (ev: PointerEvent): void => {
      const p = toPoint(ev)
      const next = start.map((q) => ({ ...q }))
      const last = next.length - 1
      if (i > 0 && i < last) next[i].x = Math.min(next[i + 1].x - 0.02, Math.max(next[i - 1].x + 0.02, p.x))
      next[i].y = p.y
      commit(next, session)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Bấm chỗ trống: thêm điểm trên đường cong tại đó rồi kéo luôn. */
  const onBackground = (e: React.PointerEvent): void => {
    if (disabled || e.button !== 0) return
    const p = toPoint(e)
    if (points.some((q) => Math.abs(q.x - p.x) < 0.03)) return
    const next = [...points, { x: p.x, y: table[Math.round(p.x * 255)] }].sort((a, b) => a.x - b.x)
    const session = `curve:${performance.now()}`
    commit(next, session)
    drag(
      next.findIndex((q) => q.x === p.x),
      next,
      session
    )
  }

  return (
    <div className="grade-curve">
      <div className="row">
        <span className="grade-curve-title">
          <i style={{ background: color }} />
          {t(`grade.curves.${channel}`)}
        </span>
        <button
          className="icon ghost"
          disabled={disabled || isStraight(points)}
          title={t('grade.reset')}
          onClick={() =>
            commit([
              { x: 0, y: 0 },
              { x: 1, y: 1 }
            ])
          }
        >
          <Icon name="undo" size={13} />
        </button>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${SIZE} ${SIZE}`} className="grade-curve-svg" onPointerDown={onBackground}>
        {[0.25, 0.5, 0.75].map((v) => (
          <g key={v}>
            <line x1={v * SIZE} x2={v * SIZE} y1={0} y2={SIZE} className="grade-grid" />
            <line y1={v * SIZE} y2={v * SIZE} x1={0} x2={SIZE} className="grade-grid" />
          </g>
        ))}
        <path d={path} style={{ stroke: color }} className="grade-curve-line" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x * SIZE}
            cy={(1 - p.y) * SIZE}
            r={5}
            className="grade-curve-point"
            style={{ stroke: color }}
            onPointerDown={(e) => {
              if (disabled) return
              e.stopPropagation()
              drag(i, points, `curve:${performance.now()}`)
            }}
            onDoubleClick={() => {
              if (disabled || i === 0 || i === points.length - 1) return
              commit(points.filter((_, k) => k !== i))
            }}
          />
        ))}
      </svg>
    </div>
  )
}

const round = (v: number): number => Math.round(v * 1000) / 1000
