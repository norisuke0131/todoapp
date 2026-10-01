// ダッシュボードの集計（SC-001, FR-601, FR-602）
// 見える拠点だけで集計し、金額は権限がなければ含めない
import type { Result } from '@/lib/types'
import { composeSnapshot, isIdle, needsReorder, stockedPairs } from '@/lib/inventory'
import { getStores } from '@/lib/store'
import { ctx, ok, run } from './_context'
import { canSeeWarehouse, scopeMoney } from './_scope'

export type DashboardSummary = {
  scopeLabel: string
  skuCount: number
  stockoutRisk: number // 有効在庫が 0 以下
  needsReorder: number // 有効在庫 + 入荷予定 < 発注点
  expiringItems: number // 期限間近・期限切れを含む商品
  idleItems: number
  pendingVarianceStocktakes: number // 未承認の差異がある棚卸
  delayedPurchaseOrders: number
  inTransitTransfers: number
  /** 在庫状態の分布（商品×拠点の行数）。滞留は状態とは別の軸なので別に数える */
  rowCount: number
  statusCounts: { stockout: number; below_reorder: number; normal: number; excess: number }
  stockValue?: number // ★ 金額は権限がなければ含めない
}

export async function getDashboard(): Promise<Result<DashboardSummary>> {
  return run(() => {
    const c = ctx()
    const index = c.index()
    const idleDays = getStores().settings.getState().idleThresholdDays
    const snaps = stockedPairs(index)
      .filter((k) => canSeeWarehouse(c.scope, k.warehouseId))
      .map((k) => composeSnapshot(index, k, c.now))
    const whNames = c.data.warehouses.filter((w) => c.scope.warehouseIds.includes(w.id)).map((w) => w.name)
    const summary: Required<DashboardSummary> = {
      scopeLabel: c.scope.allWarehouses ? '全拠点' : whNames.join('・'),
      skuCount: new Set(snaps.map((s) => s.itemId)).size,
      rowCount: snaps.length,
      statusCounts: {
        stockout: snaps.filter((s) => s.status === 'stockout').length,
        below_reorder: snaps.filter((s) => s.status === 'below_reorder').length,
        normal: snaps.filter((s) => s.status === 'normal').length,
        excess: snaps.filter((s) => s.status === 'excess').length,
      },
      stockoutRisk: snaps.filter((s) => s.status === 'stockout').length,
      needsReorder: snaps.filter((s) => needsReorder(s)).length,
      expiringItems: snaps.filter((s) => (s.expiringQty ?? 0) > 0).length,
      idleItems: snaps.filter((s) => isIdle(s.idleDays, idleDays)).length,
      pendingVarianceStocktakes: c.data.stocktakes.filter(
        (s) =>
          canSeeWarehouse(c.scope, s.warehouseId) &&
          s.status !== 'approved' &&
          s.status !== 'cancelled' &&
          s.lines.some((l) => (l.varianceQty ?? 0) !== 0),
      ).length,
      delayedPurchaseOrders: c.data.purchaseOrders.filter(
        (p) =>
          canSeeWarehouse(c.scope, p.warehouseId) &&
          (p.status === 'ordered' || p.status === 'partial') &&
          !!p.expectedAt &&
          p.expectedAt < c.now,
      ).length,
      inTransitTransfers: c.data.transfers.filter(
        (t) =>
          t.status === 'in_transit' &&
          (canSeeWarehouse(c.scope, t.fromWarehouseId) || canSeeWarehouse(c.scope, t.toWarehouseId)),
      ).length,
      stockValue: snaps.reduce((s, x) => s + (x.stockValue ?? 0), 0),
    }
    return ok(scopeMoney(c.scope, summary, ['stockValue']))
  })
}
