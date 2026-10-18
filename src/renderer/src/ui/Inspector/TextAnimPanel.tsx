// Bảng phải → chữ → "Hiệu ứng động" (giống CapCut): Vào | Ra | Vòng lặp – lưới ô chạy thử + thời lượng / tốc độ.
// Ô chạy thử vẽ "ABC123" bằng ĐÚNG hàm vẽ chữ của khung Xem trước (rê chuột → chạy hiệu ứng).
// Bấm ô → gắn cho chữ đang chọn và phát thử đoạn có hiệu ứng trên khung Xem trước.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextClip } from '@shared/project/schema'
import { MICROS_PER_SECOND } from '@shared/project/time'
import {
  DEFAULT_TEXT_ANIM_US,
  DEFAULT_TEXT_LOOP_US,
  textAnimIds,
  textAnimSpans,
  textInOf,
  type TextAnimKind
} from '@shared/render/textAnims'
import { clipEnd, createTextClip } from '@shared/timeline/clips'
import { drawTextClip } from '../../engine/text/drawText'
import { useFavorites } from '../../state/favoritesStore'
import { editorStore } from '../../state/editorStore'
import { playRange } from '../../state/playbackActions'
import { setTextAnim } from '../../state/textActions'
import { FavoriteFilter, FavoriteStar } from '../Favorites'
import { Icon } from '../icons'
import { SliderField } from './SliderField'

const KINDS: TextAnimKind[] = ['in', 'out', 'loop']
const S = MICROS_PER_SECOND

// ───────── Ô chạy thử ─────────

const THUMB_W = 120
const THUMB_H = 68
/** Clip mẫu dài 1.6 s: Vào 0.8 s / Ra 0.8 s / Vòng lặp chu kỳ 0.8 s. */
const DEMO_US = 1.6 * S
const DEMO_ANIM_US = 0.8 * S

function demoClip(kind: TextAnimKind, id: string | null): TextClip {
  const base = createTextClip(0, 'ABC123')
  return {
    ...base,
    duration: DEMO_US,
    style: { ...base.style, fontSize: 290, strokeWidth: 3 },
    textIn: kind === 'in' && id ? { id, duration: DEMO_ANIM_US } : null,
    textOut: kind === 'out' && id ? { id, duration: DEMO_ANIM_US } : null,
    textLoop: kind === 'loop' && id ? { id, period: DEMO_ANIM_US } : null
  }
}

/** Thời điểm vẽ ô khi đứng yên: giữa đoạn hiệu ứng (nhận ra được hiệu ứng là gì). */
function stillAt(kind: TextAnimKind): number {
  return kind === 'in' ? DEMO_ANIM_US * 0.55 : kind === 'out' ? DEMO_US - DEMO_ANIM_US * 0.55 : DEMO_ANIM_US * 0.3
}

function AnimThumb({ kind, id }: { kind: TextAnimKind; id: string | null }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState(false)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const clip = demoClip(kind, id)
    const draw = (t: number): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, THUMB_W, THUMB_H)
      drawTextClip(ctx, clip, THUMB_W, THUMB_H, t)
    }
    if (!hover || !id) {
      draw(id ? stillAt(kind) : DEMO_US / 2)
      return
    }
    // Rê chuột: chạy lặp – Vào: từ đầu clip; Ra: đoạn cuối clip; Vòng lặp: chạy liên tục
    const t0 = performance.now()
    let raf = 0
    const loop = (now: number): void => {
      const e = ((now - t0) * 1000) % (DEMO_US + 0.4 * S)
      draw(kind === 'out' ? Math.min(DEMO_US - 1, DEMO_US - DEMO_ANIM_US - 0.3 * S + e) : Math.min(DEMO_US - 1, e))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [kind, id, hover])
  return (
    <canvas
      ref={ref}
      className="preset-thumb text-anim-thumb"
      width={THUMB_W}
      height={THUMB_H}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    />
  )
}

// ───────── Bảng ─────────

