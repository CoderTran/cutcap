// Menu chuột phải trên clip của timeline (giống CapCut): Tách âm thanh, Tách, Sao chép, Cắt, Dán, Xóa.
// Tác động lên các clip đang chọn (chuột phải vào clip chưa chọn thì chọn clip đó trước).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../state/editorStore'
import {
  canDetachAny,
  copySelected,
  cutSelected,
  deleteSelected,
  detachAudioOf,
  paste,
  splitAtPlayhead
} from '../../state/timelineActions'
import { Icon, type IconName } from '../icons'

interface Item {
  label: string
  icon: IconName
  shortcut?: string
  disabled?: boolean
  run: () => void
}

export function ClipContextMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const selected = useEditorStore((s) => s.selectedClipIds)
  const hasClipboard = useEditorStore((s) => s.clipboard.length > 0)

  // Không để menu tràn ra ngoài cửa sổ (bấm gần mép phải / mép dưới)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({ left: Math.min(x, window.innerWidth - width - 6), top: Math.min(y, window.innerHeight - height - 6) })
  }, [x, y])

  useEffect(() => {
    const onPointer = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const items: (Item | 'divider')[] = [
    {
      label: t('clipMenu.detachAudio'),
      icon: 'extract',
      disabled: !canDetachAny(selected),
      run: () => void detachAudioOf(selected, t('extractAudio.suffix'))
    },
    'divider',
    { label: t('clipMenu.split'), icon: 'split', shortcut: 'Ctrl+B', run: splitAtPlayhead },
    { label: t('clipMenu.copy'), icon: 'copy', shortcut: 'Ctrl+C', disabled: selected.length === 0, run: copySelected },
    { label: t('clipMenu.cut'), icon: 'cut', shortcut: 'Ctrl+X', disabled: selected.length === 0, run: cutSelected },
    { label: t('clipMenu.paste'), icon: 'paste', shortcut: 'Ctrl+V', disabled: !hasClipboard, run: paste },
    'divider',
    { label: t('clipMenu.delete'), icon: 'trash', shortcut: 'Delete', disabled: selected.length === 0, run: deleteSelected }
  ]

  return (
    <div className="menu-popup context-menu" ref={ref} style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) =>
        item === 'divider' ? (
          <hr key={i} />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.run()
            }}
          >
            <span className="context-label">
              <Icon name={item.icon} size={15} /> {item.label}
            </span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        )
      )}
    </div>
  )
}
