// Nút "Trích xuất âm thanh" (tab Âm thanh, giống CapCut): tách tiếng của một video thành file âm thanh riêng.
// Chọn video đã có trong dự án, hoặc chọn video trên máy.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { extractAudioFrom, pickAndExtractAudio } from '../../state/mediaActions'
import { useMediaStore } from '../../state/mediaStore'
import { useProjectStore } from '../../state/projectStore'
import { Icon } from '../icons'

export function ExtractAudioButton(): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const busy = useMediaStore((s) => s.importing)
  const assets = useProjectStore((s) => s.project.assets)
  const videos = Object.values(assets)
    .filter((a) => a.kind === 'video' && a.hasAudio)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))
  const suffix = t('extractAudio.suffix')

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const run = (task: () => Promise<void>): void => {
    setOpen(false)
    void task()
  }

  return (
    <div className="extract-audio" ref={ref}>
      <button className={open ? 'active' : ''} disabled={busy} onClick={() => setOpen((o) => !o)} title={t('extractAudio.hint')}>
        <Icon name="extract" size={15} /> {busy ? t('extractAudio.working') : t('extractAudio.button')}
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="menu-popup extract-menu">
          <div className="menu-label">{t('extractAudio.fromProject')}</div>
          {videos.length === 0 && <div className="menu-empty hint">{t('extractAudio.noVideos')}</div>}
          {videos.map((v) => (
            <button key={v.id} onClick={() => run(() => extractAudioFrom([v.path], suffix))}>
              <span className="menu-item-name">{v.name}</span>
            </button>
          ))}
          <hr />
          <button onClick={() => run(() => pickAndExtractAudio(suffix))}>
            <span>{t('extractAudio.fromComputer')}</span>
            <Icon name="folder" size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
