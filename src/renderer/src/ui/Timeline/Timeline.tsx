// Timeline nhiều track.
//
// Bố cục: một vùng cuộn duy nhất (cuộn cả ngang lẫn dọc). Bên trong:
//   - hàng thước thời gian dính ở trên cùng (position: sticky; top: 0)
//   - mỗi track một hàng: [tiêu đề dính bên trái | làn chứa clip]
//   - vùng trống phía dưới để thả media tạo track mới
//   - vạch đầu phát (playhead) và khung "bóng" khi đang kéo media vào
//
// Toạ độ: thời điểm t nằm ở x = HEADER_WIDTH + timeToPx(t) tính từ mép trái nội dung.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Id, Track } from '@shared/project/schema'
import { MICROS_PER_SECOND, formatDuration } from '@shared/project/time'
import { DEFAULT_IMAGE_DURATION, projectDuration, resolveDrop, type DropTarget } from '@shared/timeline/clips'
import { clampZoom, pxToTime, timeToPx } from '@shared/timeline/ruler'
import { collectSnapPoints, snapSpan } from '@shared/timeline/snap'
import { editorStore, useEditorStore } from '../../state/editorStore'
import { projectStore, useProjectStore } from '../../state/projectStore'
import { dropAssetOnTimeline } from '../../state/timelineActions'
import { ASSET_DRAG_TYPE } from '../MediaBin/MediaCard'
import { ClipView } from './ClipView'
import { DROP_ZONE_HEIGHT, HEADER_WIDTH, RULER_HEIGHT, SNAP_PX, TAIL_PADDING_PX, trackHeight, trackOffsets } from './layout'
import { TimelineToolbar } from './TimelineToolbar'
import { TimeRuler } from './TimeRuler'
import { Playhead } from './Playhead'
import { TrackHeader } from './TrackHeader'
import { TransitionMarkers } from './TransitionMarkers'
import { useClipDrag } from './useClipDrag'

/** "Video 1", "Âm thanh 2"… đánh số từ dưới lên như CapCut. */
function useTrackLabels(tracks: Track[]): Map<Id, string> {
  const { t } = useTranslation()
  return useMemo(() => {
    const labels = new Map<Id, string>()
    for (const track of tracks) {
      if (track.name) {
        labels.set(track.id, track.name)
        continue
      }
      const sameKind = tracks.filter((x) => x.kind === track.kind)
      labels.set(track.id, `${t(`track.kind.${track.kind}`)} ${sameKind.length - sameKind.indexOf(track)}`)
    }
    return labels
  }, [tracks, t])
}

interface DropPreview extends DropTarget {
  duration: number
  snappedTo: number | null
}

