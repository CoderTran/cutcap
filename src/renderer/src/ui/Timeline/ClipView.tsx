// Một clip trên track, kiểu CapCut: dải trên cùng ghi tên + thời lượng, giữa là ảnh thu nhỏ lặp lại,
// dưới cùng là sóng âm (nếu clip có tiếng).
//  - Bấm: chọn (giữ Ctrl/Shift để chọn nhiều)
//  - Kéo thân clip: di chuyển (cả sang track khác cùng loại)
//  - Kéo mép trái/phải: cắt bớt / kéo dài
// Logic kéo nằm ở useClipDrag; component này chỉ báo "bắt đầu kéo ở chế độ nào".
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Clip, Id, MediaAsset, TrackKind } from '@shared/project/schema'
import { formatTimecode, type Micros } from '@shared/project/time'
import { effectiveFades } from '@shared/timeline/clipProps'
import { keyframeTimes } from '@shared/timeline/keyframes'
import { pxToTime, timeToPx } from '@shared/timeline/ruler'
import { editorStore } from '../../state/editorStore'
import { moveKeyframeTime } from '../../state/keyframeActions'
import { pause } from '../../state/playbackActions'
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
  /** Chuột phải → mở menu (Tách âm thanh, Sao chép, Xóa…). */
  onContextMenu: (e: React.MouseEvent, clipId: Id) => void
}

/** Kéo dưới mức này (pixel) coi như bấm, không phải kéo. */
const KF_DRAG_THRESHOLD_PX = 3

/** Bấm / kéo dấu ◆: theo dõi chuột trên cả cửa sổ cho tới khi thả. */
function startKeyframeDrag(e: React.PointerEvent, clip: Clip, time: Micros, pxPerSecond: number, locked: boolean): void {
  e.stopPropagation() // không để clip bắt đầu kéo
  if (e.button !== 0) return
  pause()
  const startX = e.clientX
  const session = `kf-drag:${clip.id}:${performance.now()}`
  let current = time
  let dragging = false

  const move = (ev: PointerEvent): void => {
    const dx = ev.clientX - startX
    if (!dragging && (locked || Math.abs(dx) < KF_DRAG_THRESHOLD_PX)) return
    dragging = true
    document.body.classList.add('dragging-keyframe')
    current = moveKeyframeTime(clip.id, current, time + pxToTime(dx, pxPerSecond), session)
    editorStore.getState().setCurrentTime(clip.start + current) // đầu phát đi theo để xem ngay hình tại đó
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    document.body.classList.remove('dragging-keyframe')
    if (!dragging) editorStore.getState().setCurrentTime(clip.start + time)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/** Ảnh thu nhỏ lặp lại + sóng âm của file gốc, cắt đúng đoạn clip đang dùng. */
function MediaStrip({ clip, asset, pxPerSecond }: { clip: Clip; asset: MediaAsset; pxPerSecond: number }): React.JSX.Element | null {
  const preview = useMediaPreview(asset.path)
  const speed = clip.type === 'media' ? clip.speed : 1
  const sourceIn = clip.type === 'media' ? clip.sourceIn : 0
  // Ảnh sóng âm vẽ cho CẢ file → giãn theo độ dài file (đã tính tốc độ) và dịch tới điểm bắt đầu cắt
  const waveWidth = timeToPx(asset.durationUs / speed, pxPerSecond)
  const waveOffset = -timeToPx(sourceIn / speed, pxPerSecond)
  // Video đã tách âm thanh (tắt tiếng) → không vẽ sóng âm nữa, giống CapCut
  const muted = clip.type === 'media' && clip.volume === 0 && asset.kind === 'video'
  return (
    <>
      {asset.kind !== 'audio' && preview?.thumbnailUrl && (
        <div className="tl-clip-thumbs" style={{ backgroundImage: `url("${preview.thumbnailUrl}")` }} />
      )}
      {preview?.waveformUrl && !muted && (
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
  onPointerDown,
  onContextMenu
}: Props) {
  const { t } = useTranslation()
  const left = timeToPx(clip.start, pxPerSecond)
  const width = Math.max(2, timeToPx(clip.duration, pxPerSecond))
  const name =
    clip.type === 'text' ? clip.text : clip.type === 'effect' ? t(`effects.names.${clip.effectId}`, { defaultValue: clip.effectId }) : (asset?.name ?? '?')
  const media = clip.type === 'media' ? clip : null
  const fades = media && asset?.hasAudio ? effectiveFades(media) : null
  const audioOnly = asset?.kind === 'audio'
  const hint = t('keyframe.dragHint')

  return (
    <div
      className={`tl-clip kind-${trackKind} ${audioOnly ? 'audio-only' : ''} ${selected ? 'selected' : ''} ${dragging ? 'dragging' : ''}`}
      style={{ left, width }}
      title={`${name}\n${formatTimecode(clip.duration, fps)}`}
      onPointerDown={(e) => onPointerDown(e, clip.id, 'move')}
      onContextMenu={(e) => onContextMenu(e, clip.id)}
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
        {clip.type === 'effect' && <span className="tl-clip-text">✦</span>}
      </div>

      {/* Hình tam giác fade: phần tối phía trên đường dốc = âm lượng đang nhỏ dần/to dần */}
      {fades && fades.fadeIn > 0 && <div className="tl-fade in" style={{ width: timeToPx(fades.fadeIn, pxPerSecond) }} />}
      {fades && fades.fadeOut > 0 && <div className="tl-fade out" style={{ width: timeToPx(fades.fadeOut, pxPerSecond) }} />}

      {/* Dấu ◆ tại các keyframe (chỉ khi clip đang chọn, giống CapCut):
          bấm → nhảy đầu phát tới đó; kéo ngang → dời keyframe sang thời điểm khác */}
      {selected &&
        keyframeTimes(clip).map((time, i) => (
          <button
            // key theo thứ tự (không theo thời gian): đang kéo thì thời gian đổi liên tục, phần tử không được tạo lại
            key={i}
            className="tl-kf"
            style={{ left: timeToPx(time, pxPerSecond) }}
            title={`${formatTimecode(clip.start + time, fps)} – ${hint}`}
            onPointerDown={(e) => startKeyframeDrag(e, clip, time, pxPerSecond, locked)}
          />
        ))}

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
