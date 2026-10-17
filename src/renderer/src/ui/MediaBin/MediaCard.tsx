// Một thẻ media trong thư viện: thumbnail, thời lượng, trạng thái proxy, nút xóa.
import { useTranslation } from 'react-i18next'
import { isAssetUsed } from '@shared/project/ops'
import type { MediaAsset } from '@shared/project/schema'
import { formatDuration } from '@shared/project/time'
import { editorStore } from '../../state/editorStore'
import { relinkAsset, removeAsset } from '../../state/mediaActions'
import { useMediaPreview } from '../../state/mediaStore'
import { useProjectStore } from '../../state/projectStore'

/** Kiểu dữ liệu kéo thả nội bộ – Bước 3 timeline sẽ nhận kiểu này khi thả thẻ vào track. */
export const ASSET_DRAG_TYPE = 'application/x-cutcap-asset'

const KIND_ICON: Record<MediaAsset['kind'], string> = { video: '🎬', image: '🖼', audio: '🎵' }

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
      className={`media-card ${missing || failed ? 'broken' : ''}`}
      title={details}
      draggable={!missing}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id)
        e.dataTransfer.effectAllowed = 'copy'
        editorStore.getState().setDraggingAsset(asset.id)
      }}
      onDragEnd={() => editorStore.getState().setDraggingAsset(null)}
    >
      <div className="media-thumb">
        {preview?.thumbnailUrl ? (
          <img src={preview.thumbnailUrl} alt="" draggable={false} />
        ) : (
          <span className="media-thumb-icon">{KIND_ICON[asset.kind]}</span>
        )}

        {asset.kind !== 'image' && !proxyBusy && <span className="badge duration">{formatDuration(asset.durationUs)}</span>}

        {missing && (
          <div className="media-state">
            <span>{t('media.missing')}</span>
            <button className="small" onClick={() => void relinkAsset(asset.id)}>
              🔍 {t('media.relink')}
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

        <button
          className="icon media-remove"
          disabled={used}
          title={used ? t('media.inUse') : t('media.remove')}
          onClick={(e) => {
            e.stopPropagation()
            removeAsset(asset.id)
          }}
        >
          ✕
        </button>
      </div>
      <div className="media-name">{asset.name}</div>
    </div>
  )
}