export function TextAnimPanel({ clip, disabled }: { clip: TextClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const [kind, setKind] = useState<TextAnimKind>('in')
  const [onlyFavs, setOnlyFavs] = useState(false)
  const favs = useFavorites('anim')
  const prefix = `text-${kind}:`
  const kindFavs = favs.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length))
  const all = textAnimIds(kind)
  const ids = onlyFavs ? kindFavs.filter((id) => all.includes(id)) : all

  const current = kind === 'in' ? textInOf(clip) : kind === 'out' ? (clip.textOut ?? null) : (clip.textLoop ?? null)
  const has = { in: !!textInOf(clip), out: !!clip.textOut, loop: !!clip.textLoop }

  /** Phát thử đoạn có hiệu ứng trên khung Xem trước. */
  const preview = (c: TextClip): void => {
    const { inUs, outUs } = textAnimSpans(c)
    const pad = 0.3 * S
    if (kind === 'in') playRange(c.start, Math.min(c.duration, inUs + pad))
    else if (kind === 'out') playRange(Math.max(c.start, clipEnd(c) - outUs - pad), Math.min(c.duration, outUs + pad))
    else if (c.textLoop) {
      const from = Math.min(Math.max(editorStore.getState().currentTime, c.start + inUs), clipEnd(c) - 1)
      playRange(from, Math.min(clipEnd(c) - from, c.textLoop.period * 2))
    }
  }

  const choose = (id: string | null): void => {
    if (kind === 'loop') {
      const v = id ? { id, period: clip.textLoop?.period ?? DEFAULT_TEXT_LOOP_US } : null
      setTextAnim(clip.id, 'loop', v)
      if (v) preview({ ...clip, textLoop: v })
      return
    }
    const old = kind === 'in' ? textInOf(clip) : clip.textOut
    const v = id ? { id, duration: old?.duration ?? DEFAULT_TEXT_ANIM_US } : null
    setTextAnim(clip.id, kind, v)
    if (v) preview(kind === 'in' ? { ...clip, textIn: v, animationIn: 'none' } : { ...clip, textOut: v })
  }

  const maxUs = Math.max(0.2 * S, Math.min(10 * S, clip.duration))

  return (
    <div className="form">
      {disabled && <p className="hint">🔒 {t('clip.locked')}</p>}
      <div className="segmented anim-kinds">
        {KINDS.map((k) => (
          <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
            {t(`textAnim.kinds.${k}`)}
            {has[k] && <span className="anim-dot" />}
          </button>
        ))}
      </div>
      <FavoriteFilter only={onlyFavs} count={kindFavs.length} onChange={setOnlyFavs} />
      {onlyFavs && ids.length === 0 && <p className="hint">{t('favorites.empty')}</p>}

      <div className="preset-grid anim-grid text-anim-grid">
        {!onlyFavs && (
          <button className={`preset-tile ${!current ? 'active' : ''}`} disabled={disabled} onClick={() => choose(null)}>
            <span className="preset-thumb text-anim-thumb text-anim-none">
              <Icon name="ban" size={20} />
            </span>
            <span className="preset-name">{t('anim.none')}</span>
          </button>
        )}
        {ids.map((id) => (
          <button
            key={id}
            className={`preset-tile ${current?.id === id ? 'active' : ''}`}
            disabled={disabled}
            title={t(`textAnim.${kind}.${id}`)}
            onClick={() => choose(id)}
          >
            <AnimThumb kind={kind} id={id} />
            {current?.id === id && (
              <span className="tile-add anim-check">
                <Icon name="check" size={13} />
              </span>
            )}
            <FavoriteStar kind="anim" id={`${prefix}${id}`} />
            <span className="preset-name">{t(`textAnim.${kind}.${id}`)}</span>
          </button>
        ))}
      </div>

      {current && (
        <section className="inspector-section">
          {kind === 'loop' && clip.textLoop ? (
            <SliderField
              label={t('textAnim.speed')}
              display={`${(clip.textLoop.period / S).toFixed(1)}s`}
              value={clip.textLoop.period}
              min={0.2 * S}
              max={5 * S}
              step={S / 10}
              disabled={disabled}
              onChange={(v, s) => setTextAnim(clip.id, 'loop', { id: clip.textLoop!.id, period: v }, s)}
              onReset={() => setTextAnim(clip.id, 'loop', { id: clip.textLoop!.id, period: DEFAULT_TEXT_LOOP_US })}
              help={t('textAnim.speedHint')}
            />
          ) : (
            current &&
            'duration' in current && (
              <SliderField
                label={t('anim.duration')}
                display={`${(current.duration / S).toFixed(1)}s`}
                value={Math.min(current.duration, maxUs)}
                min={0.1 * S}
                max={maxUs}
                step={S / 10}
                disabled={disabled}
                onChange={(v, s) => setTextAnim(clip.id, kind, { id: current.id, duration: v }, s)}
                onReset={() => setTextAnim(clip.id, kind, { id: current.id, duration: DEFAULT_TEXT_ANIM_US })}
              />
            )
          )}
        </section>
      )}
    </div>
  )
}
