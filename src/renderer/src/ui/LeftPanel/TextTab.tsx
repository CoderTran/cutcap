// Tab Văn bản: mẫu chữ / hiệu ứng văn bản theo nhóm (bấm 1 lần → xem thử, bấm đúp / + → thêm tại đầu phát)
// và Phụ đề tự động.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TEXT_STYLE_CATEGORIES, TEXT_STYLE_PRESETS, presetsIn, type TextStyleCategory, type TextStylePreset } from '@shared/render/textFx'
import { editorStore } from '../../state/editorStore'
import { addTextAtPlayhead, textClipFromPreset } from '../../state/textActions'
import { useFavorites } from '../../state/favoritesStore'
import { FavoriteFilter, FavoriteStar } from '../Favorites'
import { textFxThumb } from '../textFxThumb'
import { TileAdd } from '../TileAdd'
import { CaptionPanel } from './CaptionPanel'

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
  const [onlyFavs, setOnlyFavs] = useState(false)
  const [category, setCategory] = useState<TextStyleCategory | 'all'>('all')
  const [picked, setPicked] = useState<string | null>(null)
  const favs = useFavorites('text')
  // Rời danh sách mẫu → bỏ bản xem thử
  useEffect(() => () => editorStore.getState().setTilePreview(null), [])
  /** Bấm 1 lần: chọn + xem thử trên khung Xem trước (bấm lại = bỏ chọn). */
  const pick = (p: TextStylePreset): void => {
    const off = picked === p.id
    setPicked(off ? null : p.id)
    editorStore.getState().setTilePreview(off ? null : { kind: 'clip', clip: textClipFromPreset(t('text.default'), 0, p) })
  }
  const add = (p: TextStylePreset): void => {
    setPicked(null)
    addTextAtPlayhead(t('text.default'), p)
  }

  const sections: { key: string; title: string; items: TextStylePreset[] }[] = onlyFavs
    ? [
        {
          key: 'favorites',
          title: `★ ${t('favorites.title')}`,
          items: favs.map((id) => TEXT_STYLE_PRESETS.find((p) => p.id === id)).filter((p): p is TextStylePreset => !!p)
        }
      ]
    : (category === 'all' ? TEXT_STYLE_CATEGORIES : [category]).map((c) => ({ key: c, title: t(`textFx.categories.${c}`), items: presetsIn(c) }))

  return (
    <>
      <FavoriteFilter only={onlyFavs} count={favs.length} onChange={setOnlyFavs} />
      {!onlyFavs && (
        <div className="chip-row">
          {(['all', ...TEXT_STYLE_CATEGORIES] as const).map((c) => (
            <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
              {t(`textFx.categories.${c}`)}
            </button>
          ))}
        </div>
      )}
      {onlyFavs && sections[0].items.length === 0 && <p className="hint">{t('favorites.empty')}</p>}
      {sections
        .filter((sec) => sec.items.length > 0)
        .map((sec) => (
          <section key={sec.key} className="effect-group">
            <h3 className="left-heading">{sec.title}</h3>
            <div className="preset-grid text-fx-grid">
              {sec.items.map((p) => (
                <button
                  key={p.id}
                  className={`preset-tile ${picked === p.id ? 'active' : ''}`}
                  // Bấm 1 lần: chọn ô + xem thử; bấm đúp hoặc bấm + : thêm chữ (giống CapCut)
                  onClick={() => pick(p)}
                  onDoubleClick={() => add(p)}
                  title={p.category === 'basic' ? t(`textPresets.${p.id}`) : t('textPresets.addHint')}
                >
                  <img className="preset-thumb text-fx-thumb" src={textFxThumb(p)} alt="" draggable={false} />
                  <FavoriteStar kind="text" id={p.id} />
                  <TileAdd title={t('textPresets.addHint')} onAdd={() => add(p)} />
                </button>
              ))}
            </div>
          </section>
        ))}
    </>
  )
}
