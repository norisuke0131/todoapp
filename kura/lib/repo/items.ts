// 商品マスタ（F-M01, SC-013）
import type { Item, Result } from '@/lib/types'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId } from './_context'
import { delay } from './_delay'
import { DENY_REASON, scopeItem, type ScopedItem } from './_scope'

export async function listItems(): Promise<Result<ScopedItem[]>> {
  return run(() => {
    const c = ctx()
    return ok(c.data.items.map((i) => scopeItem(c.scope, i)))
  })
}

export async function getItem(sku: string): Promise<Result<ScopedItem>> {
  return run(() => {
    const c = ctx()
    const item = c.data.items.find((i) => i.sku === sku)
    return item ? ok(scopeItem(c.scope, item)) : err(`商品 ${sku} が見つかりません`)
  })
}

/** 編集できる項目（在庫数は含まない。在庫はトランザクションでしか変わらない / INV-02） */
export type ItemPatch = Partial<
  Pick<
    Item,
    | 'name'
    | 'jan'
    | 'categoryId'
    | 'price'
    | 'reorderPoint'
    | 'safetyStock'
    | 'orderLot'
    | 'leadTimeDays'
    | 'defaultSupplierId'
    | 'isActive'
    | 'packUnits'
  >
>

export async function updateItem(sku: string, patch: ItemPatch): Promise<Result<ScopedItem>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('master.write')) return err(DENY_REASON['master.write'])
    const before = c.data.items.find((i) => i.sku === sku)
    if (!before) return err(`商品 ${sku} が見つかりません`)
    if (patch.reorderPoint !== undefined && patch.reorderPoint < 0)
      return err('発注点は0以上で入力してください')
    if (patch.orderLot !== undefined && patch.orderLot < 1) return err('発注ロットは1以上で入力してください')
    await delay()
    const after: Item = { ...before, ...patch }
    const stores = getStores()
    stores.data.getState().upsert('items', after)
    const changes = (Object.keys(patch) as (keyof ItemPatch)[])
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((k) => ({ field: k, before: before[k], after: after[k] }))
    stores.data.getState().appendAudit({
      id: newId('log'),
      actorId: c.scope.userId,
      action: 'update_master',
      targetType: 'item',
      targetId: before.id,
      changes,
      createdAt: c.now,
    })
    return ok(scopeItem(c.scope, after))
  })
}
