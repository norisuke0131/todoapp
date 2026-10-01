// 画面の好み（サイドバーの折りたたみ・行の高さ・ガイドツアー）
import { persist } from 'zustand/middleware'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { StateStorage } from 'zustand/middleware'
import { jsonStorage, STORAGE_PREFIX } from './storage'

export type UiState = {
  sidebarCollapsed: boolean
  density: 'standard' | 'compact'
  tourDismissed: boolean
  set(patch: Partial<Omit<UiState, 'set'>>): void
}
export type UiStore = StoreApi<UiState>

export function createUiStore(storage: () => StateStorage): UiStore {
  return createStore<UiState>()(
    persist(
      (set) => ({
        sidebarCollapsed: false,
        density: 'standard',
        tourDismissed: false,
        set: (patch) => set(patch),
      }),
      { name: `${STORAGE_PREFIX}ui`, storage: jsonStorage(storage), version: 1 },
    ),
  )
}
