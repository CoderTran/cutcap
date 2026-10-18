// Bảng phải → Điều chỉnh (giống CapCut): Cơ bản | HSL | Đường cong | Vòng tròn màu | Mặt nạ.
// (Bộ lọc nằm ở tab Bộ lọc của bảng trái.)
// Thông số lưu ở clip.grade (shared/render/grade.ts); preview & video xuất ra dùng chung một hàm màu.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaAsset, MediaClip } from '@shared/project/schema'
import { BASIC_GROUPS, emptyGrade, HSL_COLORS, HSL_HUES, ONE_SIDED, type BasicKey, type HslColor } from '@shared/render/grade'
import { updateGrade } from '../../state/gradeActions'
import { HelpTip } from '../HelpTip'
import { Icon } from '../icons'
import { MaskPanel } from './MaskPanel'
import { ColorWheels } from './ColorWheels'
import { GradeCurves } from './GradeCurves'
import { NumberBox } from './NumberBox'
import { SliderField } from './SliderField'

type Sub = 'basic' | 'hsl' | 'curves' | 'wheels' | 'mask'
const SUBS: Sub[] = ['basic', 'hsl', 'curves', 'wheels', 'mask']

/** Nền thanh trượt (giống CapCut). */
const TRACKS: Partial<Record<BasicKey, string>> = {
  temperature: 'linear-gradient(90deg, #2f6bff, #9a9a9a, #ffd400)',
  tint: 'linear-gradient(90deg, #27c43c, #9a9a9a, #d42fd4)',
  saturation: 'linear-gradient(90deg, #8a8a8a, #ff2a2a)'
}

export function GradePanel({ clip, asset, disabled }: { clip: MediaClip; asset: MediaAsset; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const [sub, setSub] = useState<Sub>('basic')
  return (
    <>
      <div className="segmented audio-sub grade-sub">
        {SUBS.map((s) => (
          <button key={s} className={sub === s ? 'active' : ''} onClick={() => setSub(s)}>
            {t(`grade.tabs.${s}`)}
          </button>
        ))}
      </div>
      {sub === 'basic' && <BasicSection clip={clip} disabled={disabled} />}
      {sub === 'hsl' && <HslSection clip={clip} disabled={disabled} />}
      {sub === 'curves' && <GradeCurves clip={clip} disabled={disabled} />}
      {sub === 'wheels' && <ColorWheels clip={clip} disabled={disabled} />}
      {sub === 'mask' && <MaskPanel clip={clip} asset={asset} disabled={disabled} />}
    </>
  )
}

/** Một thanh của Điều chỉnh: thanh trượt + ô số (giống ảnh CapCut). */
export function GradeSlider({
  label,
  value,
  min,
  disabled,
  track,
  onChange
}: {
  label: string
  value: number
  min: number
  disabled: boolean
  track?: string
  onChange: (v: number, session?: string) => void
}): React.JSX.Element {
  return (
    <SliderField
      label={label}
      display=""
      value={value}
      min={min}
      max={100}
      step={1}
      disabled={disabled}
      track={track}
      onChange={(v, s) => onChange(v, s)}
      onReset={() => onChange(0)}
      extra={<NumberBox value={value} digits={0} unit="" step={1} min={min} max={100} disabled={disabled} onCommit={(v) => onChange(v)} />}
    />
  )
}

function BasicSection({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const g = clip.grade ?? emptyGrade()
  const changed = BASIC_GROUPS.some((gr) => gr.keys.some((k) => g.basic[k] !== 0))
  return (
    <section className="inspector-section">
      <label className="toggle-row">
        <span>
          <b>{t('grade.skinProtect')}</b>
          <small>{t('grade.skinProtectHint')}</small>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={g.skinProtect}
          disabled={disabled}
          onChange={(e) => updateGrade(clip.id, (d) => void (d.skinProtect = e.target.checked))}
        />
      </label>
      <div className="row">
        <h4 className="with-help">
          {t('grade.custom')}
          <HelpTip text={t('grade.basicHint')} />
        </h4>
        <button
          className="icon ghost"
          disabled={disabled || !changed}
          title={t('grade.reset')}
          onClick={() => updateGrade(clip.id, (d) => void (d.basic = emptyGrade().basic))}
        >
          <Icon name="undo" size={14} />
        </button>
      </div>
      {BASIC_GROUPS.map(({ group, keys }) => (
        <div key={group} className="grade-group">
          <span className="grade-group-title">{t(`grade.groups.${group}`)}</span>
          {keys.map((k) => (
            <GradeSlider
              key={k}
              label={t(`grade.basic.${k}`)}
              value={g.basic[k]}
              min={ONE_SIDED.includes(k) ? 0 : -100}
              disabled={disabled}
              track={TRACKS[k]}
              onChange={(v, s) => updateGrade(clip.id, (d) => void (d.basic[k] = Math.round(v)), s)}
            />
          ))}
        </div>
      ))}
    </section>
  )
}

const hueCss = (h: number): string => `hsl(${h} 90% 55%)`

function HslSection({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const [color, setColor] = useState<HslColor>('red')
  const g = clip.grade ?? emptyGrade()
  const a = g.hsl[color]
  const h = HSL_HUES[color]
  const changed = HSL_COLORS.some((c) => g.hsl[c].hue || g.hsl[c].sat || g.hsl[c].light)
  const set = (key: 'hue' | 'sat' | 'light') => (v: number, s?: string) =>
    updateGrade(clip.id, (d) => void (d.hsl[color][key] = Math.round(v)), s)
  return (
    <section className="inspector-section">
      <div className="row">
        <h4 className="with-help">
          {t('grade.tabs.hsl')}
          <HelpTip text={t('grade.hslHint')} />
        </h4>
        <button
          className="icon ghost"
          disabled={disabled || !changed}
          title={t('grade.reset')}
          onClick={() => updateGrade(clip.id, (d) => void (d.hsl = emptyGrade().hsl))}
        >
          <Icon name="undo" size={14} />
        </button>
      </div>
      <div className="hsl-colors">
        {HSL_COLORS.map((c) => {
          const v = g.hsl[c]
          return (
            <button
              key={c}
              className={`hsl-dot ${color === c ? 'active' : ''} ${v.hue || v.sat || v.light ? 'changed' : ''}`}
              style={{ '--dot': hueCss(HSL_HUES[c]) } as React.CSSProperties}
              title={t(`grade.hslColors.${c}`)}
              onClick={() => setColor(c)}
            />
          )
        })}
      </div>
      <GradeSlider
        label={t('grade.hsl.hue')}
        value={a.hue}
        min={-100}
        disabled={disabled}
        track={`linear-gradient(90deg, ${hueCss(h - 30)}, ${hueCss(h)}, ${hueCss(h + 30)})`}
        onChange={set('hue')}
      />
      <GradeSlider
        label={t('grade.hsl.sat')}
        value={a.sat}
        min={-100}
        disabled={disabled}
        track={`linear-gradient(90deg, #8a8a8a, ${hueCss(h)})`}
        onChange={set('sat')}
      />
      <GradeSlider
        label={t('grade.hsl.light')}
        value={a.light}
        min={-100}
        disabled={disabled}
        track={`linear-gradient(90deg, #111, ${hueCss(h)}, #fff)`}
        onChange={set('light')}
      />
    </section>
  )
}
