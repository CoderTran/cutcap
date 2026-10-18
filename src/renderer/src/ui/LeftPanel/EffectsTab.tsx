// Tab "Hiệu ứng" (giống CapCut, nhưng mọi hiệu ứng đều miễn phí):
// lưới ô xem thử chia theo nhóm, rê chuột → hiệu ứng chuyển động, bấm → thêm vào timeline tại đầu phát.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EFFECT_CATEGORIES, EFFECTS, type EffectDef } from '@shared/render/effects'
import { EffectPainter } from '../../engine/effects/applyEffect'
import { THUMB_H, THUMB_W, sampleScene } from '../../engine/effects/sampleScene'
import { createEffectClip } from '@shared/timeline/clips'
import { addEffectAtPlayhead } from '../../state/effectActions'
import { editorStore } from '../../state/editorStore'
import { useFavorites } from '../../state/favoritesStore'
import { FavoriteFilter, FavoriteStar } from '../Favorites'
import { HelpTip } from '../HelpTip'
import { TileAdd } from '../TileAdd'
import { Icon } from '../icons'

/**
 * Thời điểm vẽ ô khi đứng yên (giây tính từ đầu hiệu ứng): hiệu ứng đã "lên hình" rõ nhưng không rơi
 * đúng lúc chớp trắng / chớp tối (vd. Đèn nháy flash chớp ở 0.0, 0.4, 0.8… → 0.37 nằm giữa 2 lần chớp).
 */
const STILL_T = 0.37

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
  const [onlyFavs, setOnlyFavs] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const favs = useFavorites('effect')
  // Rời tab → bỏ bản xem thử
  useEffect(() => () => editorStore.getState().setTilePreview(null), [])
  /** Bấm 1 lần: chọn + xem thử trên khung Xem trước (bấm lại = bỏ chọn). */
  const pick = (id: string): void => {
    const off = picked === id
    setPicked(off ? null : id)
    editorStore.getState().setTilePreview(off ? null : { kind: 'clip', clip: createEffectClip(0, id) })
  }
  const add = (id: string): void => {
    setPicked(null)
    addEffectAtPlayhead(id)
  }
  const name = (id: string): string => t(`effects.names.${id}`)

  const groups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi')
    const match = (e: EffectDef): boolean => !q || name(e.id).toLocaleLowerCase('vi').includes(q)
    // ★ Yêu thích: một nhóm duy nhất, theo thứ tự đánh dấu (mới trước)
    if (onlyFavs) {
      const items = favs.map((id) => EFFECTS.find((e) => e.id === id)).filter((e): e is EffectDef => !!e && match(e))
      return items.length > 0 ? [{ cat: 'favorites', items }] : []
    }
    return EFFECT_CATEGORIES.map((cat) => ({ cat: cat as string, items: EFFECTS.filter((e) => e.category === cat && match(e)) })).filter(
      (g) => g.items.length > 0
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, t, onlyFavs, favs])

  return (
    <div className="left-scroll">
      <div className="search-row">
        <label className="search-box">
          <Icon name="search" size={14} />
          <input type="search" placeholder={t('effects.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <HelpTip text={t('effects.hint')} />
      </div>
      <FavoriteFilter only={onlyFavs} count={favs.length} onChange={setOnlyFavs} />
      {groups.length === 0 && <p className="hint">{onlyFavs && !query ? t('favorites.empty') : t('effects.noMatch')}</p>}
      {groups.map(({ cat, items }) => (
        <section key={cat} className="effect-group">
          <h3 className="left-heading">{cat === 'favorites' ? `★ ${t('favorites.title')}` : t(`effects.categories.${cat}`)}</h3>
          <div className="preset-grid">
            {items.map((def) => (
              <button
                key={def.id}
                className={`preset-tile ${picked === def.id ? 'active' : ''}`}
                title={t('effects.addHint')}
                // Bấm 1 lần: chọn ô; bấm đúp hoặc bấm + : thêm vào timeline (giống CapCut)
                onClick={() => pick(def.id)}
                onDoubleClick={() => add(def.id)}
              >
                <EffectThumb def={def} />
                <TileAdd title={t('effects.addHint')} onAdd={() => add(def.id)} />
                <span className="preset-name">{name(def.id)}</span>
                <FavoriteStar kind="effect" id={def.id} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
