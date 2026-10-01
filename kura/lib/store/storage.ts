// 永続化先。ブラウザでは localStorage、テストや SSR ではメモリ
import { createJSONStorage, type StateStorage } from 'zustand/middleware'

export function memoryStorage(): StateStorage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  }
}

export function browserStorage(): StateStorage {
  if (typeof window === 'undefined') return memoryStorage()
  try {
    const probe = '__kura_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    // プライベートブラウズ等で使えない場合はメモリに退避（リロードで消える）
    return memoryStorage()
  }
}

export const jsonStorage = (s: () => StateStorage) => createJSONStorage(s)

export const STORAGE_PREFIX = 'kura:v1:'
