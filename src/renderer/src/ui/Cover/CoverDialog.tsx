// Hộp thoại "Chọn ảnh bìa" (giống CapCut): khung lớn ở trên + 2 tab
//   - Chọn từ video: dải hình của track chính, kéo vạch để chọn khung hình (khung lớn = khung Xem trước tại đó)
//   - Trên thiết bị: chọn một ảnh trên máy
// Lưu → project.cover (kèm ảnh nhỏ để hiện ở đầu track chính và hộp thoại Xuất).
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { aspectValue } from '@shared/project/canvas'
import type { Clip, MediaAsset } from '@shared/project/schema'
import { formatTimecode } from '@shared/project/time'
import { projectDuration } from '@shared/timeline/clips'
import { mainTrack } from '@shared/timeline/magnet'
import { closeCoverDialog, isCoverDialogOpen, localImageUrl, setCover, thumbnailOf, useCoverDialogOpen } from '../../state/coverActions'
import { editorStore, useEditorStore } from '../../state/editorStore'
import { useMediaPreview } from '../../state/mediaStore'
import { pause } from '../../state/playbackActions'
import { useProjectStore } from '../../state/projectStore'

type Tab = 'video' | 'device'

export function CoverDialog(): React.JSX.Element | null {
  const open = useCoverDialogOpen()
  // Esc đóng hộp thoại
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isCoverDialogOpen()) {
        e.stopPropagation()
        closeCoverDialog()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])
  if (!open) return null
  return (
    <div className="modal-backdrop cover-backdrop" onPointerDown={(e) => e.target === e.currentTarget && closeCoverDialog()}>
      <div className="modal cover-modal" role="dialog" aria-modal="true">
        <CoverBody />
      </div>
    </div>
  )
}

