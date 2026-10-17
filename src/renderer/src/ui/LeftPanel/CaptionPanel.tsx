// Tab Văn bản → Phụ đề tự động (giống CapCut): chọn ngôn ngữ nói → "Tạo" → phụ đề hiện trên timeline.
// Nhận dạng giọng nói chạy ngay trên máy (whisper.cpp), miễn phí; lần đầu tải mô hình ~190 MB.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CAPTION_LANGUAGES, type CaptionLanguage } from '@shared/captions/captions'
import { cancelCaptions, generateCaptions, useCaptionState } from '../../state/captionActions'
import { HelpTip } from '../HelpTip'

const LANGUAGE_KEY = 'cutcap.captionLanguage'

function savedLanguage(): CaptionLanguage {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY)
    if (v && (CAPTION_LANGUAGES as readonly string[]).includes(v)) return v as CaptionLanguage
  } catch {
    // bộ nhớ trình duyệt bị chặn → dùng mặc định
  }
  return 'vi'
}

export function CaptionPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const [language, setLanguage] = useState<CaptionLanguage>(savedLanguage)
  const [replace, setReplace] = useState(true)
  const running = useCaptionState((s) => s.running)
  const progress = useCaptionState((s) => s.progress)
  const last = useCaptionState((s) => s.last)

  const pickLanguage = (v: CaptionLanguage): void => {
    setLanguage(v)
    try {
      localStorage.setItem(LANGUAGE_KEY, v)
    } catch {
      // không lưu được cũng không sao
    }
  }

  const status = (): string => {
    if (!progress) return t('captions.stage.prepare')
    if (progress.stage === 'download' && progress.total) {
      const mb = (n: number): string => (n / 1024 / 1024).toFixed(0)
      return t('captions.stage.download', { received: mb(progress.received ?? 0), total: mb(progress.total) })
    }
    return t(`captions.stage.${progress.stage}`)
  }
  // Thanh tiến trình chung: tải mô hình 0–40%, chuẩn bị 40–50%, nhận dạng 50–100% (lần sau không tải: 0–20–100)
  const overall = (): number => {
    if (!progress) return 0
    const f = Math.min(1, Math.max(0, progress.fraction))
    if (progress.stage === 'download') return f * 0.4
    if (progress.stage === 'prepare') return 0.45
    if (progress.stage === 'detect') return 0.5
    return 0.5 + f * 0.5
  }

  return (
    <div className="caption-panel">
      <label className="field">
        <span className="with-help">
          {t('captions.language')}
          <HelpTip text={t('captions.hint')} />
        </span>
        <select value={language} disabled={running} onChange={(e) => pickLanguage(e.target.value as CaptionLanguage)}>
          {CAPTION_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {t(`captions.languages.${l}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="caption-spacer" />

      {running && (
        <div className="caption-progress">
          <div className="bar">
            <div style={{ width: `${Math.round(overall() * 100)}%` }} />
          </div>
          <span>{status()}</span>
        </div>
      )}
      {!running && last && (
        <p className={'error' in last ? 'hint caption-error' : 'hint'}>
          {'added' in last ? t('captions.done', { count: last.added }) : t(`captions.error.${last.error}`)}
        </p>
      )}

      <div className="caption-actions">
        <label className="check-row">
          <input type="checkbox" checked={replace} disabled={running} onChange={(e) => setReplace(e.target.checked)} />
          <span>{t('captions.replace')}</span>
        </label>
        {running ? (
          <button onClick={cancelCaptions}>{t('captions.cancel')}</button>
        ) : (
          <button className="primary" onClick={() => void generateCaptions(language, replace, t('captions.trackName'))}>
            {t('captions.create')}
          </button>
        )}
      </div>
    </div>
  )
}
