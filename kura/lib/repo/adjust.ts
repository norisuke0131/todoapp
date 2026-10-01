// 在庫調整（SC-120, FR-314, FR-511）。理由コード必須
import type { Result } from '@/lib/types'
import { toBase } from '@/lib/inventory'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId } from './_context'
import { delay } from './_delay'
import { draftBase, post } from './_post'
import { DENY_REASON, scopeTransaction, type ScopedTransaction } from './_scope'

export type AdjustInput = {
  itemId: string
  warehouseId: string
  /** 符号付き（増やすなら +、減らすなら −） */
  qty: number
  unit: string
  reasonCodeId: string
  lotId?: string
  locationId?: string
  note?: string
}

export async function adjustStock(input: AdjustInput): Promise<Result<ScopedTransaction>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('adjust.write', { warehouseId: input.warehouseId }))
      return err(DENY_REASON['adjust.write'])
    const reason = c.data.reasonCodes.find((r) => r.id === input.reasonCodeId && r.kind === 'adjust')
    if (!reason) return err('理由を選んでください。原因別に集計して、再発を防ぐために使います')
    const item = c.data.items.find((i) => i.id === input.itemId)
    if (!item) return err('商品が見つかりません')
    const qtyBase = toBase(item, input.qty, input.unit)
    await delay()
    const [t] = post(c, [
      {
        ...draftBase(c),
        type: 'adjust',
        itemId: item.id,
        warehouseId: input.warehouseId,
        locationId: input.locationId,
        lotId: input.lotId,
        qtyBase,
        inputQty: input.qty,
        inputUnit: input.unit,
        reasonCodeId: reason.id,
        note: input.note ?? '',
      },
    ])
    if (!t) return err('調整を登録できませんでした')
    getStores()
      .data.getState()
      .appendAudit({
        id: newId('log'),
        actorId: c.scope.userId,
        action: 'adjust',
        targetType: 'item',
        targetId: item.id,
        changes: [{ field: 'qtyBase', before: null, after: qtyBase }],
        createdAt: c.now,
      })
    return ok(scopeTransaction(c.scope, t))
  })
}
