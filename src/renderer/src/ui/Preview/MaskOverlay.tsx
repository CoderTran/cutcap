// Khung kéo mặt nạ trên Xem trước (giống CapCut), hiện khi đang mở Điều chỉnh → Mặt nạ:
//   - kéo bất kỳ đâu: di chuyển mặt nạ
//   - 4 thanh ở cạnh: đổi riêng Rộng / Cao (Cuộn phim: độ dày dải), 4 chấm ở góc: phóng to / thu nhỏ đều
//   - nút phía trên: kéo lên / xuống để Làm mờ viền, nút phía dưới: xoay (tự hít 0°/90°/180°, Alt để tắt)
// Tọa độ mặt nạ tính theo khung hình gốc của clip → đổi qua khung lớp hình (đã xoay) trên màn hình.
import { useTranslation } from 'react-i18next'
import type { MediaClip } from '@shared/project/schema'
import type { ClipMask } from '@shared/render/mask'
import { maskAt, type MaskProp } from '@shared/timeline/keyframes'
import { useEditorStore } from '../../state/editorStore'
import { editTimeFor } from '../../state/keyframeActions'
import { setMaskValues } from '../../state/maskActions'
import { pause } from '../../state/playbackActions'
import { newSession } from '../Inspector/fields'
import { Icon } from '../icons'

interface Box {
  left: number
  top: number
  width: number
  height: number
}

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'rotate' | 'feather'

const ROTATE_SNAP_DEG = 4
/** Nút Làm mờ viền nằm cách mép trên bấy nhiêu px + feather / 2 (kéo 1 px = 2 đơn vị → nút chạy theo chuột). */
const FEATHER_GAP = 26
const FEATHER_PER_PX = 2
/** Cỡ nhỏ nhất khi kéo (px trên màn hình) để còn bấm lại được. */
const MIN_SIZE_PX = 6

const rot = (x: number, y: number, deg: number): { x: number; y: number } => {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: x * c - y * s, y: x * s + y * c }
}
const wrapDeg = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180

