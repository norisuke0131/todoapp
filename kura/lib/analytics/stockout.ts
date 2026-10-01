// 欠品分析（FR-608）：欠品の発生回数と、機会損失の推定額
//
// ・欠品 = 実在庫が 0 以下になった状態（過去の引当は履歴を持たないため、実在庫で判定する）
// ・機会損失 = 欠品日数 × 平均出庫数/日 × 1個あたり粗利（売価 − 原価）

import type { Item, Transaction } from '@/lib/types'
import { byOccurred, daysBetween } from '@/lib/inventory'
import type { Period } from './turnover'

export type StockoutMetrics = {
  itemId: string
  warehouseId?: string
  occurrences: number
  stockoutDays: number
  avgDailyShipped: number
  estimatedLoss: number
}

export function computeStockouts(
  items: Item[],
  txns: Transaction[],
  period: Period,
  opts: { warehouseId?: string } = {},
): StockoutMetrics[] {
  const periodDays = Math.max(1, daysBetween(period.from, period.to))
  const byItem = new Map<string, Transaction[]>()
  for (const t of txns) {
    if (opts.warehouseId && t.warehouseId !== opts.warehouseId) continue
    let l = byItem.get(t.itemId)
    if (!l) byItem.set(t.itemId, (l = []))
    l.push(t)
  }

  return items.map((item) => {
    const list = (byItem.get(item.id) ?? []).sort(byOccurred)
    // 期首時点の在庫。期首より前に取引があり、在庫0なら期首から欠品中とみなす
    const before = list.filter((t) => t.occurredAt <= period.from)
    let qty = before.reduce((s, t) => s + t.qtyBase, 0)
    let outSince: string | undefined = before.length > 0 && qty <= 0 ? period.from : undefined
    let occurrences = 0
    let outDays = 0
    let shipped = 0

    for (const t of list) {
      if (t.occurredAt <= period.from) continue
      if (t.occurredAt > period.to) break
      const wasOut = qty <= 0
      qty += t.qtyBase
      if (t.type === 'ship') shipped += -t.qtyBase
      if (!wasOut && qty <= 0) {
        occurrences += 1
        outSince = t.occurredAt
      } else if (wasOut && qty > 0 && outSince) {
        outDays += Math.max(0, daysBetween(outSince, t.occurredAt))
        outSince = undefined
      }
    }
    if (outSince) outDays += Math.max(0, daysBetween(outSince, period.to))

    const avgDailyShipped = Math.max(0, shipped) / periodDays
    const margin = Math.max(0, item.price - item.cost)
    return {
      itemId: item.id,
      warehouseId: opts.warehouseId,
      occurrences,
      stockoutDays: outDays,
      avgDailyShipped,
      estimatedLoss: Math.round(outDays * avgDailyShipped * margin),
    }
  })
}
