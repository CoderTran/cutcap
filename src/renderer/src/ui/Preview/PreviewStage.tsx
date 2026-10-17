// Khung Xem trước: canvas do PreviewEngine vẽ + thanh điều khiển phát.
// Bấm vào chữ/video trên khung để chọn, kéo để đổi vị trí (tự hít vào giữa khung), bấm đúp chữ để sửa nội dung.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { aspectValue } from '@shared/project/canvas'
import { ASPECT_RATIOS, type AspectRatio } from '@shared/project/schema'
import { formatTimecode } from '@shared/project/time'
import { findClip, projectDuration } from '@shared/timeline/clips'
import { PreviewEngine, type LayerBox } from '../../engine/preview/PreviewEngine'
import { editorStore, useEditorStore } from '../../state/editorStore'
import { attachEngine, pause, togglePlay } from '../../state/playbackActions'
import { updateSettings } from '../../state/projectActions'
import { projectStore, useProjectStore } from '../../state/projectStore'
import { setTextStyle, setTransform } from '../../state/textActions'
import { newSession } from '../Inspector/fields'
import { Icon } from '../icons'
import { FOCUS_TEXT_EVENT } from '../Inspector/TextPanel'

/** Kéo tới gần giữa khung (theo tỉ lệ khung) thì tự hít vào giữa. */
const CENTER_SNAP = 0.015
/** Xoay tới gần 0°/90°/180° (trong khoảng này) thì tự hít vào. */
const ROTATE_SNAP_DEG = 4
/** Giới hạn cỡ chữ khi kéo – khớp thanh trượt "Cỡ chữ". */
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 300

const SCALE_HANDLES = ['nw', 'ne', 'sw', 'se'] as const
type HandleKind = (typeof SCALE_HANDLES)[number] | 'rotate'

interface Box {
  left: number
  top: number
  width: number
  height: number
}

