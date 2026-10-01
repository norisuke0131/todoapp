// オフライン同期の状態（FR-316 は Phase 5 で実装。ここでは状態の器だけ用意する）
import { createStore, type StoreApi } from 'zustand/vanilla'

export type SyncState = { online: boolean; pendingCount: number; setOnline(v: boolean): void }
export type SyncStore = StoreApi<SyncState>

export function createSyncStore(): SyncStore {
  return createStore<SyncState>()((set) => ({
    online: true,
    pendingCount: 0,
    setOnline: (online) => set({ online }),
  }))
}
