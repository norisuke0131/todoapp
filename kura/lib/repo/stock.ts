// 在庫照会（SC-010, SC-011, SC-012, SC-900）
// ★ 在庫はここでも計算しない。lib/inventory の結果にスコープを当てて返すだけ
import type { Result } from '@/lib/types'
import {
  getLedger as ledgerOf,
  lotBalances,
  stockedPairs,
  composeSnapshot,
  type SnapshotKey,
} from '@/lib/inventory'
import { ctx, err, ok, run } from './_context'
import {
  canSeeWarehouse,
  scopeItem,
  scopeSnapshot,
  scopeTransaction,
  type ScopedItem,
  type ScopedSnapshot,
  type ScopedTransaction,
} from './_scope'

export type StockRow = {
  item: ScopedItem
  categoryName: string
  warehouseId?: string // 未指定 = 全拠点合計
  snapshot: ScopedSnapshot
}

/**
 * 在庫一覧。全拠点が見えるロールは「商品ごとの全拠点合計」、
 * 担当拠点だけのロールは「担当拠点の行」を返す（データスコープ）
 */
export async function listStock(opts: { warehouseId?: string } = {}): Promise<Result<StockRow[]>> {
  return run(() => {
    const c = ctx()
    const index = c.index()
    const catName = new Map(c.data.categories.map((x) => [x.id, x.name]))
    const itemById = new Map(c.data.items.map((i) => [i.id, i]))

    let keys: SnapshotKey[]
    if (opts.warehouseId) {
      if (!canSeeWarehouse(c.scope, opts.warehouseId)) return err('この拠点の在庫は閲覧できません')
      keys = stockedPairs(index).filter((k) => k.warehouseId === opts.warehouseId)
    } else if (c.scope.allWarehouses) {
      const stocked = new Set(stockedPairs(index).map((k) => k.itemId))
      keys = c.data.items.filter((i) => i.isActive && stocked.has(i.id)).map((i) => ({ itemId: i.id }))
    } else {
      keys = stockedPairs(index).filter((k) => canSeeWarehouse(c.scope, k.warehouseId))
    }

    const rows = keys.flatMap((k): StockRow[] => {
      const item = itemById.get(k.itemId)
      if (!item) return []
      return [
        {
          item: scopeItem(c.scope, item),
          categoryName: catName.get(item.categoryId) ?? '',
          warehouseId: k.warehouseId,
          snapshot: scopeSnapshot(c.scope, composeSnapshot(index, k, c.now)),
        },
      ]
    })
    rows.sort((a, b) => (a.item.sku < b.item.sku ? -1 : 1))
    return ok(rows)
  })
}

export type LotRow = {
  lotId: string
  lotNo: string
  warehouseId: string
  receivedAt: string
  expiryDate?: string
  onHand: number
  allocated: number
  available: number
}

export type StockDetail = {
  item: ScopedItem
  categoryName: string
  /** 見える範囲の合計（現場担当なら担当拠点） */
  total: ScopedSnapshot
  byWarehouse: (ScopedSnapshot & { warehouseName: string })[]
  byLot: LotRow[]
}

/** 商品詳細（SC-011）：4つの在庫数・拠点別・ロット別 */
export async function getStockDetail(sku: string): Promise<Result<StockDetail>> {
  return run(() => {
    const c = ctx()
    const item = c.data.items.find((i) => i.sku === sku)
    if (!item) return err(`商品 ${sku} が見つかりません`)
    const index = c.index()
    const pairs = stockedPairs(index).filter(
      (k) => k.itemId === item.id && canSeeWarehouse(c.scope, k.warehouseId),
    )
    if (pairs.length === 0 && !c.scope.allWarehouses) return err('この商品は担当拠点で扱いがありません')

    const whName = new Map(c.data.warehouses.map((w) => [w.id, w.name]))
    const byWarehouse = pairs.map((k) => ({
      ...scopeSnapshot(c.scope, composeSnapshot(index, k, c.now)),
      warehouseName: whName.get(k.warehouseId ?? '') ?? '',
    }))
    const totalKey: SnapshotKey = c.scope.allWarehouses
      ? { itemId: item.id }
      : { itemId: item.id, warehouseId: pairs[0]?.warehouseId }
    const lotById = new Map(c.data.lots.map((l) => [l.id, l]))
    const byLot = pairs.flatMap((k) =>
      lotBalances(index, item.id, k.warehouseId)
        .filter((b) => b.onHand !== 0)
        .flatMap((b): LotRow[] => {
          const lot = lotById.get(b.lotId)
          if (!lot || !k.warehouseId) return []
          return [
            {
              ...b,
              lotNo: lot.lotNo,
              warehouseId: k.warehouseId,
              receivedAt: lot.receivedAt,
              expiryDate: lot.expiryDate,
            },
          ]
        }),
    )
    byLot.sort((a, b) => ((a.expiryDate ?? '9') < (b.expiryDate ?? '9') ? -1 : 1))

    return ok({
      item: scopeItem(c.scope, item),
      categoryName: c.data.categories.find((x) => x.id === item.categoryId)?.name ?? '',
      total: scopeSnapshot(c.scope, composeSnapshot(index, totalKey, c.now)),
      byWarehouse,
      byLot,
    })
  })
}

export type LedgerEntry = {
  txn: ScopedTransaction
  balance: number
  isReversed: boolean
  isReversal: boolean
  userName: string
  warehouseName: string
}

/** 在庫元帳（SC-012）：残高列で「現在庫がどの取引の積み上げか」を見せる */
export async function getItemLedger(
  sku: string,
  opts: { warehouseId?: string; asOf?: string } = {},
): Promise<Result<LedgerEntry[]>> {
  return run(() => {
    const c = ctx()
    const item = c.data.items.find((i) => i.sku === sku)
    if (!item) return err(`商品 ${sku} が見つかりません`)
    // 担当拠点だけのロールは、拠点を指定しなくても担当拠点に絞る
    const warehouseId = opts.warehouseId ?? (c.scope.allWarehouses ? undefined : c.scope.warehouseIds[0])
    if (warehouseId && !canSeeWarehouse(c.scope, warehouseId)) return err('この拠点の履歴は閲覧できません')
    const users = new Map(c.data.users.map((u) => [u.id, u.name]))
    const whs = new Map(c.data.warehouses.map((w) => [w.id, w.name]))
    const rows = ledgerOf(c.data.txns, { itemId: item.id, warehouseId }, opts.asOf)
    return ok(
      rows.map((r) => ({
        txn: scopeTransaction(c.scope, r.txn),
        balance: r.balance,
        isReversed: r.isReversed,
        isReversal: r.isReversal,
        userName: users.get(r.txn.userId) ?? r.txn.userId,
        warehouseName: whs.get(r.txn.warehouseId) ?? '',
      })),
    )
  })
}
