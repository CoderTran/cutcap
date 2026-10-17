// Tab "Hiệu ứng động" (giống CapCut): Vào | Ra | Kết hợp – lưới ô xem thử + thanh thời lượng.
// Ô xem thử: cảnh mẫu thu nhỏ chuyển động đúng như hiệu ứng (dùng chung clipAnimAt với preview).
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaAsset, MediaClip } from '@shared/project/schema'
import { MICROS_PER_SECOND } from '@shared/project/time'
import { animIds, clipAnimAt, type AnimKind } from '@shared/render/clipAnims'
import { createMediaClip } from '@shared/timeline/clips'
import { THUMB_H, THUMB_W, sampleScene } from '../../engine/effects/sampleScene'
import { MIN_ANIM_US, maxAnimUs, setClipAnim, setClipAnimDuration } from '../../state/animActions'
import { Icon } from '../icons'
import { ComboRangeSlider } from './ComboRangeSlider'
import { SliderField } from './SliderField'

const KINDS: AnimKind[] = ['in', 'out', 'combo']
const FIELD = { in: 'animIn', out: 'animOut', combo: 'animCombo' } as const
const DEMO_ASSET: MediaAsset = {
  id: 'demo',
  kind: 'image',
  path: '',
  name: '',
  durationUs: 0,
  width: 16,
  height: 10,
  fps: null,
  hasAudio: false
}

/** Clip giả để vẽ ô xem thử: 1 giây, hiệu ứng chiếm 0.8 giây (Kết hợp: 0.4 giây vào + 0.4 giây ra). */
function demoClip(kind: AnimKind, id: string): MediaClip {
  const anim = { id, duration: kind === 'combo' ? 400_000 : 800_000 }
  return {
    ...createMediaClip(DEMO_ASSET, 0),
    duration: 1_000_000,
    animIn: kind === 'in' ? anim : null,
    animOut: kind === 'out' ? anim : null,
    animCombo: kind === 'combo' ? anim : null
  }
}

function AnimThumb({ kind, id }: { kind: AnimKind; id: string | null }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    const ctx = ref.current?.getContext('2d', { alpha: false })
    if (!ctx) return
    const clip = id ? demoClip(kind, id) : null
    const draw = (localUs: number): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#0c0d0f'
      ctx.fillRect(0, 0, THUMB_W, THUMB_H)
      if (!clip) {
        // Ô "Không có": vòng tròn gạch chéo
        ctx.strokeStyle = '#8d8e96'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(THUMB_W / 2, THUMB_H / 2, 22, 0, Math.PI * 2)
        ctx.moveTo(THUMB_W / 2 - 15, THUMB_H / 2 + 15)
        ctx.lineTo(THUMB_W / 2 + 15, THUMB_H / 2 - 15)
        ctx.stroke()
        return
      }
      const a = clipAnimAt(clip, localUs)
      const s = 0.62 * a.scale
      ctx.globalAlpha = a.alpha
      ctx.translate(THUMB_W / 2 + a.dx * THUMB_W, THUMB_H / 2 + a.dy * THUMB_H)
      ctx.rotate((a.rot * Math.PI) / 180)
      ctx.scale(s * a.sx, s)
      ctx.drawImage(sampleScene(), -THUMB_W / 2, -THUMB_H / 2)
    }
    // Đứng yên: vẽ ở giữa hiệu ứng để thấy khác nhau; rê chuột: chạy lặp (có nghỉ 0.4 giây)
    if (!hover || !clip) {
      draw(kind === 'out' ? 600_000 : kind === 'combo' ? 200_000 : 400_000)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const loop = (now: number): void => {
      const cycle = ((now - t0) / 1000) % 1.4
      draw(Math.min(999_999, cycle * MICROS_PER_SECOND))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [kind, id, hover])

  return (
    <canvas
      ref={ref}
      className="preset-thumb effect-thumb"
      width={THUMB_W}
      height={THUMB_H}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    />
  )
}

export function AnimationPanel({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const [kind, setKind] = useState<AnimKind>('in')
  const current = clip[FIELD[kind]]
  const seconds = (us: number): string => `${(us / MICROS_PER_SECOND).toFixed(1)}s`
  const max = maxAnimUs(clip, kind)

  return (
    <div className="form">
      {disabled && <p className="hint">🔒 {t('clip.locked')}</p>}
      <div className="segmented anim-kinds">
        {KINDS.map((k) => (
          <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
            {t(`anim.kinds.${k}`)}
            {clip[FIELD[k]] && <span className="anim-dot" />}
          </button>
        ))}
      </div>

      <div className="preset-grid anim-grid">
        <button className={`preset-tile ${!current ? 'active' : ''}`} disabled={disabled} onClick={() => setClipAnim(clip.id, kind, null)}>
          <AnimThumb kind={kind} id={null} />
          <span className="preset-name">{t('anim.none')}</span>
        </button>
        {animIds(kind).map((id) => (
          <button
            key={id}
            className={`preset-tile ${current?.id === id ? 'active' : ''}`}
            disabled={disabled}
            title={t('anim.pickHint')}
            onClick={() => setClipAnim(clip.id, kind, id)}
          >
            <AnimThumb kind={kind} id={id} />
            {current?.id === id && (
              <span className="tile-add anim-check">
                <Icon name="check" size={13} />
              </span>
            )}
            <span className="preset-name">{t(`anim.names.${kind}.${id}`)}</span>
          </button>
        ))}
      </div>

      {current && (
        <section className="inspector-section">
          {kind === 'combo' ? (
            <ComboRangeSlider clip={clip} disabled={disabled} help={t('anim.hint.combo')} />
          ) : (
            <SliderField
              label={t('anim.duration')}
              display={seconds(current.duration)}
              value={current.duration}
              min={MIN_ANIM_US}
              max={Math.max(MIN_ANIM_US + 1, Math.min(max, 5 * MICROS_PER_SECOND))}
              step={MICROS_PER_SECOND / 10}
              disabled={disabled}
              onChange={(v, s) => setClipAnimDuration(clip.id, kind, v, s)}
              help={t(`anim.hint.${kind}`)}
            />
          )}
        </section>
      )}
    </div>
  )
}
