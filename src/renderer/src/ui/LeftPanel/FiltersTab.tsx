// Tab Bộ lọc: lưới bộ lọc có ô xem trước (dùng ảnh của clip đang chọn).
// Rê chuột → xem thử trên khung Xem trước; bấm → áp cho các clip video/ảnh đang chọn.
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaClip } from '@shared/project/schema'
import { FILTER_PRESETS, clipCssFilter } from '@shared/render/filters'
import { findClip } from '@shared/timeline/clips'
import { setClipColor } from '../../state/clipActions'
import { editorStore, useEditorStore } from '../../state/editorStore'
import { useMediaPreview } from '../../state/mediaStore'
import { useProjectStore } from '../../state/projectStore'
import { Icon } from '../icons'

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

  const filters: (string | null)[] = [null, ...FILTER_PRESETS.map((f) => f.id)]
  return (
    <div className="left-scroll" onMouseLeave={() => editorStore.getState().setFilterPreview(null)}>
      <h4 className="left-heading">{t('filtersTab.heading')}</h4>
      {!first && <p className="hint">{t('filtersTab.selectHint')}</p>}
      <div className="preset-grid">
        {filters.map((id) => (
          <button
            key={id ?? 'none'}
            className={`preset-tile ${first && first.filter === id ? 'active' : ''}`}
            disabled={!first}
            onMouseEnter={() => first && editorStore.getState().setFilterPreview({ clipId: first.id, filter: id })}
            onClick={() => targets.forEach((c) => setClipColor(c.id, { filter: id, filterIntensity: 1 }))}
          >
            {thumb && first ? (
              <img className="preset-thumb" src={thumb} alt="" draggable={false} style={{ filter: clipCssFilter({ ...first, filter: id, filterIntensity: 1 }) }} />
            ) : (
              <span className="preset-thumb placeholder" />
            )}
            <span className="preset-name">{t(`filters.${id ?? 'none'}`)}</span>
            {first && (
              <span className="tile-add">
                <Icon name="plus" size={14} />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
