// Thanh trượt có nhãn + giá trị, dùng cho các thuộc tính clip.
// Mỗi lần nhấn chuột → kéo → thả là một "phiên" (session): mọi thay đổi trong phiên gộp thành 1 bước Undo.
import { useRef, type ReactNode } from 'react'
import { HelpTip } from '../HelpTip'

interface Props {
  label: string
  /** Giá trị hiển thị bên phải nhãn, ví dụ "150%". */
  display: string
  /** Giá trị của thanh trượt (theo thang của thanh trượt, không nhất thiết là giá trị thật). */
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  /** Gọi liên tục khi kéo. `session` dùng để gộp Undo. */
  onChange: (value: number, session: string) => void
  /** Bấm đúp để về giá trị mặc định. */
  onReset?: () => void
  /** Phần thêm ở cuối dòng tiêu đề, vd. nút keyframe ‹ ◇ ›. */
  extra?: ReactNode
  /** Hướng dẫn: hiện dấu "?" cạnh nhãn, rê chuột mới hiện. */
  help?: string
  /** Nền thanh trượt (CSS background), vd. dải màu xanh → vàng của Nhiệt độ màu. */
  track?: string
}

export function SliderField({ label, display, value, min, max, step, disabled, onChange, onReset, extra, help, track }: Props): React.JSX.Element {
  const session = useRef('')
  const newSession = (): void => {
    session.current = `${label}:${performance.now()}`
  }

  return (
    <label className="field slider-field" onDoubleClick={onReset}>
      <span className="slider-head">
        <span className="with-help">
          {label}
          {help && <HelpTip text={help} />}
        </span>
        <b>{display}</b>
        {extra}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        className={track ? 'track-gradient' : undefined}
        style={track ? ({ '--track': track } as React.CSSProperties) : undefined}
        onPointerDown={newSession}
        // Kéo chuột xong thì bỏ focus: phím tắt (Space, Ctrl+Z, mũi tên…) quay về timeline
        onPointerUp={(e) => e.currentTarget.blur()}
        // Dùng phím mũi tên trên thanh trượt: mỗi lần nhấn là 1 phiên riêng
        onKeyDown={newSession}
        onChange={(e) => onChange(Number(e.target.value), session.current || `${label}:${performance.now()}`)}
      />
    </label>
  )
}
