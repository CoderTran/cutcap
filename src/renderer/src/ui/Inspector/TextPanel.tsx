// Panel chỉnh clip chữ: nội dung, font, cỡ, màu, kiểu, viền, nền, hiệu ứng xuất hiện, biến đổi.
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextClip, TextStyle, Track } from '@shared/project/schema'
import { setText, setTextStyle } from '../../state/textActions'
import { ColorField, newSession, useSystemFonts } from './fields'
import { SliderField } from './SliderField'
import { TextAnimPanel } from './TextAnimPanel'
import { TransformSection } from './TransformSection'
import { TEXT_STYLE_PRESETS, type TextStylePreset } from '@shared/render/textFx'
import { textFxThumb } from '../textFxThumb'

/** Sự kiện: bấm đúp vào chữ trên preview → đưa con trỏ vào ô nhập nội dung. */
export const FOCUS_TEXT_EVENT = 'cutcap:focus-text'

const ALIGNS: TextStyle['align'][] = ['left', 'center', 'right']

export function TextPanel({ clip, track, section }: { clip: TextClip; track: Track; section: 'text' | 'animation' }): React.JSX.Element {
  const { t } = useTranslation()
  const fonts = useSystemFonts()
  const disabled = track.locked
  const style = clip.style
  const textSession = useRef(newSession('text'))
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const set = (changes: Partial<TextStyle>, session?: string): void => setTextStyle(clip.id, changes, session)

  useEffect(() => {
    const focus = (): void => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }
    window.addEventListener(FOCUS_TEXT_EVENT, focus)
    return () => window.removeEventListener(FOCUS_TEXT_EVENT, focus)
  }, [])

  // Font hiện tại có thể không có trong máy (dự án mở từ máy khác) → vẫn hiện trong danh sách
  const fontOptions = fonts && !fonts.includes(style.fontFamily) ? [style.fontFamily, ...fonts] : (fonts ?? [style.fontFamily])

  return (
    <div className="form">
      {disabled && <p className="hint">🔒 {t('clip.locked')}</p>}

      {section === 'text' && (
      <>
      <textarea
        ref={textareaRef}
        className="text-input"
        rows={3}
        value={clip.text}
        disabled={disabled}
        placeholder={t('text.placeholder')}
        // Mỗi lần bấm vào ô là 1 phiên: gõ cả câu chỉ là 1 bước Undo
        onFocus={() => (textSession.current = newSession('text'))}
        onChange={(e) => setText(clip.id, e.target.value, textSession.current)}
      />

      <section className="inspector-section">
        <h4>{t('text.styleTitle')}</h4>
        <label className="field">
          <span>{t('text.font')}</span>
          <select
            value={style.fontFamily}
            disabled={disabled || !fonts}
            onChange={(e) => set({ fontFamily: e.target.value })}
            style={{ fontFamily: `"${style.fontFamily}"` }}
          >
            {fontOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <SliderField
          label={t('text.size')}
          display={String(Math.round(style.fontSize))}
          value={style.fontSize}
          min={8}
          max={300}
          step={1}
          disabled={disabled}
          onChange={(v, s) => set({ fontSize: v }, s)}
          onReset={() => set({ fontSize: 80 })}
        />
        <div className="row">
          <ColorField label={t('text.color')} value={style.color} disabled={disabled} onChange={(c, s) => set({ color: c }, s)} />
          <div className="segmented small">
            <button className={style.bold ? 'active' : ''} disabled={disabled} onClick={() => set({ bold: !style.bold })} title={t('text.bold')}>
              <b>B</b>
            </button>
            <button className={style.italic ? 'active' : ''} disabled={disabled} onClick={() => set({ italic: !style.italic })} title={t('text.italic')}>
              <i>I</i>
            </button>
          </div>
          <div className="segmented small">
            {ALIGNS.map((a) => (
              <button key={a} className={style.align === a ? 'active' : ''} disabled={disabled} onClick={() => set({ align: a })} title={t(`text.align.${a}`)}>
                {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
              </button>
            ))}
          </div>
        </div>

        {/* Viền chữ */}
        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={style.strokeColor !== null && style.strokeWidth > 0}
              disabled={disabled}
              onChange={(e) => set(e.target.checked ? { strokeColor: style.strokeColor ?? '#000000', strokeWidth: Math.max(style.strokeWidth, 4) } : { strokeColor: null })}
            />
            {t('text.stroke')}
          </label>
          {style.strokeColor !== null && (
            <ColorField label="" value={style.strokeColor} disabled={disabled} onChange={(c, s) => set({ strokeColor: c }, s)} />
          )}
        </div>
        {style.strokeColor !== null && (
          <SliderField
            label={t('text.strokeWidth')}
            display={String(style.strokeWidth)}
            value={style.strokeWidth}
            min={1}
            max={20}
            step={1}
            disabled={disabled}
            onChange={(v, s) => set({ strokeWidth: v }, s)}
          />
        )}

        {/* Nền chữ */}
        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={style.backgroundColor !== null}
              disabled={disabled}
              onChange={(e) => set({ backgroundColor: e.target.checked ? '#000000' : null })}
            />
            {t('text.background')}
          </label>
          {style.backgroundColor !== null && (
            <ColorField label="" value={style.backgroundColor} disabled={disabled} onChange={(c, s) => set({ backgroundColor: c }, s)} />
          )}
        </div>
      </section>

      <TextFxSection clip={clip} disabled={disabled} />
      </>
      )}

      {section === 'animation' && <TextAnimPanel clip={clip} disabled={disabled} />}

      {section === 'text' && <TransformSection clip={clip} disabled={disabled} />}
    </div>
  )
}

/**
 * Hiệu ứng văn bản cho chữ ĐANG CHỌN (giống CapCut): bấm một ô → đổi kiểu chữ (màu, viền, phát sáng, khung…),
 * giữ nguyên nội dung, cỡ chữ, căn lề. Ô đầu tiên: bỏ hiệu ứng.
 */
function TextFxSection({ clip, disabled }: { clip: TextClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const apply = (p: TextStylePreset | null): void => {
    if (!p) return setTextStyle(clip.id, { fx: null })
    const { fontSize: _keep, align: _keepAlign, ...rest } = p.style
    setTextStyle(clip.id, { ...rest, fx: p.style.fx ?? null })
  }
  const fxPresets = TEXT_STYLE_PRESETS.filter((p) => p.category !== 'basic')
  const current = clip.style.fx ? JSON.stringify(clip.style.fx) : null
  return (
    <section className="inspector-section">
      <h4>{t('textFx.title')}</h4>
      <div className="preset-grid text-fx-grid">
        <button className={`preset-tile ${!clip.style.fx ? 'active' : ''}`} disabled={disabled} onClick={() => apply(null)} title={t('textFx.none')}>
          <span className="preset-thumb text-fx-thumb text-fx-none">{t('textFx.none')}</span>
        </button>
        {fxPresets.map((p) => (
          <button
            key={p.id}
            className={`preset-tile ${current && current === JSON.stringify(p.style.fx) ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => apply(p)}
          >
            <img className="preset-thumb text-fx-thumb" src={textFxThumb(p)} alt="" draggable={false} />
          </button>
        ))}
      </div>
    </section>
  )
}
