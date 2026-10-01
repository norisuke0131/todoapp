// ストアの組み立て。ここを触ってよいのは lib/repo/ だけ（コンポーネントからは参照しない）
import type { StateStorage } from 'zustand/middleware'
import { browserStorage } from './storage'
import { createDataStore, type DataStore } from './data'
import { createSessionStore, type SessionStore } from './session'
import { createSettingsStore, type SettingsStore } from './settings'
import { createSyncStore, type SyncStore } from './sync'
import { createUiStore, type UiStore } from './ui'

export type Stores = {
  data: DataStore
  session: SessionStore
  settings: SettingsStore
  sync: SyncStore
  ui: UiStore
}

export function createStores(storage: () => StateStorage = browserStorage): Stores {
  return {
    data: createDataStore(storage),
    session: createSessionStore(storage),
    settings: createSettingsStore(storage),
    sync: createSyncStore(),
    ui: createUiStore(storage),
  }
}

let stores: Stores | undefined

export function getStores(): Stores {
  stores ??= createStores()
  return stores
}

/** テスト用：差し替え */
export function setStores(s: Stores | undefined): void {
  stores = s
}

export { selectData } from './data'
export type { EntityCollection } from './data'
export { DEFAULT_SETTINGS, type Settings } from './settings'
export { memoryStorage, STORAGE_PREFIX } from './storage'
