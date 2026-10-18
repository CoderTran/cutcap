// Nút chọn chất lượng khung Xem trước (giống CapCut): Đầy đủ / Cao / Trung bình / Thấp.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PREVIEW_QUALITIES } from '@shared/ipc'
import { setPreviewQuality, usePreviewQuality } from '../../state/previewQuality'
import { Icon } from '../icons'

export function QualityMenu(): React.JSX.Element {
  const { t } = useTranslation()
  const quality = usePreviewQuality()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="quality-menu" ref={ref}>
      <button className={`quality-button ${open ? 'active' : ''}`} title={t('previewQuality.title')} onClick={() => setOpen((o) => !o)}>
        {t(`previewQuality.short.${quality}`)}
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="menu-popup quality-popup" role="menu">
          {PREVIEW_QUALITIES.map((q) => (
            <button
              key={q}
              role="menuitemradio"
              aria-checked={q === quality}
              className={q === quality ? 'checked' : ''}
              onClick={() => {
                setOpen(false)
                setPreviewQuality(q)
              }}
            >
              <span className="quality-check">{q === quality && <Icon name="check" size={14} />}</span>
              <span className="quality-text">
                <b>{t(`previewQuality.${q}.name`)}</b>
                <small>{t(`previewQuality.${q}.desc`)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
