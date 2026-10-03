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

export type BulkPatch = Partial<Pick<Item, 'categoryId' | 'reorderPoint' | 'safetyStock' | 'orderLot'>>

/**
 * 一括更新（FR-209）。戻り値の before で「元に戻す」ができる（IX-06）
 */
export async function bulkUpdateItems(
  skus: string[],
  patch: BulkPatch,
): Promise<Result<{ updated: number; before: { sku: string; patch: BulkPatch }[] }>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('master.write')) return err(DENY_REASON['master.write'])
    if (patch.reorderPoint !== undefined && (!Number.isInteger(patch.reorderPoint) || patch.reorderPoint < 0))
      return err('発注点は0以上の整数で入力してください')
    const targets = c.data.items.filter((i) => skus.includes(i.sku))
    if (targets.length === 0) return err('対象の商品がありません')
    await delay()
    const store = getStores().data.getState()
    const keys = Object.keys(patch) as (keyof BulkPatch)[]
    const before = targets.map((i) => ({
      sku: i.sku,
      patch: Object.fromEntries(keys.map((k) => [k, i[k]])) as BulkPatch,
    }))
    for (const i of targets) {
      store.upsert('items', { ...i, ...patch })
      store.appendAudit({
        id: newId('log'),
        actorId: c.scope.userId,
        action: 'update_master',
        targetType: 'item',
        targetId: i.id,
        changes: keys.map((k) => ({ field: k, before: i[k], after: patch[k] })),
        createdAt: c.now,
      })
    }
    return ok({ updated: targets.length, before })
  })
}

/** 一括更新を元に戻す（それぞれの商品を元の値で更新し直す） */
export async function revertBulkUpdate(before: { sku: string; patch: BulkPatch }[]): Promise<Result<number>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('master.write')) return err(DENY_REASON['master.write'])
    const store = getStores().data.getState()
    let n = 0
    for (const b of before) {
      const i = c.data.items.find((x) => x.sku === b.sku)
      if (!i) continue
      store.upsert('items', { ...i, ...b.patch })
      n += 1
    }
    return ok(n)
  })
}

export type NewItemInput = Omit<Item, 'id' | 'cost' | 'abcClass' | 'isSerialManaged'> & { cost: number }

/** 商品の新規登録（SC-013） */
export async function createItem(input: NewItemInput): Promise<Result<ScopedItem>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('master.write')) return err(DENY_REASON['master.write'])
    const sku = input.sku.trim()
    if (!/^[A-Za-z0-9-]{3,20}$/.test(sku)) return err('SKUは半角英数字とハイフンで3〜20文字にしてください')
    if (c.data.items.some((i) => i.sku === sku)) return err(`SKU ${sku} はすでに登録されています`)
    if (input.jan && c.data.items.some((i) => i.jan === input.jan))
      return err(`JAN ${input.jan} はすでに別の商品で使われています`)
    await delay()
    const item: Item = { ...input, sku, id: newId('item'), isSerialManaged: false }
    getStores().data.getState().upsert('items', item)
    getStores()
      .data.getState()
      .appendAudit({
        id: newId('log'),
        actorId: c.scope.userId,
        action: 'update_master',
        targetType: 'item',
        targetId: item.id,
        changes: [{ field: 'sku', before: null, after: sku }],
        createdAt: c.now,
      })
    return ok(scopeItem(c.scope, item))
  })
}