function CoverBody(): React.JSX.Element {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const cover = project.cover ?? null
  const duration = projectDuration(project)
  const ratio = aspectValue(project.settings.aspectRatio)
  const now = useEditorStore((s) => s.currentTime)
  const [tab, setTab] = useState<Tab>(cover?.kind === 'image' ? 'device' : 'video')
  const [imagePath, setImagePath] = useState<string | null>(cover?.kind === 'image' ? cover.path : null)
  const [imageError, setImageError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // Mở hộp thoại: dừng phát, đưa đầu phát về khung đã chọn lần trước
  useEffect(() => {
    pause()
    const { currentTime, setCurrentTime } = editorStore.getState()
    if (cover?.kind === 'frame') setCurrentTime(Math.min(cover.time, Math.max(0, duration - 1)))
    // Đầu phát ở cuối video (sau clip cuối) → khung đen; về đầu video
    else if (currentTime >= duration) setCurrentTime(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Khung lớn = bản sao liên tục của khung Xem trước (đã có đủ chữ, hiệu ứng, màu…)
  useEffect(() => {
    if (tab !== 'video') return
    let raf = 0
    const copy = (): void => {
      const source = document.querySelector<HTMLCanvasElement>('.preview-canvas')
      const canvas = canvasRef.current
      if (source && canvas && source.width > 0) {
        if (canvas.width !== source.width || canvas.height !== source.height) {
          canvas.width = source.width
          canvas.height = source.height
        }
        canvas.getContext('2d')!.drawImage(source, 0, 0)
      }
      raf = requestAnimationFrame(copy)
    }
    copy()
    return () => cancelAnimationFrame(raf)
  }, [tab])

  /** Kéo trên dải hình: chọn thời điểm. */
  const onStripDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || duration === 0) return
    const strip = e.currentTarget
    const rect = strip.getBoundingClientRect()
    const seek = (clientX: number): void => {
      const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      editorStore.getState().setCurrentTime(Math.min(duration - 1, Math.round(f * duration)))
    }
    seek(e.clientX)
    strip.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent): void => seek(ev.clientX)
    const up = (): void => {
      strip.removeEventListener('pointermove', move)
      strip.removeEventListener('pointerup', up)
      strip.removeEventListener('pointercancel', up)
    }
    strip.addEventListener('pointermove', move)
    strip.addEventListener('pointerup', up)
    strip.addEventListener('pointercancel', up)
  }

  const pickImage = async (): Promise<void> => {
    const [path] = await window.cutcap.pickMediaFiles('image')
    if (path) {
      setImageError(false)
      setImagePath(path)
    }
  }

  const save = (): void => {
    if (tab === 'video') {
      const canvas = canvasRef.current
      const thumb = canvas ? thumbnailOf(canvas, canvas.width, canvas.height) : null
      if (!thumb) return
      setCover({ kind: 'frame', time: editorStore.getState().currentTime, thumb })
    } else {
      const img = imgRef.current
      const thumb = img && imagePath && img.complete ? thumbnailOf(img, img.naturalWidth, img.naturalHeight) : null
      if (!thumb || !imagePath) return setImageError(true)
      setCover({ kind: 'image', path: imagePath, thumb })
    }
    closeCoverDialog()
  }

  const canSave = tab === 'video' ? duration > 0 : imagePath !== null && !imageError
  const main = mainTrack(project)

  return (
    <>
      <h2 className="modal-title">{t('cover.title')}</h2>
      <div className="cover-stage">
        <div className="cover-frame" style={{ aspectRatio: String(ratio) }}>
          {tab === 'video' ? (
            <canvas ref={canvasRef} />
          ) : imagePath && !imageError ? (
            <img ref={imgRef} src={localImageUrl(imagePath)} crossOrigin="anonymous" alt="" onError={() => setImageError(true)} />
          ) : (
            <button className="cover-pick" onClick={() => void pickImage()}>
              {imageError ? t('cover.imageError') : t('cover.pickImage')}
            </button>
          )}
        </div>
      </div>

      <div className="segmented cover-tabs">
        {(['video', 'device'] as const).map((k) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {t(`cover.tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'video' ? (
        <div className="cover-strip" onPointerDown={onStripDown}>
          {main?.clips.map((c) => (
            <StripSegment key={c.id} clip={c} asset={c.type === 'media' ? project.assets[c.assetId] : undefined} total={duration} />
          ))}
          {duration > 0 && (
            <div className="cover-marker" style={{ left: `${(Math.min(now, duration) / duration) * 100}%` }}>
              <span>{formatTimecode(Math.min(now, duration), project.settings.fps)}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="hint cover-device-hint">
          {imagePath ? imagePath : t('cover.deviceHint')}
          {imagePath && (
            <button className="link" onClick={() => void pickImage()}>
              {t('cover.changeImage')}
            </button>
          )}
        </p>
      )}

      <div className="modal-actions cover-actions">
        <button
          className="cover-remove"
          disabled={!cover}
          onClick={() => {
            setCover(null)
            closeCoverDialog()
          }}
        >
          {t('cover.remove')}
        </button>
        <button className="primary" disabled={!canSave} onClick={save}>
          {t('cover.save')}
        </button>
        <button onClick={closeCoverDialog}>{t('cover.cancel')}</button>
      </div>
    </>
  )
}

/** Một đoạn của dải hình: ảnh thu nhỏ của clip trên track chính, đặt đúng vị trí trên timeline. */
function StripSegment({ clip, asset, total }: { clip: Clip; asset: MediaAsset | undefined; total: number }): React.JSX.Element | null {
  const preview = useMediaPreview(asset?.path ?? '')
  if (total === 0) return null
  return (
    <div
      className="cover-strip-seg"
      style={{
        left: `${(clip.start / total) * 100}%`,
        width: `${(clip.duration / total) * 100}%`,
        backgroundImage: preview?.thumbnailUrl ? `url("${preview.thumbnailUrl}")` : undefined
      }}
    />
  )
}
