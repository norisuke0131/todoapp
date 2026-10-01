// デモ用のセッション（ロール切替 / F-C01）
import { persist } from 'zustand/middleware'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { StateStorage } from 'zustand/middleware'
import type { Role } from '@/lib/types'
import { jsonStorage, STORAGE_PREFIX } from './storage'

export type SessionState = {
  role: Role
  /** 現場担当のときの担当拠点（東京／大阪） */
  staffWarehouseId: string
  setRole(role: Role): void
  setStaffWarehouse(id: string): void
}

export type SessionStore = StoreApi<SessionState>

export function createSessionStore(storage: () => StateStorage): SessionStore {
  return createStore<SessionState>()(
    persist(
      (set) => ({
        role: 'keeper',
        staffWarehouseId: 'wh-tokyo',
        setRole: (role) => set({ role }),
        setStaffWarehouse: (staffWarehouseId) => set({ staffWarehouseId }),
      }),
      { name: `${STORAGE_PREFIX}session`, storage: jsonStorage(storage), version: 1 },
    ),
  )
}
