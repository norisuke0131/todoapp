import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Result } from '@/lib/types'
import { createStores, memoryStorage, setStores } from '@/lib/store'
import { setClock } from '@/lib/utils/clock'
import { setDelayEnabled } from './_delay'
import * as repo from './index'

const NOW = '2026-10-01T09:00:00.000Z'
const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error)
  return r.data
}

beforeEach(async () => {
  setStores(createStores(memoryStorage))
  setClock(() => NOW)
  setDelayEnabled(false)
  await repo.switchRole('keeper')
})
afterAll(() => {
  setStores(undefined)
  setClock(undefined)
})

describe('ピッキングリスト（FR-307, FR-308）', () => {
  it('★ 棚番の巡回順に並び、ロット管理品には期限の近い順の推奨がつく', async () => {
    const orders = unwrap(await repo.listShippingOrders())
    expect(orders.length).toBeGreaterThan(10)
    for (const o of orders.slice(0, 10)) {
      const p = unwrap(await repo.getPickingList(o.id))
      const sorts = p.lines.map((l) => l.sortOrder)
      expect(sorts).toEqual([...sorts].sort((a, b) => a - b))
      for (const l of p.lines.filter((x) => x.isLotManaged && x.lots.length > 1)) {
        const exp = l.lots.map((x) => x.expiryDate ?? '9')
        expect(exp).toEqual([...exp].sort())
        // 推奨は期限の近いロットから埋まる（期限切れは推奨しない）
        const firstRec = l.lots.findIndex((x) => x.recommended > 0)
        expect(
          l.lots
            .slice(firstRec + 1)
            .some((x) => x.recommended > 0 && l.lots[firstRec]!.recommended < l.lots[firstRec]!.onHand),
        ).toBe(false)
      }
    }
  })

  it('受注に紐づく引当分は、その受注のピッキングでは使える数に含める', async () => {
    const o = unwrap(await repo.listShippingOrders()).find((x) =>
      x.lines.some((l) => l.itemId === 'item-1042'),
    )!
    const p = unwrap(await repo.getPickingList(o.id))
    const line = p.lines.find((l) => l.itemId === 'item-1042')!
    expect(line.available).toBe(120) // 有効在庫 90 + この受注の引当 30
  })
})

describe('棚の付け替え（FR-306, FR-209）', () => {
  it('★ 棚番の変更は棚間移動の取引で行い、実在庫は変わらない', async () => {
    const before = unwrap(await repo.getStockDetail('SKU-1042')).byWarehouse[0]!
    const locs = unwrap(await repo.listWarehouseLocations('wh-tokyo'))
    const target = locs.find((l) => l.code === 'B-05-1')!
    const r = unwrap(
      await repo.moveAllToLocation([{ itemId: 'item-1042', warehouseId: 'wh-tokyo' }], target.id),
    )
    expect(r.moved).toBe(1)
    const after = unwrap(await repo.getStockDetail('SKU-1042')).byWarehouse[0]!
    expect(after.onHand).toBe(before.onHand)
    const rows = unwrap(await repo.listStock({ warehouseId: 'wh-tokyo' }))
    expect(rows.find((x) => x.item.sku === 'SKU-1042')?.locationCode).toBe('B-05-1')
    const ledger = unwrap(await repo.getItemLedger('SKU-1042', { warehouseId: 'wh-tokyo' }))
    expect(ledger.slice(-2).map((e) => [e.txn.type, e.txn.qtyBase])).toEqual([
      ['move', -before.onHand],
      ['move', before.onHand],
    ])
  })

  it('別の拠点の棚には移せない', async () => {
    const osaka = unwrap(await repo.listWarehouseLocations('wh-osaka'))[0]!
    const r = await repo.moveAllToLocation([{ itemId: 'item-1042', warehouseId: 'wh-tokyo' }], osaka.id)
    expect(r.ok).toBe(false)
  })

  it('入庫した分を棚入れできる', async () => {
    const rec = unwrap(
      await repo.receive({ warehouseId: 'wh-tokyo', lines: [{ itemId: 'item-1042', qty: 24, unit: '本' }] }),
    )
    const loc = unwrap(await repo.listWarehouseLocations('wh-tokyo')).find((l) => l.code === 'A-03-2')!
    expect(unwrap(await repo.putaway([{ txnId: rec.txns[0]!.id, locationId: loc.id }]))).toBe(1)
    const rows = unwrap(await repo.listStock({ warehouseId: 'wh-tokyo' }))
    expect(rows.find((x) => x.item.sku === 'SKU-1042')?.locationCode).toBe('A-03-2')
  })
})

