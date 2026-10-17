// Hiển thị một clip trên track.
//  - Bấm: chọn (giữ Ctrl/Shift để chọn nhiều)
//  - Kéo thân clip: di chuyển (cả sang track khác cùng loại)
//  - Kéo mép trái/phải: cắt bớt / kéo dài
// Logic kéo nằm ở useClipDrag; component này chỉ báo "bắt đầu kéo ở chế độ nào".
import { memo } from 'react'
import type { Clip, Id, MediaAsset, TrackKind } from '@shared/project/schema'
import { formatDuration } from '@shared/project/time'
import { effectiveFades } from '@shared/timeline/clipProps'
import { timeToPx } from '@shared/timeline/ruler'
import { useMediaPreview } from '../../state/mediaStore'
import type { DragMode } from './useClipDrag'

interface Props {
  clip: Clip
  trackKind: TrackKind
  asset: MediaAsset | undefined
  pxPerSecond: number
  selected: boolean
  /** Clip đang được kéo (vẽ mờ đi, bóng của nó hiện ở vị trí mới). */
  dragging: boolean
  locked: boolean
  onPointerDown: (e: React.PointerEvent, clipId: Id, mode: DragMode) => void
}

/** Dải thumbnail lặp lại theo chiều ngang, giống CapCut. */
function Thumbnails({ path }: { path: string }): React.JSX.Element | null {
  const preview = useMediaPreview(path)
  if (!preview?.thumbnailUrl) return null
  return <div className="tl-clip-thumbs" style={{ backgroundImage: `url("${preview.thumbnailUrl}")` }} />
}

export const ClipView = memo(function ClipView({
  clip,
  trackKind,
  asset,
  pxPerSecond,
  selected,
  dragging,
  locked,
  onPointerDown
}: Props) {
  const left = timeToPx(clip.start, pxPerSecond)
  const width = Math.max(2, timeToPx(clip.duration, pxPerSecond))
  const name = clip.type === 'text' ? clip.text : (asset?.name ?? '?')
  const media = clip.type === 'media' ? clip : null
  const fades = media && asset?.hasAudio ? effectiveFades(media) : null

  return (
    <div
      className={`tl-clip kind-${trackKind} ${selected ? 'selected' : ''} ${dragging ? 'dragging' : ''}`}
      style={{ left, width }}
      title={`${name}\n${formatDuration(clip.duration)}`}
      onPointerDown={(e) => onPointerDown(e, clip.id, 'move')}
    >
      {asset && asset.kind !== 'audio' && <Thumbnails path={asset.path} />}
      {/* Chỉ hiện nhãn khi clip đủ rộng để đọc được */}
      {width > 40 && (
        <span className="tl-clip-label">
          {name}
          {width > 140 && <em> · {formatDuration(clip.duration)}</em>}
        </span>
      )}
      {/* Hình tam giác fade: phần tối phía trên đường dốc = âm lượng đang nhỏ dần/to dần */}
      {fades && fades.fadeIn > 0 && <div className="tl-fade in" style={{ width: timeToPx(fades.fadeIn, pxPerSecond) }} />}
      {fades && fades.fadeOut > 0 && <div className="tl-fade out" style={{ width: timeToPx(fades.fadeOut, pxPerSecond) }} />}
      {media && width > 30 && (media.speed !== 1 || (media.volume === 0 && asset?.hasAudio)) && (
        <span className="tl-badges">
          {media.speed !== 1 && <span className="tl-badge">{media.speed}×</span>}
          {media.volume === 0 && asset?.hasAudio && <span className="tl-badge">🔇</span>}
        </span>
      )}
      {/* Tay nắm 2 mép để cắt – ẩn khi clip quá hẹp hoặc track bị khóa */}
      {!locked && width > 16 && (
        <>
          <div className="tl-trim start" onPointerDown={(e) => onPointerDown(e, clip.id, 'trim-start')} />
          <div className="tl-trim end" onPointerDown={(e) => onPointerDown(e, clip.id, 'trim-end')} />
        </>
      )}
    </div>
  )
})
