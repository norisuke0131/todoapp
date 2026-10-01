// 入庫（検品）（SC-100, FR-301, FR-305）
import type { Device, Lot, PurchaseOrder, Result, TransactionDraft } from '@/lib/types'
import { toBase } from '@/lib/inventory'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId } from './_context'
import { delay } from './_delay'
import { draftBase, post } from './_post'
import { scopeTransaction, type ScopedTransaction } from './_scope'

export type ReceiveLine = {
  itemId: string
  qty: number
  unit: string
  locationId?: string
  unitCost?: number
  /** ロット管理品では必須（FR-305） */
  lotNo?: string
  expiryDate?: string
}

export type ReceiveInput = {
  warehouseId: string
  purchaseOrderId?: string
  lines: ReceiveLine[]
  device?: Device
}

export type ReceiveResult = {
  txns: ScopedTransaction[]
  /** 予定数との差異（発注書からの入庫のみ）。警告であってブロックはしない */
  differences: { itemId: string; expected: number; received: number }[]
}

export async function receive(input: ReceiveInput): Promise<Result<ReceiveResult>> {
  return run(async () => {
    const c = ctx()
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const po = input.purchaseOrderId
      ? c.data.purchaseOrders.find((p) => p.id === input.purchaseOrderId)
      : undefined
    if (input.purchaseOrderId && !po) return err('発注書が見つかりません')
    if (po && po.warehouseId !== input.warehouseId) return err('発注書の入荷先と拠点が一致しません')
    if (po && (po.status === 'received' || po.status === 'cancelled' || po.status === 'draft'))
      return err('この発注書は入荷を受け付けていません')

    const newLots: Lot[] = []
    const drafts: TransactionDraft[] = []
    for (const [n, l] of input.lines.entries()) {
      const item = items.get(l.itemId)
      if (!item) return err(`${n + 1}行目：商品が見つかりません`)
      const qtyBase = toBase(item, l.qty, l.unit)
      if (qtyBase <= 0) return err(`${n + 1}行目：入庫数は1以上で入力してください`)
      let lotId: string | undefined
      if (item.isLotManaged) {
        if (!l.lotNo || !l.expiryDate)
          return err(`${n + 1}行目：${item.name} はロット番号と期限の入力が必要です`)
        const existing = c.data.lots.find((x) => x.itemId === item.id && x.lotNo === l.lotNo)
        const lot = existing ?? {
          id: newId('lot'),
          itemId: item.id,
          lotNo: l.lotNo,
          receivedAt: c.now,
          expiryDate: l.expiryDate,
          supplierId: po?.supplierId,
        }
        if (!existing) newLots.push(lot)
        lotId = lot.id
      }
      const poLine = po?.lines.find((x) => x.itemId === item.id)
      drafts.push({
        ...draftBase(c, input.device),
        type: 'receive',
        itemId: item.id,
        warehouseId: input.warehouseId,
        locationId: l.locationId,
        lotId,
        qtyBase,
        inputQty: l.qty,
        inputUnit: l.unit,
        unitCost: l.unitCost ?? poLine?.unitCost ?? item.cost,
        refType: po ? 'purchase_order' : undefined,
        refId: po?.id,
      })
    }

    await delay()
    const store = getStores().data.getState()
    // 検査を通ってからロットを登録する（失敗時に孤立したロットを残さない）
    const created = post(c, drafts)
    for (const lot of newLots) store.upsert('lots', lot)

    const differences: ReceiveResult['differences'] = []
    if (po) {
      const lines = po.lines.map((pl) => {
        const got = drafts.filter((d) => d.itemId === pl.itemId).reduce((s, d) => s + d.qtyBase, 0)
        if (got > 0 && pl.receivedQtyBase + got !== pl.qtyBase) {
          differences.push({ itemId: pl.itemId, expected: pl.qtyBase - pl.receivedQtyBase, received: got })
        }
        return { ...pl, receivedQtyBase: pl.receivedQtyBase + got }
      })
      const done = lines.every((l) => l.receivedQtyBase >= l.qtyBase)
      const next: PurchaseOrder = { ...po, lines, status: done ? 'received' : 'partial' }
      store.upsert('purchaseOrders', next)
    }
    return ok({ txns: created.map((t) => scopeTransaction(c.scope, t)), differences })
  })
}
