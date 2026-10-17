// Dấu "?" cạnh tiêu đề: rê chuột (hoặc Tab tới) mới hiện hướng dẫn dạng popup – giao diện gọn như CapCut.
// Popup đặt theo vị trí màn hình (position: fixed) và tự canh để không tràn ra ngoài cửa sổ,
// nên không bị cắt bởi bảng có thanh cuộn.
import { useLayoutEffect, useRef, useState } from 'react'

const MARGIN = 8
const WIDTH = 260

export function HelpTip({ text }: { text: string }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current || !popRef.current) return
    const r = ref.current.getBoundingClientRect()
    const h = popRef.current.offsetHeight
    // Mặc định hiện bên dưới, căn giữa dấu "?"; sát mép thì dịch vào trong, thiếu chỗ bên dưới thì lật lên trên
    const left = Math.min(window.innerWidth - WIDTH - MARGIN, Math.max(MARGIN, r.left + r.width / 2 - WIDTH / 2))
    const below = r.bottom + 6
    const top = below + h > window.innerHeight - MARGIN ? Math.max(MARGIN, r.top - 6 - h) : below
    setPos({ left, top })
  }, [open])

  return (
    <span
      ref={ref}
      className="help-tip"
      tabIndex={0}
      role="button"
      aria-label={text}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      // Nằm trong <label> của ô chọn: bấm vào "?" không được bật/tắt ô chọn
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      ?
      {open && (
        <span ref={popRef} role="tooltip" className="help-pop" style={{ width: WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
          {text}
        </span>
      )}
    </span>
  )
}