export function PreviewStage(): React.JSX.Element {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const engineRef = useRef<PreviewEngine | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [selBox, setSelBox] = useState<Box | null>(null)
  const [guides, setGuides] = useState({ x: false, y: false })
  const aspectRatio = useProjectStore((s) => s.project.settings.aspectRatio)
  const fps = useProjectStore((s) => s.project.settings.fps)
  const duration = useProjectStore((s) => projectDuration(s.project))
  const currentTime = useEditorStore((s) => s.currentTime)
  const playing = useEditorStore((s) => s.playing)
  // Góc xoay của lớp đang chọn – khung chọn xoay theo (khung do engine trả về là khung CHƯA xoay, cùng tâm)
  const selectedId = useEditorStore((s) => (s.selectedClipIds.length === 1 ? s.selectedClipIds[0] : null))
  const selRotation = useProjectStore((s) => (selectedId ? (findClip(s.project, selectedId)?.clip.transform.rotation ?? 0) : 0))

  // Tạo engine 1 lần khi khung preview xuất hiện
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new PreviewEngine(canvas)
    engineRef.current = engine
    attachEngine(engine)

    // Khung chọn: bao quanh lớp hình của clip đang chọn (đổi từ pixel canvas sang pixel màn hình)
    engine.setLayoutListener((layout: LayerBox[]) => {
      const selected = editorStore.getState().selectedClipIds
      const hit = selected.length === 1 ? layout.find((l) => l.clipId === selected[0]) : undefined
      if (!hit || canvas.width === 0) return setSelBox((b) => (b ? null : b))
      const k = canvas.clientWidth / canvas.width
      const next = { left: hit.rect.x * k, top: hit.rect.y * k, width: hit.rect.w * k, height: hit.rect.h * k }
      setSelBox((b) =>
        b && Math.abs(b.left - next.left) < 0.5 && Math.abs(b.top - next.top) < 0.5 && Math.abs(b.width - next.width) < 0.5 && Math.abs(b.height - next.height) < 0.5
          ? b
          : next
      )
    })
    return () => {
      attachEngine(null)
      engineRef.current = null
      engine.destroy()
    }
  }, [])

  // Tính kích thước canvas lớn nhất vừa khung mà vẫn đúng tỉ lệ dự án (16:9, 9:16, 1:1)
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ratio = aspectValue(aspectRatio)
    const fit = (): void => {
      const style = getComputedStyle(wrap)
      const availW = wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const availH = wrap.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      const width = Math.floor(Math.max(0, Math.min(availW, availH * ratio)))
      const height = Math.floor(width / ratio)
      setBox({ width, height })
      engineRef.current?.resize(width, height)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(wrap)
    fit()
    return () => observer.disconnect()
  }, [aspectRatio])

  /** Bấm trên preview: chọn lớp hình trên cùng dưới con trỏ, rồi kéo để di chuyển. */
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const engine = engineRef.current
    const canvas = e.currentTarget
    if (!engine || e.button !== 0) return
    pause()
    const rect = canvas.getBoundingClientRect()
    const k = canvas.width / rect.width
    const clipId = engine.hitTest((e.clientX - rect.left) * k, (e.clientY - rect.top) * k)
    if (!clipId) {
      editorStore.getState().clearSelection()
      return
    }
    editorStore.getState().setSelection([clipId])
    const found = findClip(projectStore.getState().project, clipId)
    if (!found || found.track.locked) return

    const origin = { x: found.clip.transform.x, y: found.clip.transform.y }
    const start = { x: e.clientX, y: e.clientY }
    const session = newSession('move-layer')
    canvas.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent): void => {
      let x = origin.x + (ev.clientX - start.x) / rect.width
      let y = origin.y + (ev.clientY - start.y) / rect.height
      // Hít vào đường giữa khung (Alt để tắt hít)
      const snapX = !ev.altKey && Math.abs(x - 0.5) < CENTER_SNAP
      const snapY = !ev.altKey && Math.abs(y - 0.5) < CENTER_SNAP
      if (snapX) x = 0.5
      if (snapY) y = 0.5
      setGuides({ x: snapX, y: snapY })
      if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 2) setTransform(clipId, { x, y }, session)
    }
    const up = (): void => {
      setGuides({ x: false, y: false })
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
  }

  /**
   * Kéo núm trên khung chọn:
   *   - 4 góc: phóng to / thu nhỏ quanh tâm (chữ → đổi Cỡ chữ, video/ảnh → đổi Tỉ lệ)
   *   - núm xoay bên dưới: xoay quanh tâm (tự hít vào 0°/90°/180°, giữ Alt để tắt)
   */
  const onHandleDown = (handle: HandleKind) => (e: React.PointerEvent<HTMLDivElement>): void => {
    const canvas = canvasRef.current
    const selected = editorStore.getState().selectedClipIds
    if (!canvas || !selBox || e.button !== 0 || selected.length !== 1) return
    e.stopPropagation()
    e.preventDefault()
    const found = findClip(projectStore.getState().project, selected[0])
    if (!found || found.track.locked) return
    const { clip } = found
    pause()

    const rect = canvas.getBoundingClientRect()
    const center = { x: rect.left + selBox.left + selBox.width / 2, y: rect.top + selBox.top + selBox.height / 2 }
    const startDist = Math.max(4, Math.hypot(e.clientX - center.x, e.clientY - center.y))
    const startAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x)
    const origin = { fontSize: clip.type === 'text' ? clip.style.fontSize : 0, scale: clip.transform.scale, rotation: clip.transform.rotation }
    const session = newSession(handle === 'rotate' ? 'rotate-layer' : 'scale-layer')
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent): void => {
      if (handle === 'rotate') {
        const delta = ((Math.atan2(ev.clientY - center.y, ev.clientX - center.x) - startAngle) * 180) / Math.PI
        let rotation = Math.round(origin.rotation + delta)
        rotation = ((((rotation + 180) % 360) + 360) % 360) - 180 // đưa về khoảng -180…180
        const nearest = Math.round(rotation / 90) * 90
        if (!ev.altKey && Math.abs(rotation - nearest) <= ROTATE_SNAP_DEG) rotation = nearest
        setTransform(clip.id, { rotation }, session)
        return
      }
      const factor = Math.hypot(ev.clientX - center.x, ev.clientY - center.y) / startDist
      if (clip.type === 'text') {
        const fontSize = Math.round(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, origin.fontSize * factor)))
        setTextStyle(clip.id, { fontSize }, session)
      } else {
        setTransform(clip.id, { scale: Math.round(origin.scale * factor * 100) / 100 }, session)
      }
    }
    const up = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  /** Bấm đúp vào chữ: đưa con trỏ vào ô nhập nội dung ở panel Thuộc tính. */
  const onDoubleClick = (): void => {
    const selected = editorStore.getState().selectedClipIds
    const found = selected.length === 1 ? findClip(projectStore.getState().project, selected[0]) : null
    if (found?.clip.type === 'text') window.dispatchEvent(new Event(FOCUS_TEXT_EVENT))
  }

  return (
    <section className="panel preview-panel" ref={panelRef}>
      <header className="panel-header">{t('panels.preview')}</header>
      <div className="preview-stage">
      <div className="preview-frame-wrap" ref={wrapRef}>
        <div className="preview-canvas-box" style={{ width: box.width, height: box.height }}>
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            style={{ width: box.width, height: box.height }}
            onPointerDown={onPointerDown}
            onDoubleClick={onDoubleClick}
          />
          {selBox && !playing && (
            <div className="preview-selection" style={{ ...selBox, transform: selRotation ? `rotate(${selRotation}deg)` : undefined }}>
              {SCALE_HANDLES.map((h) => (
                <div key={h} className={`preview-handle ${h}`} title={t('preview.scaleHandle')} onPointerDown={onHandleDown(h)} />
              ))}
              <div className="preview-rotate" title={t('preview.rotateHandle')} onPointerDown={onHandleDown('rotate')}>
                <Icon name="rotate" size={13} />
              </div>
            </div>
          )}
          {guides.x && <div className="preview-guide vertical" />}
          {guides.y && <div className="preview-guide horizontal" />}
        </div>
      </div>
      <div className="preview-controls">
        <span className="timecode">
          <b>{formatTimecode(currentTime, fps)}</b> <span>/ {formatTimecode(duration, fps)}</span>
        </span>
        <button className="play" onClick={togglePlay} disabled={duration === 0} title={t('preview.playPause')}>
          <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>
        <div className="preview-right">
          {/* Tỉ lệ khung hình của dự án (giống nút "Tỉ lệ khung hình" của CapCut) */}
          <label className="ratio-select" title={t('settings.aspectRatio')}>
            <Icon name="ratio" size={15} />
            <select value={aspectRatio} onChange={(e) => updateSettings({ aspectRatio: e.target.value as AspectRatio })}>
              {ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon ghost"
            title={t('preview.fullscreen')}
            onClick={() => {
              // Toàn màn hình cả khung Xem trước (Esc để thoát)
              if (document.fullscreenElement) void document.exitFullscreen()
              else void panelRef.current?.requestFullscreen()
            }}
          >
            <Icon name="fullscreen" size={17} />
          </button>
        </div>
      </div>
    </div>
    </section>
  )
}
