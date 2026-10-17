// Màn hình đang hiện: Trang chủ (danh sách dự án) hay trình chỉnh sửa.
import { createStore, useStore } from 'zustand'

export type AppView = 'home' | 'editor'

export interface AppState {
  view: AppView
  setView(view: AppView): void
}

export const appStore = createStore<AppState>()((set) => ({
  view: 'home',
  setView: (view) => set({ view })
}))

export function useAppStore<T>(selector: (s: AppState) => T): T {
  return useStore(appStore, selector)
}
