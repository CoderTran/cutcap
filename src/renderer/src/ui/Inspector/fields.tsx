// Các ô nhập dùng chung trong panel Thuộc tính.
import { useEffect, useRef, useState } from 'react'

/** Mã phiên mới – mọi thay đổi trong cùng phiên gộp thành 1 bước Undo. */
export const newSession = (name: string): string => `${name}:${performance.now()}`

/** Chọn màu. Mỗi lần mở bảng màu là 1 phiên (kéo chọn màu liên tục vẫn chỉ 1 bước Undo). */
export function ColorField({
  label,
  value,
  disabled,
  onChange
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (color: string, session: string) => void
}): React.JSX.Element {
  const session = useRef(newSession(label))
  return (
    <label className="color-field">
      <input
        type="color"
        value={value}
        disabled={disabled}
        onFocus={() => (session.current = newSession(label))}
        onChange={(e) => onChange(e.target.value, session.current)}
      />
      <span>{label}</span>
    </label>
  )
}

/** Danh sách font Windows – đọc 1 lần rồi dùng lại cho mọi panel. */
let fontsPromise: Promise<string[]> | null = null
export function useSystemFonts(): string[] | null {
  const [fonts, setFonts] = useState<string[] | null>(null)
  useEffect(() => {
    fontsPromise ??= window.cutcap.listFonts()
    let alive = true
    fontsPromise.then((f) => alive && setFonts(f)).catch(() => alive && setFonts([]))
    return () => {
      alive = false
    }
  }, [])
  return fonts
}
