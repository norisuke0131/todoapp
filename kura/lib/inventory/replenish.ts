// 発注点判定・推奨数量（FR-502, FR-503, FR-504）

import type { Item, StockSnapshot, Transaction } from '@/lib/types'
import { addDays } from './time'

type ReplenishSource = Pick<StockSnapshot, 'available' | 'incoming' | 'reorderPoint'>

/** 発注が必要か。★ 判定式は「有効在庫 + 入荷予定 < 発注点」。実在庫だけで判定しない */
export function needsReorder(s: ReplenishSource): boolean {
  return s.available + s.incoming < s.reorderPoint
}

/** 推奨数量：発注点までの不足数を発注ロットで切り上げる（不要なら 0） */
export function recommendedOrderQty(s: ReplenishSource, orderLot: number): number {
  if (!needsReorder(s)) return 0
  const shortage = s.reorderPoint - (s.available + s.incoming)
  const lot = Math.max(1, orderLot)
  return Math.ceil(shortage / lot) * lot
}

/** 期間内の1日あたり平均出庫数（逆仕訳で取り消された出庫は相殺される） */
export function averageDailyShipped(
  txns: Transaction[],
  itemId: string,
  now: string,
  days: number,
  warehouseId?: string,
): number {
  if (days <= 0) return 0
  const from = addDays(now, -days)
  let shipped = 0
  for (const t of txns) {
    if (t.itemId !== itemId || t.type !== 'ship') continue
    if (warehouseId !== undefined && t.warehouseId !== warehouseId) continue
    if (t.occurredAt <= from || t.occurredAt > now) continue
    shipped += -t.qtyBase
  }
  return Math.max(0, shipped) / days
}

/** 発注点の推奨値 = リードタイム × 平均出庫数 + 安全在庫（FR-502） */
export function suggestReorderPoint(
  item: Pick<Item, 'leadTimeDays' | 'safetyStock'>,
  avgDailyShipped: number,
): number {
  return Math.ceil(item.leadTimeDays * avgDailyShipped) + item.safetyStock
}
