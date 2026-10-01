// 在庫回転率・滞留（FR-603, FR-604）
// 回転率 = 期間の出庫金額 ÷ 平均在庫金額（期首と期末の平均）

import type { Item, StockSnapshot, Transaction, TurnoverMetrics } from '@/lib/types'
import { buildCostIndex, daysBetween, stockValueOf, type CostIndex } from '@/lib/inventory'

export type Period = { from: string; to: string }

function groupByItem(txns: Transaction[]): Map<string, Transaction[]> {
  const m = new Map<string, Transaction[]>()
  for (const t of txns) {
    let list = m.get(t.itemId)
    if (!list) m.set(t.itemId, (list = []))
    list.push(t)
  }
  return m
}

export function computeTurnover(
  items: Item[],
  txns: Transaction[],
  period: Period,
  opts: { warehouseId?: string; costIndex?: CostIndex } = {},
): TurnoverMetrics[] {
  const cost = opts.costIndex ?? buildCostIndex(txns)
  const scoped = opts.warehouseId ? txns.filter((t) => t.warehouseId === opts.warehouseId) : txns
  const byItem = groupByItem(scoped)
  const reversed = new Set(txns.filter((t) => t.reversesTxnId).map((t) => t.reversesTxnId))

  return items.map((item) => {
    const list = byItem.get(item.id) ?? []
    const costAt = (at: string) => cost.unitCostAt(item.id, at) ?? item.cost

    let qtyFrom = 0
    let qtyTo = 0
    let shippedValue = 0
    let lastShip: string | undefined
    let firstIn: string | undefined
    for (const t of list) {
      if (t.occurredAt <= period.from) qtyFrom += t.qtyBase
      if (t.occurredAt <= period.to) qtyTo += t.qtyBase
      if (t.type === 'ship' && t.occurredAt > period.from && t.occurredAt <= period.to) {
        // 逆仕訳（正の数量の出庫）で取り消された分は相殺される
        shippedValue += stockValueOf(-t.qtyBase, costAt(t.occurredAt))
      }
      const live = !t.reversesTxnId && !reversed.has(t.id)
      if (live && t.type === 'ship' && t.qtyBase < 0 && t.occurredAt <= period.to) {
        if (!lastShip || t.occurredAt > lastShip) lastShip = t.occurredAt
      }
      if (live && t.qtyBase > 0 && t.type !== 'ship' && t.occurredAt <= period.to) {
        if (!firstIn || t.occurredAt < firstIn) firstIn = t.occurredAt
      }
    }

    const avgStockValue = Math.round(
      (stockValueOf(qtyFrom, costAt(period.from)) + stockValueOf(qtyTo, costAt(period.to))) / 2,
    )
    const idleFrom = lastShip ?? firstIn
    return {
      itemId: item.id,
      shippedValue,
      avgStockValue,
      turnover: avgStockValue > 0 ? Math.round((shippedValue / avgStockValue) * 100) / 100 : 0,
      idleDays: idleFrom ? Math.max(0, daysBetween(idleFrom, period.to)) : 0,
    }
  })
}

/** カテゴリ別の回転率（出庫金額と平均在庫金額を合算してから割る） */
export function turnoverByCategory(
  items: Item[],
  metrics: TurnoverMetrics[],
): { categoryId: string; shippedValue: number; avgStockValue: number; turnover: number }[] {
  const catOf = new Map(items.map((i) => [i.id, i.categoryId]))
  const agg = new Map<string, { shippedValue: number; avgStockValue: number }>()
  for (const m of metrics) {
    const c = catOf.get(m.itemId)
    if (!c) continue
    const a = agg.get(c) ?? { shippedValue: 0, avgStockValue: 0 }
    a.shippedValue += m.shippedValue
    a.avgStockValue += m.avgStockValue
    agg.set(c, a)
  }
  return [...agg.entries()].map(([categoryId, a]) => ({
    categoryId,
    ...a,
    turnover: a.avgStockValue > 0 ? Math.round((a.shippedValue / a.avgStockValue) * 100) / 100 : 0,
  }))
}

/** 滞留在庫：最終出庫からの経過日数が閾値以上で、在庫が残っているもの。滞留金額の大きい順 */
export function idleStock(snapshots: StockSnapshot[], thresholdDays: number): StockSnapshot[] {
  return snapshots
    .filter((s) => s.onHand > 0 && (s.idleDays ?? 0) >= thresholdDays)
    .sort((a, b) => (b.stockValue ?? 0) - (a.stockValue ?? 0) || (b.idleDays ?? 0) - (a.idleDays ?? 0))
}