describe('入庫の計画（FR-301）', () => {
  it('発注残のある発注書と、行ごとの推奨棚を返す', async () => {
    const pos = unwrap(await repo.listOpenPurchaseOrders())
    const bottle = pos.find((p) => p.lines.some((l) => l.sku === 'SKU-1042'))!
    expect(bottle.lines[0]).toMatchObject({ ordered: 60, received: 0, remaining: 60 })
    expect(bottle.lines[0]?.suggestedLocationCode).toMatch(/^[AB]-\d\d-\d$/)
    expect(pos.some((p) => p.isDelayed)).toBe(true)
  })
})

describe('フローC後半（発注 → 入庫 → 棚入れ → FEFO出庫）', () => {
  it('★ 発注書から入庫したロットを棚に入れ、出庫は期限の近いロットから引く', async () => {
    const po = unwrap(await repo.listOpenPurchaseOrders()).find((p) => p.lines.some((l) => l.isLotManaged))!
    const line = po.lines.find((l) => l.isLotManaged)!
    const rec = unwrap(
      await repo.receive({
        warehouseId: po.warehouseId,
        purchaseOrderId: po.id,
        lines: [
          {
            itemId: line.itemId,
            qty: line.remaining,
            unit: line.baseUnit,
            lotNo: 'L-FLOWC',
            expiryDate: '2027-03-31',
          },
        ],
      }),
    )
    expect(rec.differences).toEqual([])
    const loc = unwrap(await repo.listWarehouseLocations(po.warehouseId))[0]!
    expect(unwrap(await repo.putaway([{ txnId: rec.txns[0]!.id, locationId: loc.id }]))).toBe(1)
    expect(
      unwrap(await repo.listOpenPurchaseOrders())
        .find((p) => p.id === po.id)
        ?.lines.some((l) => l.itemId === line.itemId),
    ).toBeFalsy()

    const lots = unwrap(await repo.listLots()).filter(
      (l) =>
        l.itemId === line.itemId &&
        l.warehouseId === po.warehouseId &&
        l.expiryState !== 'expired' &&
        l.available > 0,
    )
    const soonest = [...lots].sort((a, b) => (a.expiryDate ?? '9').localeCompare(b.expiryDate ?? '9'))[0]!
    const shipped = unwrap(
      await repo.ship({
        warehouseId: po.warehouseId,
        lines: [{ itemId: line.itemId, qty: 1, unit: line.baseUnit }],
        confirmOverAvailable: true,
      }),
    )
    expect(shipped.status).toBe('done')
    if (shipped.status === 'done') expect(shipped.txns[0]?.lotId).toBe(soonest.lotId)
  })
})

describe('取引一覧と移動（SC-130, SC-110）', () => {
  it('一覧は新しい順で名前つき。取消すると元は「取消済」、取消の取引も並ぶ', async () => {
    const adj = unwrap(
      await repo.adjustStock({
        itemId: 'item-1042',
        warehouseId: 'wh-tokyo',
        qty: -2,
        unit: '本',
        reasonCodeId: 'adj-damage',
      }),
    )
    unwrap(await repo.reverseTransaction(adj.id))
    const rows = unwrap(await repo.listTransactionRows())
    expect(rows[0]).toMatchObject({
      reversesTxnId: adj.id,
      sku: 'SKU-1042',
      qtyBase: 2,
      warehouseName: '東京倉庫',
    })
    expect(rows[1]).toMatchObject({ id: adj.id, isReversed: true, reasonName: '破損', qtyBase: -2 })
  })

  it('新しい移動の番号は既存の続き番号になる', async () => {
    const before = unwrap(await repo.listTransfers()).map((t) => Number(t.code.slice(3)))
    const t = unwrap(
      await repo.createTransfer({
        fromWarehouseId: 'wh-tokyo',
        toWarehouseId: 'wh-osaka',
        lines: [{ itemId: 'item-1042', qtyBase: 1 }],
      }),
    )
    expect(Number(t.code.slice(3))).toBe(Math.max(...before) + 1)
  })
})