export function Timeline(): React.JSX.Element {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const pps = useEditorStore((s) => s.pxPerSecond)
  const selected = useEditorStore((s) => s.selectedClipIds)

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ left: 0, width: 800 })
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null)
  /** Mốc thời gian cần giữ cố định trên màn hình khi zoom (xem useLayoutEffect bên dưới). */
  const zoomAnchor = useRef<{ time: number; screenX: number } | null>(null)

  const tracks = project.tracks
  const labels = useTrackLabels(tracks)
  const offsets = useMemo(() => trackOffsets(tracks), [tracks])
  const tracksHeight = tracks.reduce((h, tr) => h + trackHeight(tr), 0)
  const duration = projectDuration(project)
  const laneWidth = Math.max(view.width - HEADER_WIDTH, timeToPx(duration, pps) + TAIL_PADDING_PX)
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const { preview: clipDrag, onClipPointerDown } = useClipDrag(contentRef, tracks, offsets)
  const draggingSet = useMemo(() => new Set(clipDrag?.ghosts.map((g) => g.clipId)), [clipDrag])

  // ───────── Theo dõi vùng nhìn thấy (để thước chỉ vẽ phần cần thiết) ─────────
  const updateView = useCallback(() => {
    const el = scrollRef.current
    if (el) setView({ left: el.scrollLeft, width: el.clientWidth })
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(updateView)
    observer.observe(el)
    updateView()
    return () => observer.disconnect()
  }, [updateView])

  // ───────── Zoom ─────────

  /** Đổi zoom mà vẫn giữ thời điểm `time` ở nguyên vị trí `screenX` trên màn hình. */
  const zoomAround = useCallback((nextPps: number, time: number, screenX: number) => {
    zoomAnchor.current = { time, screenX }
    editorStore.getState().setZoom(nextPps)
  }, [])

  // Sau khi zoom đã vẽ lại xong, cuộn để mốc giữ đúng vị trí (chạy trước khi màn hình hiển thị → không giật)
  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = zoomAnchor.current
    if (!el || !anchor) return
    zoomAnchor.current = null
    el.scrollLeft = Math.max(0, HEADER_WIDTH + timeToPx(anchor.time, pps) - anchor.screenX)
    updateView()
  }, [pps, updateView])

  /** Zoom từ thanh công cụ: giữ đầu phát đứng yên (hoặc giữa màn hình nếu đầu phát đang khuất). */
  const zoomFromToolbar = (nextPps: number): void => {
    const el = scrollRef.current
    if (!el) return
    const playheadX = HEADER_WIDTH + timeToPx(editorStore.getState().currentTime, pps) - el.scrollLeft
    const visible = playheadX >= HEADER_WIDTH && playheadX <= el.clientWidth
    const screenX = visible ? playheadX : HEADER_WIDTH + (el.clientWidth - HEADER_WIDTH) / 2
    zoomAround(clampZoom(nextPps), pxToTime(el.scrollLeft + screenX - HEADER_WIDTH, pps), screenX)
  }

  /** Vừa khít: toàn bộ dự án nằm gọn trong khung nhìn. */
  const fitToView = (): void => {
    const el = scrollRef.current
    if (!el || duration === 0) return
    const available = el.clientWidth - HEADER_WIDTH - 40
    zoomAround(clampZoom(available / (duration / MICROS_PER_SECOND)), 0, HEADER_WIDTH)
  }

  // Ctrl + lăn chuột = zoom quanh con trỏ. Phải gắn listener "không thụ động" mới chặn được cuộn mặc định.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const screenX = Math.max(HEADER_WIDTH, e.clientX - rect.left)
      const { pxPerSecond } = editorStore.getState()
      const time = pxToTime(el.scrollLeft + screenX - HEADER_WIDTH, pxPerSecond)
      const factor = Math.exp(-e.deltaY * 0.002) // lăn mượt với cả chuột lẫn touchpad
      zoomAround(clampZoom(pxPerSecond * factor), time, screenX)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAround])

  // Đang phát mà đầu phát chạy ra khỏi mép phải → lật sang "trang" kế tiếp, giống CapCut
  useEffect(
    () =>
      editorStore.subscribe((s) => {
        const el = scrollRef.current
        if (!el || !s.playing) return
        const x = HEADER_WIDTH + timeToPx(s.currentTime, s.pxPerSecond)
        if (x > el.scrollLeft + el.clientWidth - 24 || x < el.scrollLeft + HEADER_WIDTH) {
          el.scrollLeft = Math.max(0, x - HEADER_WIDTH - 24)
        }
      }),
    []
  )

  // ───────── Bấm vào vùng trống của track: di chuyển đầu phát + bỏ chọn ─────────
  const onLanePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    editorStore.getState().setCurrentTime(pxToTime(e.clientX - rect.left, pps))
    editorStore.getState().clearSelection()
  }

  // ───────── Kéo media từ thư viện thả vào timeline ─────────

  /**
   * Tính nơi sẽ thả dựa trên vị trí chuột.
   * @param assetId media đang kéo. Lúc dragover trình duyệt không cho đọc dữ liệu kéo, nên dùng
   *                id lưu trong editorStore; lúc drop thì đọc trực tiếp từ dataTransfer cho chắc.
   */
  const computeDrop = (e: DragEvent<HTMLDivElement>, assetId: Id | null): DropPreview | null => {
    const asset = assetId ? projectStore.getState().project.assets[assetId] : undefined
    const content = e.currentTarget.getBoundingClientRect()
    if (!asset) return null

    // Track dưới con trỏ (null nếu ở vùng trống phía dưới)
    const y = e.clientY - content.top - RULER_HEIGHT
    const index = offsets.findIndex((top, i) => y >= top && y < top + trackHeight(tracks[i]))
    const trackId = index >= 0 ? tracks[index].id : null

    const rawStart = pxToTime(e.clientX - content.left - HEADER_WIDTH, pps)
    const clipDuration = asset.kind === 'image' ? DEFAULT_IMAGE_DURATION : asset.durationUs
    const points = collectSnapPoints(projectStore.getState().project, editorStore.getState().currentTime)
    const threshold = editorStore.getState().snapping ? pxToTime(SNAP_PX, pps) : 0
    const snapped = snapSpan(Math.max(0, rawStart), clipDuration, points, threshold)
    const target = resolveDrop(projectStore.getState().project, asset, trackId, snapped.start)
    return { ...target, duration: clipDuration, snappedTo: snapped.snappedTo }
  }

  const isAssetDrag = (e: DragEvent): boolean => e.dataTransfer.types.includes(ASSET_DRAG_TYPE)

  const onDragOver = (e: DragEvent<HTMLDivElement>): void => {
    if (!isAssetDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropPreview(computeDrop(e, editorStore.getState().draggingAssetId))
  }
  const onDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    // Chỉ xóa bóng khi chuột thật sự rời khỏi vùng nội dung (không phải đi qua phần tử con)
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropPreview(null)
  }
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    if (!isAssetDrag(e)) return
    e.preventDefault()
    const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE)
    const preview = computeDrop(e, assetId)
    setDropPreview(null)
    editorStore.getState().setDraggingAsset(null)
    if (preview && assetId) dropAssetOnTimeline(assetId, preview.trackId, preview.start)
  }

  // Vị trí dọc của bóng: trong track đích, hoặc vạch "track mới" ở trên cùng (hình) / dưới các track hình (âm thanh)
  let ghostTop = 0
  let ghostHeight = 0
  let ghostNewTrack = false
  if (dropPreview) {
    const index = tracks.findIndex((tr) => tr.id === dropPreview.trackId)
    if (index >= 0) {
      ghostTop = offsets[index]
      ghostHeight = trackHeight(tracks[index])
    } else {
      ghostNewTrack = true
      const firstAudio = tracks.findIndex((tr) => tr.kind === 'audio')
      ghostTop = dropPreview.kind === 'audio' ? (firstAudio >= 0 ? offsets[firstAudio] : tracksHeight) : 0
      ghostHeight = 0
    }
  }

  return (
    <div className="timeline">
      <TimelineToolbar durationUs={duration} onZoom={zoomFromToolbar} onFit={fitToView} />

      <div className="tl-scroll" ref={scrollRef} onScroll={updateView}>
        <div
          ref={contentRef}
          className={`tl-content ${clipDrag ? `dragging-${clipDrag.mode}` : ''}`}
          style={{ width: HEADER_WIDTH + laneWidth }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* Hàng thước – dính ở trên */}
          <div className="tl-ruler-row" style={{ height: RULER_HEIGHT }}>
            <div className="tl-corner" style={{ width: HEADER_WIDTH }} />
            <TimeRuler
              width={laneWidth}
              visibleFrom={Math.max(0, view.left - HEADER_WIDTH)}
              visibleTo={view.left + view.width - HEADER_WIDTH}
            />
          </div>

          {tracks.map((track) => (
            <div key={track.id} className={`tl-row ${track.hidden ? 'hidden' : ''}`}>
              <TrackHeader track={track} label={labels.get(track.id) ?? ''} />
              <div
                className={`tl-lane kind-${track.kind} ${track.locked ? 'locked' : ''}`}
                style={{ width: laneWidth, height: trackHeight(track) }}
                onPointerDown={onLanePointerDown}
              >
                {track.clips.map((clip) => (
                  <ClipView
                    key={clip.id}
                    clip={clip}
                    trackKind={track.kind}
                    asset={clip.type === 'text' ? undefined : project.assets[clip.assetId]}
                    pxPerSecond={pps}
                    selected={selectedSet.has(clip.id)}
                    dragging={draggingSet.has(clip.id)}
                    locked={track.locked}
                    fps={project.settings.fps}
                    onPointerDown={onClipPointerDown}
                  />
                ))}
                <TransitionMarkers project={project} track={track} pxPerSecond={pps} />
              </div>
            </div>
          ))}

          {/* Vùng trống phía dưới: thả vào đây để tạo track mới */}
          <div className="tl-row">
            <div className="tl-header empty" style={{ width: HEADER_WIDTH, height: DROP_ZONE_HEIGHT }} />
            <div className="tl-dropzone" style={{ width: laneWidth, height: DROP_ZONE_HEIGHT }} onPointerDown={onLanePointerDown}>
              {Object.keys(project.assets).length > 0 && duration === 0 && (
                <span className="hint" style={{ left: view.left + 12 }}>
                  {t('timeline.dropHint')}
                </span>
              )}
            </div>
          </div>

          {/* Bóng của clip khi đang kéo media vào */}
          {dropPreview &&
            (ghostNewTrack ? (
              <div
                className="tl-drop-newtrack"
                style={{ top: RULER_HEIGHT + ghostTop - 1, left: HEADER_WIDTH + timeToPx(dropPreview.start, pps) }}
              >
                <span>+ {t('timeline.newTrack', { kind: t(`track.kind.${dropPreview.kind}`) })}</span>
              </div>
            ) : (
              <div
                className="tl-drop-ghost"
                style={{
                  top: RULER_HEIGHT + ghostTop + 2,
                  height: ghostHeight - 4,
                  left: HEADER_WIDTH + timeToPx(dropPreview.start, pps),
                  width: Math.max(2, timeToPx(dropPreview.duration, pps))
                }}
              />
            ))}
          {/* Bóng của các clip đang kéo/cắt mép */}
          {clipDrag?.ghosts.map((g) => {
            const index = tracks.findIndex((tr) => tr.id === g.trackId)
            if (index < 0) return null
            return (
              <div
                key={g.clipId}
                className={`tl-clip-ghost ${clipDrag.valid ? '' : 'invalid'}`}
                style={{
                  top: RULER_HEIGHT + offsets[index] + 3,
                  height: trackHeight(tracks[index]) - 6,
                  left: HEADER_WIDTH + timeToPx(g.start, pps),
                  width: Math.max(2, timeToPx(g.duration, pps))
                }}
              >
                {clipDrag.mode !== 'move' && <span>{formatDuration(g.duration)}</span>}
              </div>
            )
          })}

          {(dropPreview?.snappedTo ?? clipDrag?.snappedTo ?? null) !== null && (
            <div
              className="tl-snap-line"
              style={{ left: HEADER_WIDTH + timeToPx((dropPreview?.snappedTo ?? clipDrag?.snappedTo)!, pps) }}
            />
          )}

          <Playhead />
        </div>
      </div>
    </div>
  )
}
