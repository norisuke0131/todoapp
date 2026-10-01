// 出庫（ピッキング）（SC-102, FR-307〜FR-309）
import type { Device, Result, TransactionDraft } from '@/lib/types'
import { composeSnapshot, isFefoDeviation, lotBalances, selectLotsFefo, toBase } from '@/lib/inventory'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run } from './_context'
import { delay } from './_delay'
import { draftBase, post } from './_post'
import { scopeTransaction, type ScopedTransaction } from './_scope'

export type ShipLine = {
  itemId: string
  qty: number
  unit: string
  locationId?: string
  lotId?: string
  fefoReason?: string
}
export type ShipInput = {
  warehouseId: string
  shippingOrderId?: string
  lines: ShipLine[]
  device?: Device
  confirmOverAvailable?: boolean
}

export type ShipWarning = { itemId: string; available: number; requested: number }

export type ShipResult =
  | { status: 'done'; txns: ScopedTransaction[]; warnings: ShipWarning[] }
  /** ★ 有効在庫を超える出庫は止めずに、確認を求める（FR-309） */
  | { status: 'needs_confirmation'; warnings: ShipWarning[] }
  /** FEFO の推奨と違うロットを選んだ。理由を求める（FR-308） */
  | { status: 'needs_fefo_reason'; itemId: string; recommendedLotId: string }

export async function ship(input: ShipInput): Promise<Result<ShipResult>> {
  return run(async () => {
    const c = ctx()
    const index = c.index()
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const lotsById = new Map(c.data.lots.map((l) => [l.id, l]))
    const drafts: TransactionDraft[] = []
    const warnings: ShipWarning[] = []

    for (const [n, l] of input.lines.entries()) {
      const item = items.get(l.itemId)
      if (!item) return err(`${n + 1}行目：商品が見つかりません`)
      const qtyBase = toBase(item, l.qty, l.unit)
      if (qtyBase <= 0) return err(`${n + 1}行目：出庫数は1以上で入力してください`)
      const snap = composeSnapshot(index, { itemId: item.id, warehouseId: input.warehouseId }, c.now)
      // 受注に紐づく出庫は、自分の引当分を使える
      const ownAlloc = input.shippingOrderId
        ? c.data.allocations
            .filter((a) => a.status === 'active' && a.refId === input.shippingOrderId && a.itemId === item.id)
            .reduce((s, a) => s + a.qtyBase, 0)
        : 0
      const usable = snap.available + ownAlloc
      if (qtyBase > usable) warnings.push({ itemId: item.id, available: usable, requested: qtyBase })

      const base = {
        ...draftBase(c, input.device),
        type: 'ship' as const,
        itemId: item.id,
        warehouseId: input.warehouseId,
        locationId: l.locationId,
        inputQty: -l.qty,
        inputUnit: l.unit,
        refType: input.shippingOrderId ? ('shipping_order' as const) : undefined,
        refId: input.shippingOrderId,
      }
      if (!item.isLotManaged) {
        drafts.push({ ...base, qtyBase: -qtyBase })
        continue
      }
      const stocks = lotBalances(index, item.id, input.warehouseId).map((b) => ({
        lotId: b.lotId,
        available: b.onHand,
      }))
      const fefo = selectLotsFefo(stocks, lotsById, qtyBase, c.now)
      if (l.lotId) {
        if (isFefoDeviation(fefo, l.lotId) && !l.fefoReason) {
          return ok({ status: 'needs_fefo_reason', itemId: item.id, recommendedLotId: fefo.picks[0]!.lotId })
        }
        drafts.push({
          ...base,
          lotId: l.lotId,
          qtyBase: -qtyBase,
          note: l.fefoReason ? `FEFO逸脱：${l.fefoReason}` : '',
        })
      } else {
        const picks =
          fefo.shortfall > 0
            ? selectLotsFefo(stocks, lotsById, qtyBase, c.now, { includeExpired: true }).picks
            : fefo.picks
        if (picks.length === 0) return err(`${item.name}：出庫できるロットがありません`)
        let rest = qtyBase
        picks.forEach((p, i) => {
          const q = i === picks.length - 1 ? rest : p.qty
          rest -= q
          drafts.push({ ...base, lotId: p.lotId, qtyBase: -q, inputQty: -q, inputUnit: item.baseUnit })
        })
      }
    }

    if (warnings.length > 0 && !input.confirmOverAvailable)
      return ok({ status: 'needs_confirmation', warnings })

    await delay()
    const created = post(c, drafts)

    // 受注の引当を「出荷済」にし、出荷数を記録する
    if (input.shippingOrderId) {
      const store = getStores().data.getState()
      const so = c.data.shippingOrders.find((s) => s.id === input.shippingOrderId)
      for (const a of c.data.allocations.filter(
        (x) => x.status === 'active' && x.refId === input.shippingOrderId,
      )) {
        if (drafts.some((d) => d.itemId === a.itemId))
          store.upsert('allocations', { ...a, status: 'shipped', releasedAt: c.now })
      }
      if (so) {
        const lines = so.lines.map((l) => ({
          ...l,
          shippedQtyBase:
            l.shippedQtyBase - drafts.filter((d) => d.itemId === l.itemId).reduce((s, d) => s + d.qtyBase, 0),
        }))
        store.upsert('shippingOrders', {
          ...so,
          lines,
          status: lines.every((l) => l.shippedQtyBase >= l.qtyBase) ? 'shipped' : 'picking',
        })
      }
    }
    return ok({ status: 'done', txns: created.map((t) => scopeTransaction(c.scope, t)), warnings })
  })
}
