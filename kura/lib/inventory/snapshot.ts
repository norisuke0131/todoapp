// ★ 4つの在庫数の算出（FR-102, FR-103, INV-01, INV-06）
//
// 在庫数はどこにも保存しない。トランザクション・引当・発注・移動から毎回組み立てる。
// 4つの在庫数（実在庫・引当済・有効在庫・入荷予定）は composeSnapshot() だけが返す。
// 単品の getSnapshot() も一覧用の getSnapshots() も、必ずこの関数を通る。

import type {
  Allocation,
  Category,
  Item,
  Lot,
  PurchaseOrder,
  StockSnapshot,
  Transaction,
  Transfer,
} from '@/lib/types'
import { judgeStatus } from './status'
import { buildCostIndex, stockValueOf, type CostIndex } from './valuation'
import { daysBetween } from './time'

export type InventoryData = {
  items: Item[]
  txns: Transaction[]
  allocations: Allocation[]
  purchaseOrders: PurchaseOrder[]
  transfers: Transfer[]
  lots: Lot[]
  categories: Category[]
}

/** 集約の軸。undefined の軸は合算する（例：warehouseId 未指定＝全拠点合計） */
export type SnapshotKey = { itemId: string; warehouseId?: string; lotId?: string }

// ---------------------------------------------------------------------------
// インデックス：トランザクションを1回だけ走査して、あらゆる軸の合計を持つ
// ---------------------------------------------------------------------------

type Bucket = Map<string, number>

export type InventoryIndex = {
  onHand: Bucket // key → 実在庫
  allocated: Bucket // key → 引当済（active のみ）
  onOrder: Bucket // key(item|wh) → 発注残
  inTransit: Bucket // key → 移動中（到着先基準）
  lastShippedAt: Map<string, string> // key → 最終出庫日時
  firstInboundAt: Map<string, string> // key → 最初の入庫日時（未出庫時の滞留起点）
  lotOnHand: Map<string, Map<string, number>> // key(item|wh?) → lotId → 実在庫
  reversedTxnIds: Set<string> // 逆仕訳で打ち消された取引
  cost: CostIndex
  itemsById: Map<string, Item>
  lotsById: Map<string, Lot>
  alertDaysByItem: Map<string, number>
}

const ALL = '*'

/** 指定された粒度の4通りのキー（item / item|wh / item|lot / item|wh|lot）を返す */
function keysFor(itemId: string, wh: string | undefined, lot: string | undefined): string[] {
  const w = wh ?? ALL
  const l = lot ?? ALL
  const keys = [`${itemId}|${ALL}|${ALL}`, `${itemId}|${w}|${ALL}`]
  if (lot !== undefined) keys.push(`${itemId}|${ALL}|${l}`, `${itemId}|${w}|${l}`)
  return [...new Set(keys)]
}

function keyOf(k: SnapshotKey): string {
  return `${k.itemId}|${k.warehouseId ?? ALL}|${k.lotId ?? ALL}`
}

function add(b: Bucket, keys: string[], v: number) {
  for (const k of keys) b.set(k, (b.get(k) ?? 0) + v)
}

function maxDate(m: Map<string, string>, keys: string[], v: string) {
  for (const k of keys) {
    const cur = m.get(k)
    if (cur === undefined || cur < v) m.set(k, v)
  }
}

function minDate(m: Map<string, string>, keys: string[], v: string) {
  for (const k of keys) {
    const cur = m.get(k)
    if (cur === undefined || cur > v) m.set(k, v)
  }
}

export function buildIndex(data: InventoryData): InventoryIndex {
  const reversedTxnIds = new Set<string>()
  for (const t of data.txns) if (t.reversesTxnId) reversedTxnIds.add(t.reversesTxnId)

  const onHand: Bucket = new Map()
  const lastShippedAt = new Map<string, string>()
  const firstInboundAt = new Map<string, string>()
  const lotOnHand = new Map<string, Map<string, number>>()

  for (const t of data.txns) {
    // ★ 実在庫 = 全トランザクションの合計。取消は逆仕訳との相殺で 0 になる（INV-03）
    const keys = keysFor(t.itemId, t.warehouseId, t.lotId)
    add(onHand, keys, t.qtyBase)

    if (t.lotId) {
      for (const k of [`${t.itemId}|${ALL}`, `${t.itemId}|${t.warehouseId}`]) {
        let m = lotOnHand.get(k)
        if (!m) lotOnHand.set(k, (m = new Map()))
        m.set(t.lotId, (m.get(t.lotId) ?? 0) + t.qtyBase)
      }
    }

    const isLive = !t.reversesTxnId && !reversedTxnIds.has(t.id)
    if (isLive && t.type === 'ship' && t.qtyBase < 0) maxDate(lastShippedAt, keys, t.occurredAt)
    if (
      isLive &&
      t.qtyBase > 0 &&
      (t.type === 'opening' || t.type === 'receive' || t.type === 'transfer_in')
    ) {
      minDate(firstInboundAt, keys, t.occurredAt)
    }
  }

  // ★ 引当は実在庫を動かさない。有効在庫だけを減らす（FR-310）
  const allocated: Bucket = new Map()
  for (const a of data.allocations) {
    if (a.status !== 'active') continue
    add(allocated, keysFor(a.itemId, a.warehouseId, a.lotId), a.qtyBase)
  }

  // ★ 入荷予定 = 発注残 + 移動中（FR-503 の判定に使う）
  const onOrder: Bucket = new Map()
  for (const po of data.purchaseOrders) {
    if (po.status !== 'ordered' && po.status !== 'partial') continue
    for (const l of po.lines) {
      const rest = l.qtyBase - l.receivedQtyBase
      if (rest > 0) add(onOrder, keysFor(l.itemId, po.warehouseId, undefined), rest)
    }
  }

  const inTransit: Bucket = new Map()
  for (const tr of data.transfers) {
    if (tr.status !== 'in_transit') continue
    for (const l of tr.lines) {
      const rest = l.qtyBase - l.receivedQtyBase
      if (rest > 0) add(inTransit, keysFor(l.itemId, tr.toWarehouseId, l.lotId), rest)
    }
  }

  const itemsById = new Map(data.items.map((i) => [i.id, i]))
  const alertByCat = new Map(data.categories.map((c) => [c.id, c.expiryAlertDays]))
  const alertDaysByItem = new Map(data.items.map((i) => [i.id, alertByCat.get(i.categoryId) ?? 30]))

  return {
    onHand,
    allocated,
    onOrder,
    inTransit,
    lastShippedAt,
    firstInboundAt,
    lotOnHand,
    reversedTxnIds,
    cost: buildCostIndex(data.txns),
    itemsById,
    lotsById: new Map(data.lots.map((l) => [l.id, l])),
    alertDaysByItem,
  }
}

