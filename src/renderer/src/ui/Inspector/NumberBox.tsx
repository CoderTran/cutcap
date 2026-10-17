// Ô nhập số kiểu CapCut: [ 0.0dB ▲▼ ] – gõ rồi Enter / rời ô để áp dụng, hoặc bấm ▲▼ (mỗi lần 1 bước).
import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  /** Số chữ số sau dấu phẩy khi hiển thị. */
  digits: number
  unit: string
  step: number
  min: number
  max: number
  disabled?: boolean
  /** Chữ hiện khi giá trị ra ngoài thang (vd. "-∞" khi tắt tiếng). */
  emptyText?: string
  onCommit: (value: number) => void
  title?: string
}

export function NumberBox({ value, digits, unit, step, min, max, disabled, emptyText, onCommit, title }: Props): React.JSX.Element {
  const shown = Number.isFinite(value) ? value.toFixed(digits) : (emptyText ?? '')
  const [text, setText] = useState(shown)
  const [editing, setEditing] = useState(false)
  const justFocused = useRef(false)
  useEffect(() => {
    if (!editing) setText(shown)
  }, [shown, editing])

  const clamp = (v: number): number => Math.min(max, Math.max(min, v))
  const commit = (): void => {
    setEditing(false)
    const n = Number(text.replace(',', '.').replace(unit, '').trim())
    if (Number.isFinite(n)) onCommit(clamp(n))
    else setText(shown)
  }
  const nudge = (dir: 1 | -1): void => onCommit(clamp((Number.isFinite(value) ? value : min) + dir * step))

  return (
    <span className="number-box" title={title} onClick={(e) => e.preventDefault()}>
      <input
        type="text"
        inputMode="decimal"
        value={editing ? text : `${shown}${Number.isFinite(value) ? unit : ''}`}
        disabled={disabled}
        onFocus={(e) => {
          setEditing(true)
          setText(shown)
          // Bôi đen SAU khi ô vẽ lại (bỏ đơn vị "dB"/"s") – chọn ngay lúc này sẽ bị mất, số gõ vào bị chèn lên đầu
          const input = e.currentTarget
          justFocused.current = true
          setTimeout(() => input.select(), 0) // không dùng requestAnimationFrame: không chạy khi cửa sổ chưa được vẽ
        }}
        // Lần nhả chuột ngay sau khi bấm vào ô: trình duyệt sẽ đặt con trỏ và bỏ bôi đen → chặn lại
        onMouseUp={(e) => {
          if (justFocused.current) {
            e.preventDefault()
            justFocused.current = false
          }
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            nudge(e.key === 'ArrowUp' ? 1 : -1)
          }
        }}
      />
      <span className="number-spin">
        <button type="button" tabIndex={-1} disabled={disabled} onClick={() => nudge(1)} aria-label="+">
          ▴
        </button>
        <button type="button" tabIndex={-1} disabled={disabled} onClick={() => nudge(-1)} aria-label="−">
          ▾
        </button>
      </span>
    </span>
  )
}
