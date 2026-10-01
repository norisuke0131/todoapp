// リポジトリ共通の入口。全メソッドはここから「データ・スコープ・現在時刻・在庫インデックス」を受け取る
import type { Result } from '@/lib/types'
import { buildIndex, memoByGeneration, type InventoryIndex, type Memo } from '@/lib/inventory'
import { getStores, selectData } from '@/lib/store'
import type { SeedData } from '@/lib/seed'
import { nowIso } from '@/lib/utils/clock'
import { resolveScope, type Scope } from './_scope'

export type Ctx = {
  data: SeedData
  scope: Scope
  now: string
  generation: number
  /** 在庫インデックス（世代ごとにメモ化 / INV-04） */
  index(): InventoryIndex
}

// 在庫インデックスのメモはストアごとに持つ（INV-04：キーは世代番号）
const indexMemos = new WeakMap<object, Memo<SeedData, InventoryIndex>>()
function indexMemoFor(store: object): Memo<SeedData, InventoryIndex> {
  let m = indexMemos.get(store)
  if (!m) indexMemos.set(store, (m = memoByGeneration((data: SeedData) => buildIndex(data))))
  return m
}

export function ctx(): Ctx {
  const stores = getStores()
  const now = nowIso()
  stores.data.getState().ensureAnchor(now)
  const state = stores.data.getState()
  const data = selectData(state)
  if (!data) throw new Error('データの初期化に失敗しました')
  const session = stores.session.getState()
  const scope = resolveScope(session, data.users, data.warehouses)
  return {
    data,
    scope,
    now,
    generation: state.generation,
    index: () => indexMemoFor(stores.data).get(state.generation, data),
  }
}

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
export const err = <T = never>(error: string): Result<T> => ({ ok: false, error })

/** 例外を Result に包む（リポジトリの戻り値を統一する） */
export async function run<T>(fn: () => Result<T> | Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn()
  } catch (e) {
    return err(e instanceof Error ? e.message : '不明なエラーが発生しました')
  }
}

export function newId(prefix: string): string {
  const rand = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0')
  return `${prefix}-${Date.now().toString(36)}${rand}`
}

/** UI の購読用：データ・ロール・設定のどれかが変わったら通知する */
export function subscribe(listener: () => void): () => void {
  const s = getStores()
  const unsubs = [
    s.data.subscribe(listener),
    s.session.subscribe(listener),
    s.settings.subscribe(listener),
    s.ui.subscribe(listener),
  ]
  return () => unsubs.forEach((u) => u())
}
