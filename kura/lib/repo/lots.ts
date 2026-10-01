// ロット一覧（SC-311）・期限（SC-310）
import type { Result } from '@/lib/types'
import { daysBetween, lotBalances, stockedPairs } from '@/lib/inventory'
import { ctx, ok, run } from './_context'
import { canSeeWarehouse } from './_scope'

export type LotListRow = {
  lotId: string
  lotNo: string
  itemId: string
  sku: string
  itemName: string
  warehouseId: string
  receivedAt: string
  expiryDate?: string
  daysToExpiry?: number
  expiryState: 'expired' | 'near' | 'ok' | 'none'
  onHand: number
  available: number
}

export async function listLots(
  opts: { onlyInStock?: boolean } = { onlyInStock: true },
): Promise<Result<LotListRow[]>> {
  return run(() => {
    const c = ctx()
    const index = c.index()
    const lotById = new Map(c.data.lots.map((l) => [l.id, l]))
    const itemById = new Map(c.data.items.map((i) => [i.id, i]))
    const alertDays = new Map(c.data.categories.map((x) => [x.id, x.expiryAlertDays]))
    const rows: LotListRow[] = []
    for (const k of stockedPairs(index)) {
      if (!k.warehouseId || !canSeeWarehouse(c.scope, k.warehouseId)) continue
      const item = itemById.get(k.itemId)
      if (!item?.isLotManaged) continue
      for (const b of lotBalances(index, k.itemId, k.warehouseId)) {
        if (opts.onlyInStock && b.onHand <= 0) continue
        const lot = lotById.get(b.lotId)
        if (!lot) continue
        const days = lot.expiryDate ? daysBetween(c.now.slice(0, 10), lot.expiryDate) : undefined
        const limit = alertDays.get(item.categoryId) ?? 30
        rows.push({
          lotId: lot.id,
          lotNo: lot.lotNo,
          itemId: item.id,
          sku: item.sku,
          itemName: item.name,
          warehouseId: k.warehouseId,
          receivedAt: lot.receivedAt,
          expiryDate: lot.expiryDate,
          daysToExpiry: days,
          expiryState: days === undefined ? 'none' : days < 0 ? 'expired' : days <= limit ? 'near' : 'ok',
          onHand: b.onHand,
          available: b.available,
        })
      }
    }
    rows.sort((a, b) => ((a.expiryDate ?? '9') < (b.expiryDate ?? '9') ? -1 : 1))
    return ok(rows)
  })
}
