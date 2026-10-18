// Yêu thích (★): danh sách dùng chung cho mọi dự án, lưu ở máy (main/ipc/favoritesHandlers.ts).
// Nạp 1 lần khi mở app; bấm ★ → đổi ngay trên giao diện rồi ghi xuống file.
import { createStore, useStore } from 'zustand'
import { emptyFavorites, toggleFavoriteIn, type FavoriteKind, type Favorites } from '@shared/favorites'

const favoritesStore = createStore<{ favs: Favorites; loaded: boolean }>()(() => ({ favs: emptyFavorites(), loaded: false }))

let loading: Promise<void> | null = null
export function loadFavorites(): Promise<void> {
  loading ??= window.cutcap
    .favoritesGet()
    .then((favs) => favoritesStore.setState({ favs, loaded: true }))
    .catch(() => favoritesStore.setState({ loaded: true }))
  return loading
}

/** Danh sách yêu thích của một loại (mới thêm trước). */
export function useFavorites(kind: FavoriteKind): string[] {
  return useStore(favoritesStore, (s) => s.favs[kind])
}

export function useIsFavorite(kind: FavoriteKind, id: string): boolean {
  return useStore(favoritesStore, (s) => s.favs[kind].includes(id))
}

export function toggleFavorite(kind: FavoriteKind, id: string): void {
  const favs = toggleFavoriteIn(favoritesStore.getState().favs, kind, id)
  favoritesStore.setState({ favs })
  void window.cutcap.favoritesSave(favs)
}
