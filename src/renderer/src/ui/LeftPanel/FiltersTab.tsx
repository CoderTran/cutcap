// Tab Bộ lọc: lưới bộ lọc có ô xem trước (dùng ảnh của clip đang chọn).
// Rê chuột → xem thử trên khung Xem trước; bấm → áp cho các clip video/ảnh đang chọn.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaClip } from '@shared/project/schema'
import { FILTER_PRESETS, clipCssFilter } from '@shared/render/filters'
import { findClip } from '@shared/timeline/clips'
import { setClipColor } from '../../state/clipActions'
import { editorStore, useEditorStore } from '../../state/editorStore'
import { useMediaPreview } from '../../state/mediaStore'
import { useProjectStore } from '../../state/projectStore'
import { useFavorites } from '../../state/favoritesStore'
import { FavoriteFilter, FavoriteStar } from '../Favorites'
import { Icon } from '../icons'
import { SliderField } from '../Inspector/SliderField'

export function FiltersTab(): React.JSX.Element {
  const { t } = useTranslation()
  const selected = useEditorStore((s) => s.selectedClipIds)
  const project = useProjectStore((s) => s.project)
  // Các clip video/ảnh đang chọn (bỏ qua chữ, âm thanh, track khóa)
  const targets = selected
    .map((id) => findClip(project, id))
    .filter((f) => f && !f.track.locked && f.clip.type === 'media' && project.assets[f.clip.assetId]?.kind !== 'audio')
    .map((f) => f!.clip as MediaClip)
  const first = targets[0]
  const thumb = useMediaPreview(first ? project.assets[first.assetId].path : '')?.thumbnailUrl

  // Rời tab → bỏ xem thử
  useEffect(() => () => editorStore.getState().setFilterPreview(null), [])

  const favs = useFavorites('filter')
  const [onlyFavs, setOnlyFavs] = useState(false)
  const all = FILTER_PRESETS.map((f) => f.id)
  const filters: (string | null)[] = onlyFavs ? favs.filter((id) => all.includes(id)) : [null, ...all]
  return (
    <div className="left-scroll" onMouseLeave={() => editorStore.getState().setFilterPreview(null)}>
      <h4 className="left-heading">{t('filtersTab.heading')}</h4>
      <FavoriteFilter only={onlyFavs} count={favs.length} onChange={setOnlyFavs} />
      {!first && <p className="hint">{t('filtersTab.selectHint')}</p>}
      {onlyFavs && filters.length === 0 && <p className="hint">{t('favorites.empty')}</p>}
      <div className="preset-grid">
        {filters.map((id) => (
          <button
            key={id ?? 'none'}
            className={`preset-tile ${first && first.filter === id ? 'active' : ''}`}
            // Không dùng disabled: nút bị khóa thì ★ bên trong cũng không bấm được
            aria-disabled={!first}
            onMouseEnter={() => first && editorStore.getState().setFilterPreview({ clipId: first.id, filter: id })}
            onClick={() => targets.forEach((c) => setClipColor(c.id, { filter: id, filterIntensity: 1 }))}
          >
            {thumb && first ? (
              <img
                className="preset-thumb"
                src={thumb}
                alt=""
                draggable={false}
                style={{ filter: clipCssFilter({ ...first, filter: id, filterIntensity: 1 }) }}
              />
            ) : (
              <span className="preset-thumb placeholder" />
            )}
            <span className="preset-name">{t(`filters.${id ?? 'none'}`)}</span>
            {id && <FavoriteStar kind="filter" id={id} />}
            {first && (
              <span className="tile-add">
                <Icon name="plus" size={14} />
              </span>
            )}
          </button>
        ))}
      </div>
      {first?.filter && (
        <SliderField
          label={t('color.intensity')}
          display={`${Math.round(first.filterIntensity * 100)}%`}
          value={first.filterIntensity * 100}
          min={0}
          max={100}
          step={1}
          onChange={(v, s) => targets.forEach((c) => setClipColor(c.id, { filterIntensity: v / 100 }, s))}
          onReset={() => targets.forEach((c) => setClipColor(c.id, { filterIntensity: 1 }))}
        />
      )}
    </div>
  )
}
