// トランザクション一覧（SC-130）と取消＝逆仕訳（SC-121, FR-315）
import type { Result, TxnType } from '@/lib/types'
import { buildReversal } from '@/lib/inventory'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId } from './_context'
import { delay } from './_delay'
import { DENY_REASON, filterByWarehouse, scopeTransaction, type ScopedTransaction } from './_scope'

export type TxnFilter = {
  types?: TxnType[]
  warehouseId?: string
  itemId?: string
  from?: string
  to?: string
  userId?: string
}

export async function listTransactions(
  f: TxnFilter = {},
): Promise<Result<(ScopedTransaction & { isReversed: boolean })[]>> {
  return run(() => {
    const c = ctx()
    const reversed = new Set(c.data.txns.filter((t) => t.reversesTxnId).map((t) => t.reversesTxnId))
    const rows = filterByWarehouse(c.scope, c.data.txns, (t) => t.warehouseId).filter(
      (t) =>
        (!f.types || f.types.includes(t.type)) &&
        (!f.warehouseId || t.warehouseId === f.warehouseId) &&
        (!f.itemId || t.itemId === f.itemId) &&
        (!f.userId || t.userId === f.userId) &&
        (!f.from || t.occurredAt >= f.from) &&
        (!f.to || t.occurredAt <= f.to),
    )
    return ok(
      rows.reverse().map((t) => ({ ...scopeTransaction(c.scope, t), isReversed: reversed.has(t.id) })),
    )
  })
}

/**
 * 取消。元の取引は消さず・書き換えず、符号を反転した逆仕訳を追加する（INV-03）。
 * 「取消済」の印は、逆仕訳の存在から導出される
 */
export async function reverseTransaction(txnId: string, note = ''): Promise<Result<ScopedTransaction>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('txn.reverse')) return err(DENY_REASON['txn.reverse'])
    const original = c.data.txns.find((t) => t.id === txnId)
    if (!original) return err('取引が見つかりません')
    if (original.reversesTxnId) return err('取消の取引はさらに取り消せません')
    if (c.data.txns.some((t) => t.reversesTxnId === txnId)) return err('この取引はすでに取り消されています')
    if (original.type === 'stocktake')
      return err('棚卸差異は取り消せません。必要なら在庫調整で訂正してください')
    if (!c.scope.can('txn.reverse', { warehouseId: original.warehouseId }))
      return err('この拠点の取引は取り消せません')
    await delay()
    const draft = buildReversal(original, { userId: c.scope.userId, device: 'pc', occurredAt: c.now, note })
    // 取消は権限付きの操作なので、型ごとの権限ではなく txn.reverse で通す
    const [created] = getStores().data.getState().appendTxns([draft], c.now)
    if (!created) return err('取消を登録できませんでした')
    getStores()
      .data.getState()
      .appendAudit({
        id: newId('log'),
        actorId: c.scope.userId,
        action: 'reverse_txn',
        targetType: 'transaction',
        targetId: original.id,
        changes: [{ field: 'qtyBase', before: original.qtyBase, after: 0 }],
        createdAt: c.now,
      })
    return ok(scopeTransaction(c.scope, created))
  })
}

export type TxnRow = ScopedTransaction & {
  isReversed: boolean
  sku: string
  itemName: string
  baseUnit: string
  userName: string
  warehouseName: string
  lotNo?: string
  reasonName?: string
}

/** 一覧表示用に名前を引いた取引（SC-130）。新しい順 */
export async function listTransactionRows(f: TxnFilter = {}): Promise<Result<TxnRow[]>> {
  const r = await listTransactions(f)
  if (!r.ok) return r
  return run(() => {
    const c = ctx()
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const users = new Map(c.data.users.map((u) => [u.id, u.name]))
    const whs = new Map(c.data.warehouses.map((w) => [w.id, w.name]))
    const lots = new Map(c.data.lots.map((l) => [l.id, l.lotNo]))
    const reasons = new Map(c.data.reasonCodes.map((x) => [x.id, x.name]))
    return ok(
      r.data.map((t) => {
        const i = items.get(t.itemId)
        return {
          ...t,
          sku: i?.sku ?? '',
          itemName: i?.name ?? '',
          baseUnit: i?.baseUnit ?? '',
          userName: users.get(t.userId) ?? t.userId,
          warehouseName: t.warehouseId ? (whs.get(t.warehouseId) ?? '') : '',
          lotNo: t.lotId ? lots.get(t.lotId) : undefined,
          reasonName: t.reasonCodeId ? reasons.get(t.reasonCodeId) : undefined,
        }
      }),
    )
  })
}
