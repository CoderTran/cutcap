// Mục "Màu sắc" của clip video/ảnh: bộ lọc có sẵn (kèm ô xem trước), cường độ, chỉnh sáng/tương phản/bão hòa.
// Ô xem trước dùng đúng chuỗi bộ lọc CSS mà preview dùng → nhìn sao, xuất ra vậy.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaAsset, MediaClip } from '@shared/project/schema'
import { FILTER_PRESETS, clipCssFilter } from '@shared/render/filters'
import { copyColorToAll, setClipColor } from '../../state/clipActions'
import { editorStore } from '../../state/editorStore'
import { useMediaPreview } from '../../state/mediaStore'
import { SliderField } from './SliderField'

const ADJUSTS = ['brightness', 'contrast', 'saturation'] as const

export function ColorSection({ clip, asset, disabled }: { clip: MediaClip; asset: MediaAsset; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const thumb = useMediaPreview(asset.path)?.thumbnailUrl
  const [notice, setNotice] = useState<string | null>(null)
  const filters: (string | null)[] = [null, ...FILTER_PRESETS.map((f) => f.id)]
  const untouched = clip.filter === null && ADJUSTS.every((k) => clip.adjust[k] === 0)

  // Rê chuột lên bộ lọc → preview tạm áp (không đổi dự án, không có bước Undo)
  const hover = (filter: string | null): void => editorStore.getState().setFilterPreview({ clipId: clip.id, filter })
  const unhover = (): void => editorStore.getState().setFilterPreview(null)
  // Đóng panel (chọn clip khác) khi đang rê chuột trên bộ lọc → bỏ xem thử
  useEffect(() => () => editorStore.getState().setFilterPreview(null), [])

  return (
    <section className="inspector-section">
      <h4>{t('color.title')}</h4>
      <span className="hint">{t('color.filters')}</span>
      <div className="filter-grid" onMouseLeave={unhover}>
        {filters.map((id) => (
          <button
            key={id ?? 'none'}
            className={`filter-tile ${clip.filter === id ? 'active' : ''}`}
            disabled={disabled}
            onMouseEnter={() => hover(id)}
            onClick={() => setClipColor(clip.id, { filter: id, filterIntensity: 1 })}
            title={t('color.hoverHint')}
          >
            {thumb ? (
              <img className="filter-thumb" src={thumb} alt="" draggable={false} style={{ filter: clipCssFilter({ ...clip, filter: id, filterIntensity: 1 }) }} />
            ) : (
              <span className="filter-thumb" />
            )}
            <span>{t(`filters.${id ?? 'none'}`)}</span>
          </button>
        ))}
      </div>

      {clip.filter && (
        <SliderField
          label={t('color.intensity')}
          display={`${Math.round(clip.filterIntensity * 100)}%`}
          value={clip.filterIntensity * 100}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          onChange={(v, s) => setClipColor(clip.id, { filterIntensity: v / 100 }, s)}
          onReset={() => setClipColor(clip.id, { filterIntensity: 1 })}
        />
      )}

      <span className="hint">{t('color.adjust')}</span>
      {ADJUSTS.map((key) => (
        <SliderField
          key={key}
          label={t(`color.${key}`)}
          display={`${clip.adjust[key] > 0 ? '+' : ''}${clip.adjust[key]}`}
          value={clip.adjust[key]}
          min={-100}
          max={100}
          step={1}
          disabled={disabled}
          onChange={(v, s) => setClipColor(clip.id, { adjust: { [key]: v } }, s)}
          onReset={() => setClipColor(clip.id, { adjust: { [key]: 0 } })}
        />
      ))}

      <div className="row">
        <button
          disabled={disabled || untouched}
          onClick={() => setClipColor(clip.id, { filter: null, filterIntensity: 1, adjust: { brightness: 0, contrast: 0, saturation: 0 } })}
        >
          {t('color.reset')}
        </button>
        <button
          disabled={disabled}
          onClick={() => {
            const count = copyColorToAll(clip.id)
            setNotice(t('color.appliedAll', { count }))
            setTimeout(() => setNotice(null), 2500)
          }}
        >
          {t('color.applyAll')}
        </button>
      </div>
      {notice && <p className="hint">✔ {notice}</p>}
    </section>
  )
}