// ---------------------------------------------------------------------------
// ★ 4つの在庫数を返す唯一の関数（INV-06）
// ---------------------------------------------------------------------------

export function composeSnapshot(index: InventoryIndex, key: SnapshotKey, now: string): StockSnapshot {
  const item = index.itemsById.get(key.itemId)
  if (!item) throw new Error(`商品 ${key.itemId} が見つかりません`)

  const k = keyOf(key)
  const onHand = index.onHand.get(k) ?? 0
  const allocated = index.allocated.get(k) ?? 0
  const inTransit = index.inTransit.get(k) ?? 0
  // 発注残はロットを持たないため、ロット単位の照会では入荷予定に含めない
  const onOrder = key.lotId === undefined ? (index.onOrder.get(k) ?? 0) : 0

  const available = onHand - allocated // ★ 有効在庫
  const incoming = onOrder + inTransit // ★ 入荷予定

  const snap: StockSnapshot = {
    itemId: key.itemId,
    warehouseId: key.warehouseId,
    lotId: key.lotId,
    onHand,
    allocated,
    available,
    incoming,
    inTransit,
    reorderPoint: item.reorderPoint,
    safetyStock: item.safetyStock,
    status: judgeStatus(available, item),
  }

  // 金額。権限による除去は lib/repo/_scope.ts が担う（SCP-03）
  const unitCost = index.cost.unitCostOf(key.itemId) ?? item.cost
  snap.unitCost = unitCost
  snap.stockValue = stockValueOf(onHand, unitCost)

  // 滞留
  const last = index.lastShippedAt.get(k)
  const idleFrom = last ?? index.firstInboundAt.get(k)
  if (last) snap.lastShippedAt = last
  if (idleFrom && onHand > 0) snap.idleDays = daysBetween(idleFrom, now)

  // 期限
  if (item.isLotManaged) {
    const lotMap = index.lotOnHand.get(`${key.itemId}|${key.warehouseId ?? ALL}`)
    if (lotMap) {
      const alertDays = index.alertDaysByItem.get(item.id) ?? 30
      let nearest: string | undefined
      let expiring = 0
      for (const [lotId, qty] of lotMap) {
        if (qty <= 0) continue
        if (key.lotId !== undefined && lotId !== key.lotId) continue
        const exp = index.lotsById.get(lotId)?.expiryDate
        if (!exp) continue
        if (nearest === undefined || exp < nearest) nearest = exp
        if (daysBetween(now, exp) <= alertDays) expiring += qty
      }
      if (nearest) snap.nearestExpiryDate = nearest
      if (expiring > 0) snap.expiringQty = expiring
    }
  }

  return snap
}

/** 単品の在庫（7章の getSnapshot と同じ責務） */
export function getSnapshot(data: InventoryData, key: SnapshotKey, now: string): StockSnapshot {
  return composeSnapshot(buildIndex(data), key, now)
}

/** 一覧用。インデックスを1回だけ作り、すべてのキーで composeSnapshot を呼ぶ */
export function getSnapshots(index: InventoryIndex, keys: SnapshotKey[], now: string): StockSnapshot[] {
  return keys.map((k) => composeSnapshot(index, k, now))
}

/** 商品×拠点の組（＝その拠点で扱いのある商品）を列挙する */
export function stockedPairs(index: InventoryIndex): SnapshotKey[] {
  const out: SnapshotKey[] = []
  for (const k of index.firstInboundAt.keys()) {
    const [itemId, wh, lot] = k.split('|')
    if (itemId && wh && wh !== ALL && lot === ALL) out.push({ itemId, warehouseId: wh })
  }
  return out
}

/** 商品 × 拠点 × ロットの実在庫（FEFO・ロット一覧の入力） */
export function lotBalances(
  index: InventoryIndex,
  itemId: string,
  warehouseId?: string,
): { lotId: string; onHand: number; allocated: number; available: number }[] {
  const m = index.lotOnHand.get(`${itemId}|${warehouseId ?? ALL}`)
  if (!m) return []
  return [...m.entries()].map(([lotId, onHand]) => {
    const allocated = index.allocated.get(`${itemId}|${warehouseId ?? ALL}|${lotId}`) ?? 0
    return { lotId, onHand, allocated, available: onHand - allocated }
  })
}
