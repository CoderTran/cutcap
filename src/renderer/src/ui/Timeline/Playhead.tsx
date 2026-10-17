// Vạch đầu phát trên timeline. Tách thành component riêng: khi đang phát, đầu phát đổi
// vị trí 60 lần/giây – chỉ component nhỏ này vẽ lại, không phải cả timeline.
import { timeToPx } from '@shared/timeline/ruler'
import { useEditorStore } from '../../state/editorStore'
import { HEADER_WIDTH } from './layout'

export function Playhead(): React.JSX.Element {
  const currentTime = useEditorStore((s) => s.currentTime)
  const pps = useEditorStore((s) => s.pxPerSecond)
  // (phần "đầu" tam giác nằm trong thước – xem TimeRuler)
  return <div className="tl-playhead" style={{ left: HEADER_WIDTH + timeToPx(currentTime, pps) }} />
}
