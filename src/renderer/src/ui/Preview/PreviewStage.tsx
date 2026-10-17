// Khung Xem trước: canvas do PreviewEngine vẽ + thanh điều khiển phát.
// Bấm vào chữ/video trên khung để chọn, kéo để đổi vị trí (tự hít vào giữa khung), bấm đúp chữ để sửa nội dung.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { aspectValue } from '@shared/project/canvas'
import { formatTimecode } from '@shared/project/time'
import { findClip, projectDuration } from '@shared/timeline/clips'
import { PreviewEngine, type LayerBox } from '../../engine/preview/PreviewEngine'
import { editorStore, useEditorStore } from '../../state/editorStore'
import { attachEngine, goToEnd, goToStart, pause, togglePlay } from '../../state/playbackActions'
import { projectStore, useProjectStore } from '../../state/projectStore'
import { setTransform } from '../../state/textActions'
import { newSession } from '../Inspector/fields'
import { FOCUS_TEXT_EVENT } from '../Inspector/TextPanel'

/** Kéo tới gần giữa khung (theo tỉ lệ khung) thì tự hít vào giữa. */
const CENTER_SNAP = 0.015

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
  const engineRef = useRef<PreviewEngine | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [selBox, setSelBox] = useState<Box | null>(null)
  const [guides, setGuides] = useState({ x: false, y: false })
  const aspectRatio = useProjectStore((s) => s.project.settings.aspectRatio)
  const fps = useProjectStore((s) => s.project.settings.fps)
  const duration = useProjectStore((s) => projectDuration(s.project))
  const currentTime = useEditorStore((s) => s.currentTime)
  const playing = useEditorStore((s) => s.playing)

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

  /** Bấm đúp vào chữ: đưa con trỏ vào ô nhập nội dung ở panel Thuộc tính. */
  const onDoubleClick = (): void => {
    const selected = editorStore.getState().selectedClipIds
    const found = selected.length === 1 ? findClip(projectStore.getState().project, selected[0]) : null
    if (found?.clip.type === 'text') window.dispatchEvent(new Event(FOCUS_TEXT_EVENT))
  }

  return (
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
          {selBox && !playing && <div className="preview-selection" style={selBox} />}
          {guides.x && <div className="preview-guide vertical" />}
          {guides.y && <div className="preview-guide horizontal" />}
        </div>
      </div>
      <div className="preview-controls">
        <span className="timecode">
          {formatTimecode(currentTime, fps)} <span className="hint">/ {formatTimecode(duration, fps)}</span>
        </span>
        <div className="preview-buttons">
          <button className="icon" onClick={goToStart} title={t('preview.toStart')}>
            ⏮
          </button>
          <button className="play" onClick={togglePlay} disabled={duration === 0} title={t('preview.playPause')}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="icon" onClick={goToEnd} title={t('preview.toEnd')}>
            ⏭
          </button>
        </div>
        <span className="preview-ratio hint">{aspectRatio}</span>
      </div>
    </div>
  )
}
