// 業務データのストア（Zustand + persist）
//
// ★ 在庫数量は保存しない（INV-01）。保存するのは「シードに対する差分」だけ：
//    ・anchor     … シードを生成した基準日時（同じ anchor なら同じシードが再生成される）
//    ・txns       … ユーザーが追加したトランザクション（追加のみ。削除・編集の操作はない / INV-02, INV-03）
//    ・upserts    … 引当・発注・移動・棚卸・マスタなど、状態を持つ実体の追加・更新
// ・generation … 変更のたびに +1。在庫算出のメモ化キー（INV-04）
import { persist } from 'zustand/middleware'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { StateStorage } from 'zustand/middleware'
import type { AuditLog, Transaction, TransactionDraft } from '@/lib/types'
import { generateSeed, type SeedData } from '@/lib/seed'
import { jsonStorage, STORAGE_PREFIX } from './storage'

/** 差分で上書きできる実体のコレクション名 */
export type EntityCollection =
  | 'items'
  | 'lots'
  | 'allocations'
  | 'purchaseOrders'
  | 'shippingOrders'
  | 'transfers'
  | 'stocktakes'
  | 'views'
  | 'partners'
  | 'locations'
  | 'users'
  | 'categories'
  | 'reasonCodes'

type Entity<C extends EntityCollection> = SeedData[C][number]

export type DataState = {
  anchor?: string
  generation: number
  txns: Transaction[]
  upserts: { [C in EntityCollection]?: Record<string, Entity<C>> }
  deleted: { [C in EntityCollection]?: string[] }
  auditLogs: AuditLog[]
}

export type DataActions = {
  /** シードの基準日時を決める（初回のみ） */
  ensureAnchor(now: string): void
  /** ★ 在庫を変える唯一の方法（INV-02）。seq・id・createdAt はここで採番する */
  appendTxns(drafts: TransactionDraft[], createdAt: string): Transaction[]
  upsert<C extends EntityCollection>(collection: C, entity: Entity<C>): void
  remove(collection: EntityCollection, id: string): void
  appendAudit(log: AuditLog): void
  reset(): void
}

export type DataStore = StoreApi<DataState & DataActions>

const initial = (): DataState => ({ generation: 0, txns: [], upserts: {}, deleted: {}, auditLogs: [] })

export function createDataStore(storage: () => StateStorage): DataStore {
  return createStore<DataState & DataActions>()(
    persist(
      (set, get) => ({
        ...initial(),
        ensureAnchor(now) {
          if (!get().anchor) set({ anchor: now, generation: get().generation + 1 })
        },
        appendTxns(drafts, createdAt) {
          const state = get()
          const base = lastSeq(state)
          const created = drafts.map((d, i): Transaction => {
            const seq = base + i + 1
            return { ...d, id: `txn-u${String(seq).padStart(6, '0')}`, seq, createdAt }
          })
          set({ txns: [...state.txns, ...created], generation: state.generation + 1 })
          return created
        },
        upsert(collection, entity) {
          const state = get()
          const map = { ...(state.upserts[collection] ?? {}), [entity.id]: entity }
          set({ upserts: { ...state.upserts, [collection]: map }, generation: state.generation + 1 })
        },
        remove(collection, id) {
          const state = get()
          const list = [...(state.deleted[collection] ?? []), id]
          set({ deleted: { ...state.deleted, [collection]: list }, generation: state.generation + 1 })
        },
        appendAudit(log) {
          set({ auditLogs: [...get().auditLogs, log], generation: get().generation + 1 })
        },
        reset() {
          set({ ...initial(), generation: get().generation + 1 })
        },
      }),
      {
        name: `${STORAGE_PREFIX}data`,
        storage: jsonStorage(storage),
        version: 1,
        partialize: (s) => ({
          anchor: s.anchor,
          generation: s.generation,
          txns: s.txns,
          upserts: s.upserts,
          deleted: s.deleted,
          auditLogs: s.auditLogs,
        }),
      },
    ),
  )
}

// ---------------------------------------------------------------------------
// 差分の適用：シード + 差分 = 現在のデータ（世代ごとにキャッシュ）
// ---------------------------------------------------------------------------

const seedCache = new Map<string, SeedData>()
function seedFor(anchor: string): SeedData {
  let s = seedCache.get(anchor)
  if (!s) {
    seedCache.clear()
    s = generateSeed(anchor)
    seedCache.set(anchor, s)
  }
  return s
}

function lastSeq(state: DataState): number {
  const own = state.txns.at(-1)?.seq
  if (own !== undefined) return own
  return state.anchor ? (seedFor(state.anchor).txns.at(-1)?.seq ?? 0) : 0
}

function merge<T extends { id: string }>(base: T[], upserts?: Record<string, T>, deleted?: string[]): T[] {
  if (!upserts && !deleted?.length) return base
  const del = new Set(deleted ?? [])
  const seen = new Set<string>()
  const out: T[] = []
  for (const b of base) {
    if (del.has(b.id)) continue
    seen.add(b.id)
    out.push(upserts?.[b.id] ?? b)
  }
  for (const [id, v] of Object.entries(upserts ?? {})) if (!seen.has(id) && !del.has(id)) out.push(v)
  return out
}

// 入力（差分の各配列）の参照が同じなら、前回の結果を返す。
// 世代番号だけをキーにすると、リセットや別インスタンスで同じ番号が再び現れたときに取り違える
let mergedCache: { inputs: unknown[]; data: SeedData } | undefined

/** 現在のデータ（シード + 差分）。anchor 未確定なら undefined */
export function selectData(state: DataState): SeedData | undefined {
  if (!state.anchor) return undefined
  const inputs = [state.anchor, state.txns, state.upserts, state.deleted, state.auditLogs]
  if (mergedCache && mergedCache.inputs.every((v, i) => v === inputs[i])) return mergedCache.data
  const seed = seedFor(state.anchor)
  const m = <C extends EntityCollection>(c: C) =>
    merge(
      seed[c] as Entity<C>[],
      state.upserts[c] as Record<string, Entity<C>> | undefined,
      state.deleted[c],
    ) as SeedData[C]
  const data: SeedData = {
    ...seed,
    items: m('items'),
    lots: m('lots'),
    allocations: m('allocations'),
    purchaseOrders: m('purchaseOrders'),
    shippingOrders: m('shippingOrders'),
    transfers: m('transfers'),
    stocktakes: m('stocktakes'),
    views: m('views'),
    partners: m('partners'),
    locations: m('locations'),
    users: m('users'),
    categories: m('categories'),
    reasonCodes: m('reasonCodes'),
    txns: state.txns.length ? [...seed.txns, ...state.txns] : seed.txns,
    auditLogs: state.auditLogs,
  }
  mergedCache = { inputs, data }
  return data
}
