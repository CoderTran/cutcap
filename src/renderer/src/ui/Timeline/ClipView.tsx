// Một clip trên track, kiểu CapCut: dải trên cùng ghi tên + thời lượng, giữa là ảnh thu nhỏ lặp lại,
// dưới cùng là sóng âm (nếu clip có tiếng).
//  - Bấm: chọn (giữ Ctrl/Shift để chọn nhiều)
//  - Kéo thân clip: di chuyển (cả sang track khác cùng loại)
//  - Kéo mép trái/phải: cắt bớt / kéo dài
// Logic kéo nằm ở useClipDrag; component này chỉ báo "bắt đầu kéo ở chế độ nào".
import { memo } from 'react'
import type { Clip, Id, MediaAsset, TrackKind } from '@shared/project/schema'
import { formatTimecode } from '@shared/project/time'
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
  fps: number
  onPointerDown: (e: React.PointerEvent, clipId: Id, mode: DragMode) => void
}

/** Ảnh thu nhỏ lặp lại + sóng âm của file gốc, cắt đúng đoạn clip đang dùng. */
function MediaStrip({ clip, asset, pxPerSecond }: { clip: Clip; asset: MediaAsset; pxPerSecond: number }): React.JSX.Element | null {
  const preview = useMediaPreview(asset.path)
  const speed = clip.type === 'media' ? clip.speed : 1
  const sourceIn = clip.type === 'media' ? clip.sourceIn : 0
  // Ảnh sóng âm vẽ cho CẢ file → giãn theo độ dài file (đã tính tốc độ) và dịch tới điểm bắt đầu cắt
  const waveWidth = timeToPx(asset.durationUs / speed, pxPerSecond)
  const waveOffset = -timeToPx(sourceIn / speed, pxPerSecond)
  return (
    <>
      {asset.kind !== 'audio' && preview?.thumbnailUrl && (
        <div className="tl-clip-thumbs" style={{ backgroundImage: `url("${preview.thumbnailUrl}")` }} />
      )}
      {preview?.waveformUrl && (
        <div
          className="tl-clip-wave"
          style={{
            WebkitMaskImage: `url("${preview.waveformUrl}")`,
            WebkitMaskSize: `${waveWidth}px 100%`,
            WebkitMaskPosition: `${waveOffset}px 0`
          }}
        />
      )}
    </>
  )
}

export const ClipView = memo(function ClipView({
  clip,
  trackKind,
  asset,
  pxPerSecond,
  selected,
  dragging,
  locked,
  fps,
  onPointerDown
}: Props) {
  const left = timeToPx(clip.start, pxPerSecond)
  const width = Math.max(2, timeToPx(clip.duration, pxPerSecond))
  const name = clip.type === 'text' ? clip.text : (asset?.name ?? '?')
  const media = clip.type === 'media' ? clip : null
  const fades = media && asset?.hasAudio ? effectiveFades(media) : null
  const audioOnly = asset?.kind === 'audio'

  return (
    <div
      className={`tl-clip kind-${trackKind} ${audioOnly ? 'audio-only' : ''} ${selected ? 'selected' : ''} ${dragging ? 'dragging' : ''}`}
      style={{ left, width }}
      title={`${name}\n${formatTimecode(clip.duration, fps)}`}
      onPointerDown={(e) => onPointerDown(e, clip.id, 'move')}
    >
      {/* Dải tên + thời lượng (giống CapCut: "DSCF2285.MOV 00:00:13:01") */}
      <div className="tl-clip-head">
        {width > 36 && (
          <>
            <span className="tl-clip-name">{name}</span>
            {width > 120 && <span className="tl-clip-time">{formatTimecode(clip.duration, fps)}</span>}
            {media && media.speed !== 1 && <span className="tl-badge">{media.speed}×</span>}
            {media && media.volume === 0 && asset?.hasAudio && <span className="tl-badge">🔇</span>}
          </>
        )}
      </div>
      <div className="tl-clip-body">
        {asset && <MediaStrip clip={clip} asset={asset} pxPerSecond={pxPerSecond} />}
        {clip.type === 'text' && <span className="tl-clip-text">T</span>}
      </div>

      {/* Hình tam giác fade: phần tối phía trên đường dốc = âm lượng đang nhỏ dần/to dần */}
      {fades && fades.fadeIn > 0 && <div className="tl-fade in" style={{ width: timeToPx(fades.fadeIn, pxPerSecond) }} />}
      {fades && fades.fadeOut > 0 && <div className="tl-fade out" style={{ width: timeToPx(fades.fadeOut, pxPerSecond) }} />}

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
