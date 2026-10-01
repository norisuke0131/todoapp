// 発注・入荷予定（SC-300〜SC-302, FR-503〜FR-507）
import type { PurchaseOrder, Result } from '@/lib/types'
import { composeSnapshot, needsReorder, recommendedOrderQty, stockedPairs } from '@/lib/inventory'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId } from './_context'
import { delay } from './_delay'
import {
  DENY_REASON,
  filterByWarehouse,
  scopeMoney,
  scopePurchaseOrder,
  scopeSnapshot,
  type ScopedPurchaseOrder,
  type ScopedSnapshot,
} from './_scope'

export async function listPurchaseOrders(): Promise<
  Result<(ScopedPurchaseOrder & { isDelayed: boolean })[]>
> {
  return run(() => {
    const c = ctx()
    return ok(
      filterByWarehouse(c.scope, c.data.purchaseOrders, (p) => p.warehouseId)
        .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
        .map((p) => ({
          ...scopePurchaseOrder(c.scope, p),
          // ★ 予定日を過ぎても入荷していない発注は遅延（FR-507）
          isDelayed:
            (p.status === 'ordered' || p.status === 'partial') && !!p.expectedAt && p.expectedAt < c.now,
        })),
    )
  })
}

export async function createPurchaseOrder(input: {
  supplierId: string
  warehouseId: string
  expectedAt?: string
  lines: { itemId: string; qtyBase: number; unitCost?: number }[]
}): Promise<Result<ScopedPurchaseOrder>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('po.write', { warehouseId: input.warehouseId })) return err(DENY_REASON['po.write'])
    if (input.lines.length === 0 || input.lines.some((l) => !Number.isInteger(l.qtyBase) || l.qtyBase <= 0))
      return err('発注数は1以上の整数で入力してください')
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const lt = Math.max(...input.lines.map((l) => items.get(l.itemId)?.leadTimeDays ?? 7))
    await delay()
    const id = newId('po')
    const po: PurchaseOrder = {
      id,
      code: `PO-${String(5200 + c.data.purchaseOrders.length + 1)}`,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      status: 'ordered',
      orderedAt: c.now,
      expectedAt: input.expectedAt ?? new Date(Date.parse(c.now) + lt * 86_400_000).toISOString(),
      lines: input.lines.map((l, i) => ({
        id: `${id}-${i + 1}`,
        itemId: l.itemId,
        qtyBase: l.qtyBase,
        receivedQtyBase: 0,
        unitCost: l.unitCost ?? items.get(l.itemId)?.cost ?? 0,
      })),
      createdAt: c.now,
    }
    getStores().data.getState().upsert('purchaseOrders', po)
    return ok(scopePurchaseOrder(c.scope, po))
  })
}

export type ReplenishmentRow = {
  itemId: string
  sku: string
  name: string
  warehouseId: string
  snapshot: ScopedSnapshot
  recommendedQty: number
  amount?: number
}
export type ReplenishmentGroup = {
  supplierId: string
  supplierName: string
  minOrderAmount?: number
  totalAmount?: number
  meetsMinimum?: boolean
  rows: ReplenishmentRow[]
}

/** 推奨発注リスト（FR-503〜FR-505）。★ 判定は「有効在庫 + 入荷予定 < 発注点」 */
export async function getReplenishment(): Promise<Result<ReplenishmentGroup[]>> {
  return run(() => {
    const c = ctx()
    const index = c.index()
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const partners = new Map(c.data.partners.map((p) => [p.id, p]))
    const groups = new Map<string, ReplenishmentGroup & { totalAmount: number; minOrderAmount: number }>()
    for (const k of stockedPairs(index)) {
      if (!k.warehouseId || !c.scope.warehouseIds.includes(k.warehouseId)) continue
      const item = items.get(k.itemId)
      if (!item?.isActive) continue
      const snap = composeSnapshot(index, k, c.now)
      if (!needsReorder(snap)) continue
      const qty = recommendedOrderQty(snap, item.orderLot)
      const supplierId = item.defaultSupplierId ?? 'unknown'
      const sup = partners.get(supplierId)
      const g = groups.get(supplierId) ?? {
        supplierId,
        supplierName: sup?.name ?? '未設定',
        minOrderAmount: sup?.minOrderAmount ?? 0,
        totalAmount: 0,
        rows: [],
      }
      const amount = Math.round(qty * (index.cost.unitCostOf(item.id) ?? item.cost))
      g.totalAmount += amount
      g.rows.push({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        warehouseId: k.warehouseId,
        snapshot: scopeSnapshot(c.scope, snap),
        recommendedQty: qty,
        amount,
      })
      groups.set(supplierId, g)
    }
    return ok(
      [...groups.values()].map((g) => {
        const full = {
          ...g,
          meetsMinimum: g.totalAmount >= g.minOrderAmount,
          rows: g.rows.map((r) => scopeMoney(c.scope, r, ['amount'])),
        }
        return scopeMoney(c.scope, full, ['totalAmount', 'minOrderAmount', 'meetsMinimum'])
      }),
    )
  })
}
