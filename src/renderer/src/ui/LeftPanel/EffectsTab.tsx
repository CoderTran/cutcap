// Tab "Hiệu ứng" (giống CapCut, nhưng mọi hiệu ứng đều miễn phí):
// lưới ô xem thử chia theo nhóm, rê chuột → hiệu ứng chuyển động, bấm → thêm vào timeline tại đầu phát.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EFFECT_CATEGORIES, EFFECTS, type EffectDef } from '@shared/render/effects'
import { EffectPainter } from '../../engine/effects/applyEffect'
import { addEffectAtPlayhead } from '../../state/effectActions'
import { Icon } from '../icons'

const THUMB_W = 192
const THUMB_H = 120
/** Thời điểm vẽ ô khi đứng yên (giây tính từ đầu hiệu ứng) – đa số hiệu ứng đã "lên hình" rõ. */
const STILL_T = 0.4

/** Cảnh mẫu tự vẽ (hoàng hôn, núi, nhà) – không cần ảnh có bản quyền. Vẽ 1 lần, dùng chung. */
let sample: OffscreenCanvas | null = null
function sampleScene(): OffscreenCanvas {
  if (sample) return sample
  const c = new OffscreenCanvas(THUMB_W, THUMB_H)
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, THUMB_H)
  sky.addColorStop(0, '#2b3a8c')
  sky.addColorStop(0.55, '#e0607e')
  sky.addColorStop(1, '#f7b267')
  g.fillStyle = sky
  g.fillRect(0, 0, THUMB_W, THUMB_H)
  g.fillStyle = '#ffe08a'
  g.beginPath()
  g.arc(THUMB_W * 0.68, THUMB_H * 0.55, THUMB_H * 0.16, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#3d2c5a'
  g.beginPath()
  g.moveTo(0, THUMB_H * 0.8)
  g.lineTo(THUMB_W * 0.25, THUMB_H * 0.52)
  g.lineTo(THUMB_W * 0.5, THUMB_H * 0.78)
  g.lineTo(THUMB_W * 0.78, THUMB_H * 0.6)
  g.lineTo(THUMB_W, THUMB_H * 0.82)
  g.lineTo(THUMB_W, THUMB_H)
  g.lineTo(0, THUMB_H)
  g.fill()
  // Dãy nhà phía trước (cửa sổ sáng) – để thấy rõ hiệu ứng gương / chia màn hình
  const blocks = [[0.05, 0.3], [0.17, 0.42], [0.31, 0.26], [0.86, 0.36]]
  for (const [x, h] of blocks) {
    g.fillStyle = '#1b1530'
    g.fillRect(x * THUMB_W, THUMB_H * (1 - h), THUMB_W * 0.11, THUMB_H * h)
    g.fillStyle = '#ffd36e'
    for (let wy = THUMB_H * (1 - h) + 5; wy < THUMB_H - 6; wy += 9) g.fillRect(x * THUMB_W + 4, wy, 4, 4)
  }
  sample = c
  return c
}

const painter = new EffectPainter()

function EffectThumb({ def }: { def: EffectDef }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx) return
    const draw = (t: number): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(sampleScene(), 0, 0)
      painter.apply(ctx, def, THUMB_W, THUMB_H, t)
    }
    if (!hover) {
      draw(STILL_T)
      return
    }
    // Rê chuột: chạy hiệu ứng từ đầu, lặp mỗi 3 giây (= độ dài mặc định của clip hiệu ứng)
    const t0 = performance.now()
    let raf = 0
    const loop = (now: number): void => {
      draw(((now - t0) / 1000) % 3)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [def, hover])

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

export function EffectsTab(): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const name = (id: string): string => t(`effects.names.${id}`)

  const groups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi')
    return EFFECT_CATEGORIES.map((cat) => ({
      cat,
      items: EFFECTS.filter((e) => e.category === cat && (!q || name(e.id).toLocaleLowerCase('vi').includes(q)))
    })).filter((g) => g.items.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, t])

  return (
    <div className="left-scroll">
      <label className="search-box">
        <Icon name="search" size={14} />
        <input type="search" placeholder={t('effects.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <p className="hint">{t('effects.hint')}</p>
      {groups.length === 0 && <p className="hint">{t('effects.noMatch')}</p>}
      {groups.map(({ cat, items }) => (
        <section key={cat} className="effect-group">
          <h3 className="left-heading">{t(`effects.categories.${cat}`)}</h3>
          <div className="preset-grid">
            {items.map((def) => (
              <button key={def.id} className="preset-tile" title={t('effects.addHint')} onClick={() => addEffectAtPlayhead(def.id)}>
                <EffectThumb def={def} />
                <span className="tile-add">
                  <Icon name="plus" size={13} />
                </span>
                <span className="preset-name">{name(def.id)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
