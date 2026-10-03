// 在庫移動（SC-110, SC-111, FR-311〜FR-313）
// 拠点間：出荷で出荷元から減り「移動中」へ。到着の入荷処理で到着先に加わる
// 棚間：同じ拠点内で即時に付け替える（移動中を持たない）
import type { Result, Transfer, TransactionDraft } from '@/lib/types'
import { daysBetween } from '@/lib/inventory'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId } from './_context'
import { delay } from './_delay'
import { DENY_REASON } from './_scope'
import { draftBase, post } from './_post'

export async function listTransfers(): Promise<Result<(Transfer & { daysInTransit?: number })[]>> {
  return run(() => {
    const c = ctx()
    const visible = c.data.transfers.filter(
      (t) =>
        c.scope.allWarehouses ||
        c.scope.warehouseIds.includes(t.fromWarehouseId) ||
        c.scope.warehouseIds.includes(t.toWarehouseId),
    )
    return ok(
      visible.map((t) => ({
        ...t,
        daysInTransit: t.status === 'in_transit' ? daysBetween(t.shippedAt, c.now) : undefined,
      })),
    )
  })
}

type TransferLineInput = { itemId: string; qtyBase: number; lotId?: string }

export async function createTransfer(input: {
  fromWarehouseId: string
  toWarehouseId: string
  lines: TransferLineInput[]
}): Promise<Result<Transfer>> {
  return run(async () => {
    const c = ctx()
    if (input.fromWarehouseId === input.toWarehouseId)
      return err('出荷元と到着先が同じです。棚間移動を使ってください')
    if (!c.scope.can('transfer.create', { fromWarehouseId: input.fromWarehouseId }))
      return err(DENY_REASON['transfer.create'])
    const id = newId('tr')
    const drafts: TransactionDraft[] = input.lines.map((l) => ({
      ...draftBase(c, 'mobile'),
      type: 'transfer_out',
      itemId: l.itemId,
      warehouseId: input.fromWarehouseId,
      lotId: l.lotId,
      qtyBase: -l.qtyBase,
      inputQty: -l.qtyBase,
      inputUnit: c.data.items.find((i) => i.id === l.itemId)?.baseUnit ?? '',
      refType: 'transfer',
      refId: id,
    }))
    await delay()
    post(c, drafts)
    const transfer: Transfer = {
      id,
      code: `TR-${1 + Math.max(2400, ...c.data.transfers.map((t) => Number(t.code.slice(3)) || 0))}`,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      status: 'in_transit',
      shippedAt: c.now,
      lines: input.lines.map((l) => ({ ...l, receivedQtyBase: 0 })),
    }
    getStores().data.getState().upsert('transfers', transfer)
    return ok(transfer)
  })
}

/** 到着の入荷処理。received を省略すると全数到着とする。差異は警告として返す */
export async function receiveTransfer(
  transferId: string,
  received?: Record<string, number>,
): Promise<
  Result<{ transfer: Transfer; differences: { itemId: string; shipped: number; received: number }[] }>
> {
  return run(async () => {
    const c = ctx()
    const tr = c.data.transfers.find((t) => t.id === transferId)
    if (!tr) return err('移動が見つかりません')
    if (tr.status !== 'in_transit') return err('この移動はすでに入荷済みです')
    if (!c.scope.can('txn.inout', { warehouseId: tr.toWarehouseId }))
      return err('到着先の拠点で入荷処理を行えません')
    const differences: { itemId: string; shipped: number; received: number }[] = []
    const drafts: TransactionDraft[] = tr.lines.flatMap((l) => {
      const got = received?.[l.itemId] ?? l.qtyBase - l.receivedQtyBase
      if (got !== l.qtyBase - l.receivedQtyBase)
        differences.push({ itemId: l.itemId, shipped: l.qtyBase, received: got })
      if (got <= 0) return []
      return [
        {
          ...draftBase(c, 'scanner'),
          type: 'transfer_in' as const,
          itemId: l.itemId,
          warehouseId: tr.toWarehouseId,
          lotId: l.lotId,
          qtyBase: got,
          inputQty: got,
          inputUnit: c.data.items.find((i) => i.id === l.itemId)?.baseUnit ?? '',
          refType: 'transfer' as const,
          refId: tr.id,
        },
      ]
    })
    await delay()
    post(c, drafts)
    const next: Transfer = {
      ...tr,
      status: 'received',
      receivedAt: c.now,
      lines: tr.lines.map((l) => ({
        ...l,
        receivedQtyBase: l.receivedQtyBase + (received?.[l.itemId] ?? l.qtyBase - l.receivedQtyBase),
      })),
    }
    getStores().data.getState().upsert('transfers', next)
    return ok({ transfer: next, differences })
  })
}

/** 棚間移動：同じ拠点の棚Aから −、棚Bへ +（FR-313） */
export async function moveBetweenLocations(input: {
  itemId: string
  warehouseId: string
  fromLocationId: string
  toLocationId: string
  qtyBase: number
  lotId?: string
}): Promise<Result<true>> {
  return run(async () => {
    const c = ctx()
    if (input.fromLocationId === input.toLocationId) return err('移動元と移動先の棚が同じです')
    const locs = new Map(c.data.locations.map((l) => [l.id, l]))
    if (
      locs.get(input.fromLocationId)?.warehouseId !== input.warehouseId ||
      locs.get(input.toLocationId)?.warehouseId !== input.warehouseId
    ) {
      return err('棚番が拠点と一致しません')
    }
    const unit = c.data.items.find((i) => i.id === input.itemId)?.baseUnit ?? ''
    const common = {
      ...draftBase(c, 'mobile'),
      type: 'move' as const,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      lotId: input.lotId,
      inputUnit: unit,
    }
    await delay()
    post(c, [
      { ...common, locationId: input.fromLocationId, qtyBase: -input.qtyBase, inputQty: -input.qtyBase },
      { ...common, locationId: input.toLocationId, qtyBase: input.qtyBase, inputQty: input.qtyBase },
    ])
    return ok(true)
  })
}
