// Bộ biểu tượng SVG của Cutcap (tự vẽ, nét 1.6px, ô 24×24) – dùng màu chữ hiện tại (currentColor).
// Cách dùng: <Icon name="split" />  hoặc  <Icon name="play" size={20} />
import type { CSSProperties } from 'react'

const PATHS = {
  // Ứng dụng
  menu: 'M4 7h16M4 12h16M4 17h16',
  home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  export: 'M12 15V4m0 0-4 4m4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm5-2 4 4',
  check: 'm5 12 4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6 6 18',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  chevronDown: 'm6 9 6 6 6-6',
  folder: 'M4 6a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
  save: 'M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zm3 0v5h7V4M8 20v-6h8v6',
  // Bảng trái
  media: 'M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm6 3v6l5-3z',
  audio: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  text: 'M5 6V4h14v2M12 4v16m-3 0h6',
  transition: 'M4 5l7 7-7 7zm16 0-7 7 7 7z',
  filter: 'M12 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-3.5 6a5 5 0 1 0 7 7 5 5 0 0 0-7-7zm7 0a5 5 0 1 1-7 7',
  // Timeline
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'm15 14 5-5-5-5m5 5H10a6 6 0 0 0 0 12h3',
  split: 'M12 3v18M7 7l-3 5 3 5m10-10 3 5-3 5',
  splitLeft: 'M14 3v18M4 7h6v10H4z',
  splitRight: 'M10 3v18m4-14h6v10h-6z',
  trash: 'M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4zM6 8h4m4 0h4',
  zoomIn: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm5-2 4 4M8 11h6m-3-3v6',
  zoomOut: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm5-2 4 4M8 11h6',
  fit: 'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5',
  lock: 'M6 11h12v9H6zm2 0V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6zm2 0V8a4 4 0 0 1 7.5-2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.9 9.9 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  volume: 'M4 9v6h4l5 4V5L8 9zm12.5-1.5a6 6 0 0 1 0 9M19 5a9.5 9.5 0 0 1 0 14',
  mute: 'M4 9v6h4l5 4V5L8 9zm12 0 5 6m0-6-5 6',
  // Xem trước
  play: 'M7 5v14l12-7z',
  pause: 'M7 5h3v14H7zm7 0h3v14h-3z',
  fullscreen: 'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5',
  ratio: 'M4 6h16v12H4zm4 4h8',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  cut: 'M6 6a2.5 2.5 0 1 0 0 .01M6 18a2.5 2.5 0 1 0 0 .01M8 7.5 20 17M8 16.5 20 7',
  paste: 'M9 4h6v3H9zM7 5H5v15h14V5h-2',
  // khung video + nốt nhạc tách ra
  extract: 'M3 5h11v9H3zM18 9v8M18 9l3-1M18 17a2 2 0 1 1-2-2'
} as const

export type IconName = keyof typeof PATHS

/** Biểu tượng tô đặc (không chỉ nét viền). */
const FILLED = new Set<IconName>(['play', 'pause'])

export function Icon({ name, size = 18, style }: { name: IconName; size?: number; style?: CSSProperties }): React.JSX.Element {
  const filled = FILLED.has(name)
  return (
    <svg
      className="icon-svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
