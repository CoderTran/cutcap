// Một thẻ media kiểu CapCut: ảnh thu nhỏ, "Đã thêm" (góc trái) khi đã dùng trên timeline,
// thời lượng (góc phải), nút "+" (góc dưới phải) thêm vào timeline tại đầu phát.
// Kéo thẻ thả vào timeline cũng được. Media chưa dùng có nút ✕ để bỏ khỏi thư viện.
import { useTranslation } from 'react-i18next'
import { isAssetUsed } from '@shared/project/ops'
import type { MediaAsset } from '@shared/project/schema'
import { formatDuration } from '@shared/project/time'
import { editorStore } from '../../state/editorStore'
import { relinkAsset, removeAsset } from '../../state/mediaActions'
import { useMediaPreview } from '../../state/mediaStore'
import { useProjectStore } from '../../state/projectStore'
import { addAssetAtPlayhead } from '../../state/timelineActions'
import { Icon } from '../icons'

/** Kiểu dữ liệu kéo thả nội bộ – timeline nhận kiểu này khi thả thẻ vào track. */
export const ASSET_DRAG_TYPE = 'application/x-cutcap-asset'

export function MediaCard({ asset }: { asset: MediaAsset }): React.JSX.Element {
  const { t } = useTranslation()
  const preview = useMediaPreview(asset.path)
  const used = useProjectStore((s) => isAssetUsed(s.project, asset.id))

  const missing = preview?.status === 'missing'
  const failed = preview?.status === 'error'
  const proxyBusy = preview?.proxy === 'queued' || preview?.proxy === 'running'

  // Chú thích khi rê chuột: tên, kích thước, fps, đường dẫn
  const details = [
    asset.name,
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : null,
    asset.fps ? `${asset.fps} fps` : null,
    asset.path
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      className={`media-card ${missing || failed ? 'broken' : ''} kind-${asset.kind}`}
      title={details}
      draggable={!missing}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id)
        e.dataTransfer.effectAllowed = 'copy'
        editorStore.getState().setDraggingAsset(asset.id)
      }}
      onDragEnd={() => editorStore.getState().setDraggingAsset(null)}
      onDoubleClick={() => !missing && addAssetAtPlayhead(asset.id)}
    >
      <div className="media-thumb">
        {preview?.thumbnailUrl ? (
          <img src={preview.thumbnailUrl} alt="" draggable={false} />
        ) : (
          <span className="media-thumb-icon">
            <Icon name={asset.kind === 'audio' ? 'audio' : 'media'} size={30} />
          </span>
        )}

        {used && <span className="badge added">{t('media.added')}</span>}
        {asset.kind !== 'image' && !proxyBusy && <span className="badge duration">{formatDuration(asset.durationUs)}</span>}

        {missing && (
          <div className="media-state">
            <span>{t('media.missing')}</span>
            <button className="small" onClick={() => void relinkAsset(asset.id)}>
              <Icon name="search" size={12} /> {t('media.relink')}
            </button>
          </div>
        )}
        {failed && <div className="media-state">{t('media.error')}</div>}
        {!preview && !missing && <div className="media-state subtle">{t('media.loading')}</div>}

        {proxyBusy && (
          <div className="proxy-progress" title={t('media.proxyHint')}>
            <span>
              {preview?.proxy === 'queued'
                ? t('media.proxyQueued')
                : t('media.proxyRunning', { percent: Math.round((preview?.proxyProgress ?? 0) * 100) })}
            </span>
            <div className="bar">
              <div style={{ width: `${(preview?.proxyProgress ?? 0) * 100}%` }} />
            </div>
          </div>
        )}
        {preview?.proxy === 'error' && (
          <span className="badge warn" title={preview.error ?? ''}>
            ⚠ {t('media.proxyError')}
          </span>
        )}

        {!used && (
          <button
            className="icon media-remove"
            title={t('media.remove')}
            onClick={(e) => {
              e.stopPropagation()
              removeAsset(asset.id)
            }}
          >
            <Icon name="close" size={12} />
          </button>
        )}
        {!missing && (
          <button
            className="media-add"
            title={t('media.addToTimeline')}
            onClick={(e) => {
              e.stopPropagation()
              addAssetAtPlayhead(asset.id)
            }}
          >
            <Icon name="plus" size={14} />
          </button>
        )}
      </div>
      <div className="media-name">{asset.name}</div>
    </div>
  )
}
