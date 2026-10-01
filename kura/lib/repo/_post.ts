// ★ 在庫を変える唯一の入口（INV-02）。各リポジトリはここを通してトランザクションを追加する
// 権限・必須項目をここで一括して確かめる
import type { Transaction, TransactionDraft } from '@/lib/types'
import { getStores } from '@/lib/store'
import type { Ctx } from './_context'
import { DENY_REASON, type Permission } from './_scope'

const PERMISSION_BY_TYPE: Record<TransactionDraft['type'], Permission> = {
  receive: 'txn.inout',
  ship: 'txn.inout',
  move: 'txn.inout',
  transfer_out: 'transfer.create',
  transfer_in: 'txn.inout',
  adjust: 'adjust.write',
  stocktake: 'stocktake.approve',
  opening: 'master.write',
}

export class PostError extends Error {}

export function checkDrafts(c: Ctx, drafts: TransactionDraft[]): void {
  const items = new Map(c.data.items.map((i) => [i.id, i]))
  for (const d of drafts) {
    const p = PERMISSION_BY_TYPE[d.type]
    const scopeCtx =
      d.type === 'transfer_out' ? { fromWarehouseId: d.warehouseId } : { warehouseId: d.warehouseId }
    if (!c.scope.can(p, scopeCtx)) throw new PostError(DENY_REASON[p])
    if (!Number.isInteger(d.qtyBase) || d.qtyBase === 0)
      throw new PostError('数量は0以外の整数で入力してください')
    if ((d.type === 'adjust' || d.type === 'stocktake') && !d.reasonCodeId) {
      throw new PostError('理由を選んでください。原因別に集計して、再発を防ぐために使います')
    }
    const item = items.get(d.itemId)
    if (!item) throw new PostError(`商品 ${d.itemId} が見つかりません`)
    if (item.isLotManaged && !d.lotId)
      throw new PostError(`${item.name} はロット管理の対象です。ロットを指定してください`)
  }
}

/** 検査してから追加する。追加後のトランザクションを返す */
export function post(c: Ctx, drafts: TransactionDraft[]): Transaction[] {
  checkDrafts(c, drafts)
  return getStores().data.getState().appendTxns(drafts, c.now)
}

/** 下書きの共通項目 */
export function draftBase(c: Ctx, device: Transaction['device'] = 'pc') {
  return { userId: c.scope.userId, device, occurredAt: c.now, note: '', syncState: 'synced' as const }
}
