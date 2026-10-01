import { describe, expect, it } from 'vitest'
import type { Allocation, Lot, PurchaseOrder, Transfer } from '@/lib/types'
import { buildIndex, getSnapshot, getSnapshots, composeSnapshot, lotBalances } from './snapshot'
import { buildReversal, getLedger, onHandAsOf } from './ledger'
import { memoByGeneration } from './memo'
import { NOW, data, makeItem, txn } from './test-fixtures'

const alloc = (qty: number, over: Partial<Allocation> = {}): Allocation => ({
  id: `a${qty}`,
  itemId: 'i1',
  warehouseId: 'tokyo',
  qtyBase: qty,
  refType: 'shipping_order',
  refId: 'so1',
  status: 'active',
  createdAt: NOW,
  ...over,
})

describe('4つの在庫数（FR-102, INV-06）', () => {
  it('★ 引当を作ると、実在庫は変わらず有効在庫だけが減る（最重要）', () => {
    const txns = [txn({ type: 'opening', qtyBase: 120 })]
    const before = getSnapshot(data({ txns }), { itemId: 'i1', warehouseId: 'tokyo' }, NOW)
    const after = getSnapshot(
      data({ txns, allocations: [alloc(30)] }),
      { itemId: 'i1', warehouseId: 'tokyo' },
      NOW,
    )

    expect(before).toMatchObject({ onHand: 120, allocated: 0, available: 120 })
    expect(after.onHand).toBe(120) // 実在庫は動かない
    expect(after.allocated).toBe(30)
    expect(after.available).toBe(90) // 有効在庫だけが減る
  })

  it('引当を解除すると有効在庫が戻る。出荷済み・解除済みの引当は数えない', () => {
    const txns = [txn({ type: 'opening', qtyBase: 120 })]
    const s = getSnapshot(
      data({
        txns,
        allocations: [
          alloc(30, { id: 'a1', status: 'released' }),
          alloc(10, { id: 'a2', status: 'shipped' }),
          alloc(5, { id: 'a3' }),
        ],
      }),
      { itemId: 'i1', warehouseId: 'tokyo' },
      NOW,
    )
    expect(s).toMatchObject({ onHand: 120, allocated: 5, available: 115 })
  })

  it('★ 発注を登録すると入荷予定が増え、入庫すると入荷予定が減って実在庫が増える', () => {
    const opening = txn({ type: 'opening', qtyBase: 20 })
    const po = (received: number, status: PurchaseOrder['status']): PurchaseOrder => ({
      id: 'po1',
      code: 'PO-1',
      supplierId: 's1',
      warehouseId: 'tokyo',
      status,
      lines: [{ id: 'l1', itemId: 'i1', qtyBase: 60, receivedQtyBase: received, unitCost: 1300 }],
      createdAt: NOW,
    })
    const key = { itemId: 'i1', warehouseId: 'tokyo' }

    const ordered = getSnapshot(data({ txns: [opening], purchaseOrders: [po(0, 'ordered')] }), key, NOW)
    expect(ordered).toMatchObject({ onHand: 20, incoming: 60 })

    const partial = getSnapshot(
      data({
        txns: [opening, txn({ type: 'receive', qtyBase: 24, refType: 'purchase_order', refId: 'po1' })],
        purchaseOrders: [po(24, 'partial')],
      }),
      key,
      NOW,
    )
    expect(partial).toMatchObject({ onHand: 44, incoming: 36 })

    const done = getSnapshot(
      data({
        txns: [opening, txn({ type: 'receive', qtyBase: 60 })],
        purchaseOrders: [po(60, 'received')],
      }),
      key,
      NOW,
    )
    expect(done).toMatchObject({ onHand: 80, incoming: 0 })
  })

  it('下書き・取消済みの発注は入荷予定に含めない。他拠点の発注も含めない', () => {
    const mk = (id: string, status: PurchaseOrder['status'], wh = 'tokyo'): PurchaseOrder => ({
      id,
      code: id,
      supplierId: 's1',
      warehouseId: wh,
      status,
      lines: [{ id: `${id}l`, itemId: 'i1', qtyBase: 10, receivedQtyBase: 0, unitCost: 1 }],
      createdAt: NOW,
    })
    const d = data({
      purchaseOrders: [
        mk('a', 'draft'),
        mk('b', 'cancelled'),
        mk('c', 'ordered'),
        mk('d', 'ordered', 'osaka'),
      ],
    })
    expect(getSnapshot(d, { itemId: 'i1', warehouseId: 'tokyo' }, NOW).incoming).toBe(10)
    expect(getSnapshot(d, { itemId: 'i1' }, NOW).incoming).toBe(20)
  })

  it('★ 拠点間移動：出荷元から減り「移動中」に計上され、入荷処理で到着先に加わる', () => {
    const opening = txn({ type: 'opening', qtyBase: 100, warehouseId: 'tokyo' })
    const out = txn({
      type: 'transfer_out',
      qtyBase: -30,
      warehouseId: 'tokyo',
      refType: 'transfer',
      refId: 'tr1',
    })
    const tr = (status: Transfer['status'], received: number): Transfer => ({
      id: 'tr1',
      code: 'TR-1',
      fromWarehouseId: 'tokyo',
      toWarehouseId: 'osaka',
      status,
      shippedAt: NOW,
      lines: [{ itemId: 'i1', qtyBase: 30, receivedQtyBase: received }],
    })

    // 出荷直後
    const shipped = data({ txns: [opening, out], transfers: [tr('in_transit', 0)] })
    expect(getSnapshot(shipped, { itemId: 'i1', warehouseId: 'tokyo' }, NOW).onHand).toBe(70)
    const osakaInTransit = getSnapshot(shipped, { itemId: 'i1', warehouseId: 'osaka' }, NOW)
    expect(osakaInTransit).toMatchObject({ onHand: 0, inTransit: 30, incoming: 30 }) // ★ まだ到着先に入らない
    // 全社では「どこの棚にもない」30 が移動中として見える
    expect(getSnapshot(shipped, { itemId: 'i1' }, NOW)).toMatchObject({ onHand: 70, inTransit: 30 })

    // 入荷処理後
    const arrived = data({
      txns: [opening, out, txn({ type: 'transfer_in', qtyBase: 30, warehouseId: 'osaka', refId: 'tr1' })],
      transfers: [tr('received', 30)],
    })
    expect(getSnapshot(arrived, { itemId: 'i1', warehouseId: 'osaka' }, NOW)).toMatchObject({
      onHand: 30,
      inTransit: 0,
    })
    expect(getSnapshot(arrived, { itemId: 'i1' }, NOW).onHand).toBe(100)
  })

  it('★ 逆仕訳を追加すると在庫が元に戻り、両方の取引が履歴に残る（INV-03）', () => {
    const opening = txn({ type: 'opening', qtyBase: 120 })
    const ship = txn({ type: 'ship', qtyBase: -10, occurredAt: '2026-09-10T00:00:00.000Z' })
    const reversal = {
      ...buildReversal(ship, { userId: 'u2', device: 'pc', occurredAt: '2026-09-11T00:00:00.000Z' }),
      id: 'rev',
      seq: 999,
      createdAt: NOW,
    }

    const before = getSnapshot(data({ txns: [opening, ship] }), { itemId: 'i1' }, NOW)
    const after = getSnapshot(data({ txns: [opening, ship, reversal] }), { itemId: 'i1' }, NOW)
    expect(before.onHand).toBe(110)
    expect(after.onHand).toBe(120)

    const ledger = getLedger([opening, ship, reversal], { itemId: 'i1' })
    expect(ledger.map((r) => r.txn.id)).toEqual([opening.id, ship.id, 'rev'])
    expect(ledger.map((r) => r.balance)).toEqual([120, 110, 120])
    expect(ledger[1]?.isReversed).toBe(true) // 元取引には「取消済」
    expect(ledger[2]?.isReversal).toBe(true)
    expect(reversal.reversesTxnId).toBe(ship.id)
    expect(ship.reversedByTxnId).toBeUndefined() // 元取引は書き換えていない
  })

  it('取消済みの出庫は最終出庫日から外れる', () => {
    const opening = txn({ type: 'opening', qtyBase: 50, occurredAt: '2026-06-01T00:00:00.000Z' })
    const ship1 = txn({ type: 'ship', qtyBase: -5, occurredAt: '2026-08-01T00:00:00.000Z' })
    const ship2 = txn({ type: 'ship', qtyBase: -5, occurredAt: '2026-09-20T00:00:00.000Z' })
    const rev = {
      ...buildReversal(ship2, { userId: 'u', device: 'pc', occurredAt: '2026-09-21T00:00:00.000Z' }),
      id: 'r',
      seq: 1000,
      createdAt: NOW,
    }
    const s = getSnapshot(data({ txns: [opening, ship1, ship2, rev] }), { itemId: 'i1' }, NOW)
    expect(s.lastShippedAt).toBe(ship1.occurredAt)
    expect(s.idleDays).toBe(61)
  })

  it('任意の過去日の在庫を算出できる（FR-106）', () => {
    const txns = [
      txn({ type: 'opening', qtyBase: 100, occurredAt: '2026-07-01T00:00:00.000Z' }),
      txn({ type: 'ship', qtyBase: -30, occurredAt: '2026-08-01T00:00:00.000Z' }),
      txn({ type: 'receive', qtyBase: 50, occurredAt: '2026-09-01T00:00:00.000Z' }),
    ]
    expect(onHandAsOf(txns, { itemId: 'i1' }, '2026-07-15T00:00:00.000Z')).toBe(100)
    expect(onHandAsOf(txns, { itemId: 'i1' }, '2026-08-15T00:00:00.000Z')).toBe(70)
    expect(onHandAsOf(txns, { itemId: 'i1' }, '2026-09-15T00:00:00.000Z')).toBe(120)
    expect(getLedger(txns, { itemId: 'i1' }, '2026-08-15T00:00:00.000Z')).toHaveLength(2)
  })

  it('SKU × 拠点 × ロットの粒度で算出し、任意の軸で集約できる（FR-103）', () => {
    const txns = [
      txn({ type: 'opening', qtyBase: 40, warehouseId: 'tokyo', lotId: 'L1' }),
      txn({ type: 'opening', qtyBase: 10, warehouseId: 'tokyo', lotId: 'L2' }),
      txn({ type: 'opening', qtyBase: 25, warehouseId: 'osaka', lotId: 'L1' }),
    ]
    const d = data({ txns })
    expect(getSnapshot(d, { itemId: 'i1' }, NOW).onHand).toBe(75)
    expect(getSnapshot(d, { itemId: 'i1', warehouseId: 'tokyo' }, NOW).onHand).toBe(50)
    expect(getSnapshot(d, { itemId: 'i1', lotId: 'L1' }, NOW).onHand).toBe(65)
    expect(getSnapshot(d, { itemId: 'i1', warehouseId: 'tokyo', lotId: 'L2' }, NOW).onHand).toBe(10)
    expect(lotBalances(buildIndex(d), 'i1', 'tokyo')).toEqual(
      expect.arrayContaining([
        { lotId: 'L1', onHand: 40, allocated: 0, available: 40 },
        { lotId: 'L2', onHand: 10, allocated: 0, available: 10 },
      ]),
    )
  })

  it('一覧（getSnapshots）と単品（getSnapshot）が同じ値を返す', () => {
    const d = data({
      txns: [txn({ type: 'opening', qtyBase: 120 }), txn({ type: 'ship', qtyBase: -8 })],
      allocations: [alloc(30)],
    })
    const key = { itemId: 'i1', warehouseId: 'tokyo' }
    expect(getSnapshots(buildIndex(d), [key], NOW)[0]).toEqual(getSnapshot(d, key, NOW))
  })

  it('在庫状態は有効在庫で判定する', () => {
    const key = { itemId: 'i1', warehouseId: 'tokyo' }
    const at = (qty: number, allocated = 0) =>
      getSnapshot(
        data({
          txns: [txn({ type: 'opening', qtyBase: qty })],
          allocations: allocated ? [alloc(allocated)] : [],
        }),
        key,
        NOW,
      ).status
    expect(at(0)).toBe('stockout')
    expect(at(30, 30)).toBe('stockout') // 棚にはあるが売れない
    expect(at(59)).toBe('below_reorder')
    expect(at(120)).toBe('normal')
    expect(at(120, 70)).toBe('below_reorder') // 実在庫120でも有効在庫50
    expect(at(201)).toBe('excess') // 60 + 70×2 = 200 を超える
  })

  it('期限：最も近い期限と、閾値内の数量を返す', () => {
    const lots: Lot[] = [
      { id: 'L1', itemId: 'i1', lotNo: 'A', receivedAt: NOW, expiryDate: '2026-10-10' },
      { id: 'L2', itemId: 'i1', lotNo: 'B', receivedAt: NOW, expiryDate: '2027-03-01' },
      { id: 'L3', itemId: 'i1', lotNo: 'C', receivedAt: NOW, expiryDate: '2026-09-01' },
    ]
    const d = data({
      items: [makeItem({ isLotManaged: true })],
      lots,
      txns: [
        txn({ type: 'opening', qtyBase: 12, lotId: 'L1' }),
        txn({ type: 'opening', qtyBase: 50, lotId: 'L2' }),
        txn({ type: 'opening', qtyBase: 3, lotId: 'L3' }),
      ],
    })
    const s = getSnapshot(d, { itemId: 'i1' }, NOW)
    expect(s.nearestExpiryDate).toBe('2026-09-01')
    expect(s.expiringQty).toBe(15) // 期限切れ3 + 9日後12
  })
})

describe('メモ化（INV-04, FR-107）', () => {
  it('世代が同じなら再計算せず、トランザクション追加で世代が変われば再計算する', () => {
    let calls = 0
    const memo = memoByGeneration((txns: { qtyBase: number }[]) => {
      calls += 1
      return txns.reduce((s, t) => s + t.qtyBase, 0)
    })
    const txns = [{ qtyBase: 10 }]
    expect(memo.get(1, txns)).toBe(10)
    expect(memo.get(1, txns)).toBe(10)
    expect(calls).toBe(1)
    const next = [...txns, { qtyBase: 5 }]
    expect(memo.get(2, next)).toBe(15)
    expect(calls).toBe(2)
  })

  it('composeSnapshot は存在しない商品で例外を投げる', () => {
    expect(() => composeSnapshot(buildIndex(data()), { itemId: 'nope' }, NOW)).toThrow()
  })
})
