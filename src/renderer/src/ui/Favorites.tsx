// Nút ★ Yêu thích (góc ô / cuối dòng) và hàng chọn "Tất cả | ★ Yêu thích" đầu mỗi danh sách.
import { useTranslation } from 'react-i18next'
import type { FavoriteKind } from '@shared/favorites'
import { toggleFavorite, useIsFavorite } from '../state/favoritesStore'

/**
 * Ngôi sao bật / tắt yêu thích. Nằm TRONG nút của ô (không lồng <button> trong <button>) nên là <span role="button">,
 * và chặn sự kiện để bấm sao không kích hoạt ô.
 */
export function FavoriteStar({ kind, id, className = '' }: { kind: FavoriteKind; id: string; className?: string }): React.JSX.Element {
  const { t } = useTranslation()
  const on = useIsFavorite(kind, id)
  const toggle = (e: React.SyntheticEvent): void => {
    e.stopPropagation()
    e.preventDefault()
    toggleFavorite(kind, id)
  }
  return (
    <span
      role="button"
      tabIndex={0}
      className={`fav-star ${on ? 'on' : ''} ${className}`}
      title={on ? t('favorites.remove') : t('favorites.add')}
      aria-pressed={on}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={(e) => e.stopPropagation()}
      onClick={toggle}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(e)}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
      </svg>
    </span>
  )
}

/** Hàng chọn "Tất cả | ★ Yêu thích (n)". */
export function FavoriteFilter({
  only,
  count,
  onChange
}: {
  only: boolean
  count: number
  onChange: (only: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="segmented fav-filter">
      <button className={!only ? 'active' : ''} onClick={() => onChange(false)}>
        {t('favorites.all')}
      </button>
      <button className={only ? 'active' : ''} onClick={() => onChange(true)}>
        ★ {t('favorites.title')}
        {count > 0 && <small> {count}</small>}
      </button>
    </div>
  )
}
