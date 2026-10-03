// 引当の一覧（SC-104）：商品名・受注・いまの有効在庫を添えて返す
import type { Result } from '@/lib/types'
import { composeSnapshot } from '@/lib/inventory'
import { ctx, ok, run } from './_context'
import { filterByWarehouse } from './_scope'

export type AllocationRow = {
  id: string
  itemId: string
  sku: string
  name: string
  unit: string
  warehouseId: string
  warehouseName: string
  qty: number
  orderCode: string
  customerName: string
  createdAt: string
  status: 'active' | 'released' | 'shipped'
  onHand: number
  available: number
}

export async function listAllocationRows(
  opts: { status?: 'active' | 'all' } = { status: 'active' },
): Promise<Result<AllocationRow[]>> {
  return run(() => {
    const c = ctx()
    const index = c.index()
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const whs = new Map(c.data.warehouses.map((w) => [w.id, w.name]))
    const sos = new Map(c.data.shippingOrders.map((s) => [s.id, s]))
    const partners = new Map(c.data.partners.map((p) => [p.id, p.name]))
    return ok(
      filterByWarehouse(c.scope, c.data.allocations, (a) => a.warehouseId)
        .filter((a) => opts.status === 'all' || a.status === 'active')
        .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
        .map((a) => {
          const item = items.get(a.itemId)
          const so = sos.get(a.refId)
          const snap = composeSnapshot(index, { itemId: a.itemId, warehouseId: a.warehouseId }, c.now)
          return {
            id: a.id,
            itemId: a.itemId,
            sku: item?.sku ?? '',
            name: item?.name ?? '',
            unit: item?.baseUnit ?? '',
            warehouseId: a.warehouseId,
            warehouseName: whs.get(a.warehouseId) ?? '',
            qty: a.qtyBase,
            orderCode: so?.code ?? (a.refId === 'embed-demo' ? '記事のデモ' : '手動'),
            customerName: so ? (partners.get(so.customerId) ?? '') : '',
            createdAt: a.createdAt,
            status: a.status,
            onHand: snap.onHand,
            available: snap.available,
          }
        }),
    )
  })
}
