// Nhãn của file âm thanh đã xử lý trong thư viện, vd. "Bài hát (giọng Robot · giảm ồn)".
import type { TFunction } from 'i18next'
import type { AudioFxSettings } from '@shared/render/voices'

export function audioFxFileLabel(t: TFunction): (s: AudioFxSettings) => string {
  return (s) =>
    [
      s.voice ? t('voices.fileLabel', { name: t(`voices.names.${s.voice}`) }) : '',
      s.denoise ? t('audioTools.denoiseShort') : '',
      s.enhance ? t('audioTools.enhanceShort') : ''
    ]
      .filter(Boolean)
      .join(' · ')
}
