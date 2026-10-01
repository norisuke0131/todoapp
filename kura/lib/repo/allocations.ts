// 引当（SC-104, FR-310）
// ★ 引当はトランザクションではない。実在庫は変わらず、有効在庫だけが減る
import type { Allocation, Result } from '@/lib/types'
import { composeSnapshot } from '@/lib/inventory'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId } from './_context'
import { delay } from './_delay'
import { DENY_REASON, filterByWarehouse } from './_scope'

export async function listAllocations(
  opts: { status?: Allocation['status'] } = { status: 'active' },
): Promise<Result<Allocation[]>> {
  return run(() => {
    const c = ctx()
    return ok(
      filterByWarehouse(c.scope, c.data.allocations, (a) => a.warehouseId).filter(
        (a) => !opts.status || a.status === opts.status,
      ),
    )
  })
}

export type AllocateResult = { allocation: Allocation; warning?: string }

export async function createAllocation(input: {
  itemId: string
  warehouseId: string
  qtyBase: number
  shippingOrderId?: string
}): Promise<Result<AllocateResult>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('allocation.write', { warehouseId: input.warehouseId }))
      return err(DENY_REASON['allocation.write'])
    if (!Number.isInteger(input.qtyBase) || input.qtyBase <= 0)
      return err('引当数は1以上の整数で入力してください')
    const snap = composeSnapshot(c.index(), { itemId: input.itemId, warehouseId: input.warehouseId }, c.now)
    await delay()
    const allocation: Allocation = {
      id: newId('al'),
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      qtyBase: input.qtyBase,
      refType: 'shipping_order',
      refId: input.shippingOrderId ?? 'manual',
      status: 'active',
      createdAt: c.now,
    }
    getStores().data.getState().upsert('allocations', allocation)
    const warning =
      input.qtyBase > snap.available
        ? `有効在庫（${snap.available}）を超える引当です。有効在庫がマイナスになります`
        : undefined
    return ok({ allocation, warning })
  })
}

export async function releaseAllocation(id: string): Promise<Result<Allocation>> {
  return run(async () => {
    const c = ctx()
    const a = c.data.allocations.find((x) => x.id === id)
    if (!a) return err('引当が見つかりません')
    if (!c.scope.can('allocation.write', { warehouseId: a.warehouseId }))
      return err(DENY_REASON['allocation.write'])
    if (a.status !== 'active') return err('この引当はすでに解除または出荷済みです')
    await delay()
    const next: Allocation = { ...a, status: 'released', releasedAt: c.now }
    getStores().data.getState().upsert('allocations', next)
    return ok(next)
  })
}
