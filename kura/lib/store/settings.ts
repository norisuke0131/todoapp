// 業務設定（FR-409, FR-510, FR-611 の土台）
import { persist } from 'zustand/middleware'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { StateStorage } from 'zustand/middleware'
import { jsonStorage, STORAGE_PREFIX } from './storage'

export type Settings = {
  /** 何日出庫がなければ滞留とみなすか */
  idleThresholdDays: number
  /** 期限切れロットを在庫に含めるか（FR-510） */
  includeExpiredInStock: boolean
  /** カウントした本人による単独承認を禁止するか（FR-409） */
  forbidSelfApproval: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  idleThresholdDays: 90,
  includeExpiredInStock: true,
  forbidSelfApproval: true,
}

export type SettingsState = Settings & { update(patch: Partial<Settings>): void; reset(): void }
export type SettingsStore = StoreApi<SettingsState>

export function createSettingsStore(storage: () => StateStorage): SettingsStore {
  return createStore<SettingsState>()(
    persist(
      (set) => ({
        ...DEFAULT_SETTINGS,
        update: (patch) => set(patch),
        reset: () => set(DEFAULT_SETTINGS),
      }),
      { name: `${STORAGE_PREFIX}settings`, storage: jsonStorage(storage), version: 1 },
    ),
  )
}
