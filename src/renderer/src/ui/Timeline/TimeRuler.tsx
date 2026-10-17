// Thước thời gian phía trên timeline. Bấm hoặc kéo trên thước để di chuyển đầu phát.
// Chỉ vẽ các vạch trong vùng đang nhìn thấy, nên video dài vài giờ vẫn nhẹ.
import type { PointerEvent } from 'react'
import { MICROS_PER_SECOND } from '@shared/project/time'
import { chooseTickStep, formatRulerLabel, pxToTime, timeToPx } from '@shared/timeline/ruler'
import { editorStore, useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'

/** Phần "đầu" tam giác của đầu phát – component riêng để khi phát chỉ nó vẽ lại, không phải cả thước. */
function RulerHead({ pxPerSecond }: { pxPerSecond: number }): React.JSX.Element {
  const currentTime = useEditorStore((s) => s.currentTime)
  return <div className="tl-ruler-head" style={{ left: timeToPx(currentTime, pxPerSecond) }} />
}

interface Props {
  /** Bề rộng vùng thước (pixel). */
  width: number
  /** Vùng đang nhìn thấy, tính theo pixel trên thước. */
  visibleFrom: number
  visibleTo: number
}

export function TimeRuler({ width, visibleFrom, visibleTo }: Props): React.JSX.Element {
  const pps = useEditorStore((s) => s.pxPerSecond)
  const fps = useProjectStore((s) => s.project.settings.fps)
  const { major, subdivisions } = chooseTickStep(pps, fps)
  const minorSec = major / subdivisions

  // Các vạch trong vùng nhìn thấy (thêm 1 vạch mỗi bên để không hụt ở mép)
  const firstIndex = Math.max(0, Math.floor(visibleFrom / pps / minorSec) - 1)
  const lastIndex = Math.ceil(visibleTo / pps / minorSec) + 1
  const ticks: React.JSX.Element[] = []
  for (let i = firstIndex; i <= lastIndex; i++) {
    const seconds = i * minorSec
    const x = seconds * pps
    if (x > width) break
    const isMajor = i % subdivisions === 0
    ticks.push(
      <div key={i} className={`tick ${isMajor ? 'major' : ''}`} style={{ left: x }}>
        {isMajor && <span>{formatRulerLabel(seconds)}</span>}
      </div>
    )
  }

  // Bấm/kéo để tua: "pointer capture" giúp vẫn nhận sự kiện khi chuột ra khỏi thước
  const seek = (e: PointerEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const time = pxToTime(Math.max(0, e.clientX - rect.left), pps)
    // Khi chưa zoom tới mức frame, làm tròn tới frame gần nhất cho gọn
    const frame = MICROS_PER_SECOND / fps
    editorStore.getState().setCurrentTime(Math.round(time / frame) * frame)
  }

  return (
    <div
      className="tl-ruler"
      style={{ width }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seek(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e)
      }}
    >
      {ticks}
      <RulerHead pxPerSecond={pps} />
    </div>
  )
}
