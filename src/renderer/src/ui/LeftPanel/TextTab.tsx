// Tab Văn bản: các mẫu chữ có sẵn (bấm vào mẫu → thêm chữ tại đầu phát) và Phụ đề tự động.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextAnimation, TextStyle } from '@shared/project/schema'
import { addTextAtPlayhead } from '../../state/textActions'
import { Icon } from '../icons'
import { CaptionPanel } from './CaptionPanel'

interface TextPreset {
  id: string
  style: Partial<TextStyle>
  animationIn?: TextAnimation
}

/** Mẫu chữ. Thêm mẫu mới: thêm 1 mục ở đây + tên trong file ngôn ngữ (textPresets.<id>). */
const PRESETS: TextPreset[] = [
  { id: 'default', style: {} },
  { id: 'title', style: { fontSize: 140, strokeWidth: 0, strokeColor: null }, animationIn: 'zoom' },
  {
    id: 'subtitle',
    style: { fontSize: 56, bold: false, strokeColor: null, strokeWidth: 0, backgroundColor: '#000000' },
    animationIn: 'none'
  },
  { id: 'yellow', style: { color: '#ffd400', strokeColor: '#000000', strokeWidth: 6 } },
  { id: 'red', style: { color: '#ff3b3b', strokeColor: '#ffffff', strokeWidth: 5 } },
  { id: 'boxed', style: { color: '#111111', strokeColor: null, strokeWidth: 0, backgroundColor: '#ffffff' } },
  {
    id: 'elegant',
    style: { fontFamily: 'Times New Roman', bold: false, italic: true, strokeColor: null, strokeWidth: 0 },
    animationIn: 'fade'
  },
  { id: 'neon', style: { color: '#ffffff', strokeColor: '#22c3e6', strokeWidth: 6 }, animationIn: 'typewriter' }
]

/** Mô phỏng kiểu chữ bằng CSS cho ô xem trước (chữ thật do drawText vẽ trên preview). */
function previewCss(style: Partial<TextStyle>): React.CSSProperties {
  const stroke = style.strokeColor !== null && (style.strokeWidth ?? 4) > 0 ? (style.strokeColor ?? '#000000') : null
  return {
    fontFamily: `"${style.fontFamily ?? 'Segoe UI'}", sans-serif`,
    fontWeight: style.bold === false ? 400 : 700,
    fontStyle: style.italic ? 'italic' : 'normal',
    color: style.color ?? '#ffffff',
    background: style.backgroundColor ?? 'transparent',
    padding: style.backgroundColor ? '0 6px' : 0,
    borderRadius: 3,
    WebkitTextStroke: stroke ? `1px ${stroke}` : undefined,
    paintOrder: 'stroke fill'
  }
}

export function TextTab(): React.JSX.Element {
  const { t } = useTranslation()
  const [sub, setSub] = useState<'presets' | 'captions'>('presets')
  return (
    <div className="left-scroll">
      <div className="segmented text-sub">
        <button className={sub === 'presets' ? 'active' : ''} onClick={() => setSub('presets')}>
          {t('textPresets.heading')}
        </button>
        <button className={sub === 'captions' ? 'active' : ''} onClick={() => setSub('captions')}>
          {t('captions.title')}
        </button>
      </div>
      {sub === 'captions' ? <CaptionPanel /> : <PresetGrid />}
    </div>
  )
}

function PresetGrid(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className="preset-tile"
            onClick={() => addTextAtPlayhead(t('text.default'), p)}
            title={t('textPresets.addHint')}
          >
            <span className="preset-sample">
              <span style={previewCss(p.style)}>{t('textPresets.sample')}</span>
            </span>
            <span className="preset-name">{t(`textPresets.${p.id}`)}</span>
            <span className="tile-add">
              <Icon name="plus" size={14} />
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
