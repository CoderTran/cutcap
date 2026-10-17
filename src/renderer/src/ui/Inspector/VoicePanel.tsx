// Âm thanh → "Trình thay đổi giọng nói" (giống CapCut): lưới các giọng, ô đầu là "Bản gốc".
// Bấm một giọng → FFmpeg xử lý (vài giây) → clip dùng giọng mới và phát thử 3 giây.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaAsset, MediaClip } from '@shared/project/schema'
import { VOICES } from '@shared/render/voices'
import { useMediaStore } from '../../state/mediaStore'
import { setAudioFx } from '../../state/voiceActions'
import { HelpTip } from '../HelpTip'
import { Icon } from '../icons'
import { audioFxFileLabel } from './audioFxLabel'

export function VoicePanel({ clip, asset, disabled }: { clip: MediaClip; asset: MediaAsset; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const busy = useMediaStore((s) => s.importing)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = clip.audioFx?.voice ?? null
  const name = (id: string): string => t(`voices.names.${id}`)
  const muted = asset.kind === 'video' && clip.volume === 0

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi')
    return VOICES.filter((v) => !q || name(v.id).toLocaleLowerCase('vi').includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, t])

  const pick = async (id: string | null): Promise<void> => {
    if (id === current) return
    setError(null)
    setPending(id ?? 'original')
    try {
      const code = await setAudioFx(clip.id, { voice: id }, { file: audioFxFileLabel(t), audioSuffix: t('extractAudio.suffix') })
      if (code) setError(code)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="form voice-panel">
      <div className="search-row">
        <label className="search-box">
          <Icon name="search" size={14} />
          <input type="search" placeholder={t('voices.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <HelpTip text={t('voices.hint')} />
      </div>
      {muted && <p className="hint">{t('voices.muted')}</p>}
      {error && <div className="notice error">{t(`vocals.errors.${error}`, { defaultValue: t('vocals.errors.failed') })}</div>}
      <div className="voice-grid">
        <button
          className={`voice-tile ${current === null ? 'active' : ''}`}
          disabled={disabled || busy || muted}
          onClick={() => void pick(null)}
        >
          {pending === 'original' ? t('extractAudio.working') : t('voices.original')}
        </button>
        {visible.map((v) => (
          <button
            key={v.id}
            className={`voice-tile ${current === v.id ? 'active' : ''} ${pending === v.id ? 'working' : ''}`}
            disabled={disabled || busy || muted}
            title={t('voices.pickHint')}
            onClick={() => void pick(v.id)}
          >
            {pending === v.id ? t('extractAudio.working') : name(v.id)}
          </button>
        ))}
      </div>
    </div>
  )
}