export function MaskOverlay({
  clip,
  layer,
  layerRotation
}: {
  clip: MediaClip
  layer: Box
  layerRotation: number
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const now = useEditorStore((s) => s.currentTime)
  const mask = maskAt(clip, editTimeFor(clip, now))
  if (!mask) return null

  const W = layer.width
  const H = layer.height
  const short = Math.min(W, H)
  const sized = mask.shape === 'circle' || mask.shape === 'rect'
  // Khung bao của mặt nạ (px màn hình, trong hệ trục đã xoay theo mặt nạ)
  const bw = sized ? mask.width * short : 0
  const bh = sized ? mask.height * short : mask.shape === 'mirror' ? mask.width * short : 0
  const far = Math.hypot(W, H) * 2

  /** Điểm trên màn hình → tọa độ trong lớp hình (0…W, 0…H), bỏ góc xoay của lớp. */
  const toLayer = (root: DOMRect, cx: number, cy: number): { x: number; y: number } => {
    const v = rot(cx - (root.left + layer.left + W / 2), cy - (root.top + layer.top + H / 2), -layerRotation)
    return { x: v.x + W / 2, y: v.y + H / 2 }
  }

  const onDown =
    (handle: Handle) =>
    (e: React.PointerEvent<HTMLElement>): void => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      pause()
      const root = (e.currentTarget.closest('.mask-overlay') as HTMLElement).getBoundingClientRect()
      const m0: ClipMask = { ...mask }
      const center = { x: m0.x * W, y: m0.y * H }
      /** Điểm trong hệ trục của mặt nạ (gốc ở tâm mặt nạ, đã bỏ góc xoay mặt nạ). */
      const toMask = (cx: number, cy: number): { x: number; y: number } => {
        const p = toLayer(root, cx, cy)
        return rot(p.x - center.x, p.y - center.y, -m0.rotation)
      }
      const start = toLayer(root, e.clientX, e.clientY)
      const u0 = toMask(e.clientX, e.clientY)
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
      const session = newSession(`mask-${handle}`)
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      let moved = false

      const move = (ev: PointerEvent): void => {
        if (!moved && Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) <= 2) return
        moved = true
        const p = toLayer(root, ev.clientX, ev.clientY)
        const u = toMask(ev.clientX, ev.clientY)
        const minSize = MIN_SIZE_PX / short
        const values: Partial<Record<MaskProp, number>> = {}
        switch (handle) {
          case 'move':
            values.maskX = m0.x + (p.x - start.x) / W
            values.maskY = m0.y + (p.y - start.y) / H
            break
          case 'e':
          case 'w':
            values.maskWidth = Math.max(minSize, (2 * Math.abs(u.x)) / short)
            break
          case 'n':
          case 's':
            // Cuộn phim: thanh trên/dưới đổi độ dày dải (lưu ở "width")
            if (mask.shape === 'mirror') values.maskWidth = Math.max(minSize, (2 * Math.abs(u.y)) / short)
            else values.maskHeight = Math.max(minSize, (2 * Math.abs(u.y)) / short)
            break
          case 'rotate': {
            const delta = ((Math.atan2(p.y - center.y, p.x - center.x) - startAngle) * 180) / Math.PI
            let r = wrapDeg(Math.round((m0.rotation + delta) * 10) / 10)
            const nearest = Math.round(r / 90) * 90
            if (!ev.altKey && Math.abs(r - nearest) <= ROTATE_SNAP_DEG) r = wrapDeg(nearest)
            values.maskRotation = r
            break
          }
          case 'feather':
            values.maskFeather = Math.round(Math.min(100, Math.max(0, m0.feather - (u.y - u0.y) * FEATHER_PER_PX)))
            break
          default: {
            // Góc: phóng to / thu nhỏ đều theo khoảng cách tới tâm
            const k = Math.hypot(u.x, u.y) / Math.max(4, Math.hypot(u0.x, u0.y))
            values.maskWidth = Math.max(minSize, m0.width * k)
            values.maskHeight = Math.max(minSize, m0.height * k)
          }
        }
        setMaskValues(clip.id, values, session)
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

  const at = (x: number, y: number): React.CSSProperties => ({ left: x, top: y })
  const edges: [Handle, number, number][] = sized
    ? [
        ['n', 0, -bh / 2],
        ['s', 0, bh / 2],
        ['w', -bw / 2, 0],
        ['e', bw / 2, 0]
      ]
    : mask.shape === 'mirror'
      ? [
          ['n', 0, -bh / 2],
          ['s', 0, bh / 2]
        ]
      : []
  const corners: [Handle, number, number][] = sized
    ? [
        ['nw', -bw / 2, -bh / 2],
        ['ne', bw / 2, -bh / 2],
        ['sw', -bw / 2, bh / 2],
        ['se', bw / 2, bh / 2]
      ]
    : []
  const radius = mask.shape === 'circle' ? '50%' : mask.shape === 'rect' ? (mask.roundness / 100) * (Math.min(bw, bh) / 2) : 0
  const cross = sized ? { w: bw, h: bh } : { w: 40, h: 40 }

  /** Lớp hình (đã xoay) → tâm mặt nạ (đã xoay theo mặt nạ). */
  const group = (children: React.ReactNode): React.JSX.Element => (
    <div className="mask-layer" style={{ ...layer, transform: layerRotation ? `rotate(${layerRotation}deg)` : undefined }}>
      <div className="mask-group" style={{ left: mask.x * W, top: mask.y * H, transform: `rotate(${mask.rotation}deg)` }}>
        {children}
      </div>
    </div>
  )

  return (
    <div className="mask-overlay" onPointerDown={onDown('move')}>
      {/* Viền + chữ thập: cắt theo khung Xem trước (đường của Tách / Cuộn phim rất dài) */}
      <div className="mask-clip">
        {group(
          <>
            {sized ? (
              <>
                <div className="mask-outline" style={{ left: -bw / 2, top: -bh / 2, width: bw, height: bh, borderRadius: radius }} />
                <div className="mask-bbox" style={{ left: -bw / 2, top: -bh / 2, width: bw, height: bh }} />
              </>
            ) : (
              <>
                <div className="mask-line" style={{ left: -far, top: -bh / 2, width: far * 2 }} />
                {mask.shape === 'mirror' && <div className="mask-line" style={{ left: -far, top: bh / 2, width: far * 2 }} />}
              </>
            )}
            {/* Chữ thập nét đứt ở tâm */}
            <div className="mask-cross h" style={{ left: -cross.w / 2, width: cross.w }} />
            <div className="mask-cross v" style={{ top: -cross.h / 2, height: cross.h }} />
          </>
        )}
      </div>
      {/* Núm kéo: không bị cắt, kể cả khi nằm ngoài mép khung */}
      {group(
        <>
          {edges.map(([h, x, y]) => (
            <div
              key={h}
              className={`mask-pill ${h === 'n' || h === 's' ? 'horizontal' : 'vertical'}`}
              style={at(x, y)}
              title={t('preview.maskSize')}
              onPointerDown={onDown(h)}
            />
          ))}
          {corners.map(([h, x, y]) => (
            <div key={h} className="mask-dot" style={at(x, y)} title={t('preview.maskScale')} onPointerDown={onDown(h)} />
          ))}
          <div
            className="mask-knob"
            style={at(0, -bh / 2 - FEATHER_GAP - mask.feather / FEATHER_PER_PX)}
            title={t('preview.maskFeather')}
            onPointerDown={onDown('feather')}
          >
            <svg
              viewBox="0 0 16 16"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7l4-4 4 4M4 13l4-4 4 4" />
            </svg>
          </div>
          <div className="mask-knob" style={at(0, bh / 2 + FEATHER_GAP)} title={t('preview.rotateHandle')} onPointerDown={onDown('rotate')}>
            <Icon name="rotate" size={13} />
          </div>
        </>
      )}
    </div>
  )
}
