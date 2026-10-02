// 商品詳細の補助指標（SC-011）：回転率・平均出庫・発注点の推奨値（FR-502, FR-603）
import type { Result } from '@/lib/types'
import { addDays, averageDailyShipped, suggestReorderPoint } from '@/lib/inventory'
import { computeTurnover } from '@/lib/analytics'
import { ctx, err, ok, run } from './_context'
import { scopeMoney } from './_scope'

export type ItemMetrics = {
  periodDays: number
  avgDailyShipped: number
  suggestedReorderPoint: number
  turnover?: number // 金額ベースなので権限が必要
  shippedValue?: number
}

export async function getItemMetrics(
  sku: string,
  warehouseId?: string,
  periodDays = 90,
): Promise<Result<ItemMetrics>> {
  return run(() => {
    const c = ctx()
    const item = c.data.items.find((i) => i.sku === sku)
    if (!item) return err(`商品 ${sku} が見つかりません`)
    const wh = warehouseId ?? (c.scope.allWarehouses ? undefined : c.scope.warehouseIds[0])
    const avg = averageDailyShipped(c.data.txns, item.id, c.now, periodDays, wh)
    const [t] = computeTurnover(
      [item],
      c.data.txns,
      { from: addDays(c.now, -periodDays), to: c.now },
      { warehouseId: wh, costIndex: c.index().cost },
    )
    const full: Required<ItemMetrics> = {
      periodDays,
      avgDailyShipped: Math.round(avg * 10) / 10,
      suggestedReorderPoint: suggestReorderPoint(item, avg),
      turnover: t?.turnover ?? 0,
      shippedValue: t?.shippedValue ?? 0,
    }
    return ok(scopeMoney(c.scope, full, ['turnover', 'shippedValue']))
  })
}
