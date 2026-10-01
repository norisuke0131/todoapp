import { describe, expect, it } from 'vitest'
import type { Lot } from '@/lib/types'
import { breakdown, formatBreakdown, toBase, unitFactor } from './unit'
import { selectLotsFefo, isFefoDeviation } from './fefo'
import { buildCostIndex, nextAverageCents, stockValueOf } from './valuation'
import { averageDailyShipped, needsReorder, recommendedOrderQty, suggestReorderPoint } from './replenish'
import { getSnapshot } from './snapshot'
import { NOW, data, makeItem, txn } from './test-fixtures'

describe('単位換算（FR-110）', () => {
  const item = makeItem()

  it('ケースで入庫し、バラで出庫しても最小単位で正しく積み上がる', () => {
    const inQty = toBase(item, 3, 'ケース') // 72本
    const outQty = toBase(item, 5, '本')
    const outBall = toBase(item, 2, 'ボール') // 12本
    expect(inQty).toBe(72)
    const d = data({
      txns: [
        txn({ type: 'receive', qtyBase: inQty, inputQty: 3, inputUnit: 'ケース' }),
        txn({ type: 'ship', qtyBase: -outQty }),
        txn({ type: 'ship', qtyBase: -outBall, inputQty: -2, inputUnit: 'ボール' }),
      ],
    })
    expect(getSnapshot(d, { itemId: 'i1' }, NOW).onHand).toBe(55)
  })

  it('大きい単位から分解して表示する', () => {
    expect(breakdown(item, 53).parts).toEqual([
      { unit: 'ケース', qty: 2 },
      { unit: 'ボール', qty: 0 },
      { unit: '本', qty: 5 },
    ])
    expect(formatBreakdown(item, 53)).toBe('2ケース 5本')
    expect(formatBreakdown(item, -30)).toBe('−1ケース 1ボール')
    expect(formatBreakdown(item, 0)).toBe('0本')
  })

  it('未登録の単位は例外、基本単位は係数1', () => {
    expect(unitFactor(item, '本')).toBe(1)
    expect(() => toBase(item, 1, 'パレット')).toThrow('単位「パレット」は登録されていません')
  })
})

describe('FEFO（FR-308）', () => {
  const lots: Lot[] = [
    { id: 'late', itemId: 'i1', lotNo: 'L-03', receivedAt: '2026-08-01', expiryDate: '2027-01-31' },
    { id: 'soon', itemId: 'i1', lotNo: 'L-01', receivedAt: '2026-07-01', expiryDate: '2026-10-20' },
    { id: 'mid', itemId: 'i1', lotNo: 'L-02', receivedAt: '2026-07-15', expiryDate: '2026-12-01' },
    { id: 'expired', itemId: 'i1', lotNo: 'L-00', receivedAt: '2026-05-01', expiryDate: '2026-09-15' },
  ]
  const stocks = [
    { lotId: 'late', available: 50 },
    { lotId: 'soon', available: 8 },
    { lotId: 'mid', available: 10 },
    { lotId: 'expired', available: 4 },
  ]

  it('期限が近い順にロットを選ぶ。期限切れは既定で除外する', () => {
    const r = selectLotsFefo(stocks, lots, 15, NOW)
    expect(r.picks).toEqual([
      { lotId: 'soon', qty: 8, expiryDate: '2026-10-20' },
      { lotId: 'mid', qty: 7, expiryDate: '2026-12-01' },
    ])
    expect(r.shortfall).toBe(0)
  })

  it('期限切れを含める指定ができ、不足数を返す', () => {
    const r = selectLotsFefo(stocks, lots, 100, NOW, { includeExpired: true })
    expect(r.picks[0]?.lotId).toBe('expired')
    expect(r.shortfall).toBe(28)
  })

  it('推奨と違うロットを選ぶと逸脱と判定する', () => {
    const r = selectLotsFefo(stocks, lots, 5, NOW)
    expect(isFefoDeviation(r, 'soon')).toBe(false)
    expect(isFefoDeviation(r, 'late')).toBe(true)
  })
})

describe('移動平均原価（FR-111）', () => {
  it('入庫のたびに単価を更新し、出庫では変わらない', () => {
    const txns = [
      txn({ type: 'opening', qtyBase: 100, unitCost: 1000, occurredAt: '2026-07-01T00:00:00.000Z' }),
      txn({ type: 'receive', qtyBase: 100, unitCost: 1300, occurredAt: '2026-07-10T00:00:00.000Z' }),
      txn({ type: 'ship', qtyBase: -150, occurredAt: '2026-07-20T00:00:00.000Z' }),
      txn({ type: 'receive', qtyBase: 50, unitCost: 1500, occurredAt: '2026-08-01T00:00:00.000Z' }),
    ]
    const idx = buildCostIndex(txns)
    // (100×1000 + 100×1300) / 200 = 1150 → 出庫後 50本@1150 → (50×1150 + 50×1500)/100 = 1325
    expect(idx.unitCostAt('i1', '2026-07-15T00:00:00.000Z')).toBe(1150)
    expect(idx.unitCostAt('i1', '2026-07-25T00:00:00.000Z')).toBe(1150)
    expect(idx.unitCostOf('i1')).toBe(1325)
    expect(idx.timeline('i1')).toHaveLength(3)
  })

  it('端数は1/100円の整数で計算し、浮動小数の誤差を持ち込まない', () => {
    // 3本@100.10 + 7本@100.20 = 100.17
    expect(nextAverageCents(3, 10010, 7, 10020)).toBe(10017)
    expect(stockValueOf(3, 0.1)).toBe(0) // 0.3円 → 0円
    expect(stockValueOf(10, 1234.56)).toBe(12346)
    // 0.1 + 0.2 の誤差が出ない
    const idx = buildCostIndex([
      txn({ type: 'receive', qtyBase: 1, unitCost: 0.1 }),
      txn({ type: 'receive', qtyBase: 1, unitCost: 0.2 }),
    ])
    expect(idx.unitCostOf('i1')).toBe(0.15)
  })

  it('在庫がゼロになった後の入庫は、その入庫単価で始め直す', () => {
    const idx = buildCostIndex([
      txn({ type: 'receive', qtyBase: 10, unitCost: 500, occurredAt: '2026-07-01T00:00:00.000Z' }),
      txn({ type: 'ship', qtyBase: -10, occurredAt: '2026-07-02T00:00:00.000Z' }),
      txn({ type: 'receive', qtyBase: 10, unitCost: 800, occurredAt: '2026-07-03T00:00:00.000Z' }),
    ])
    expect(idx.unitCostOf('i1')).toBe(800)
  })

  it('拠点間移動は単価に影響しない', () => {
    const idx = buildCostIndex([
      txn({ type: 'receive', qtyBase: 10, unitCost: 500, occurredAt: '2026-07-01T00:00:00.000Z' }),
      txn({ type: 'transfer_out', qtyBase: -10, occurredAt: '2026-07-02T00:00:00.000Z' }),
      txn({ type: 'receive', qtyBase: 10, unitCost: 700, occurredAt: '2026-07-03T00:00:00.000Z' }),
    ])
    expect(idx.unitCostOf('i1')).toBe(600) // 移動中の10本も自社在庫として平均に含める
  })
})

describe('推奨発注（FR-503, FR-504, FR-502）', () => {
  it('★ 判定に入荷予定を含める（実在庫だけで判定しない）', () => {
    // 5章フローCの例：SKU-1042 有効80・入荷60・発注点60 → 発注不要
    expect(needsReorder({ available: 80, incoming: 60, reorderPoint: 60 })).toBe(false)
    // 有効40 + 入荷60 = 100 ≥ 60 → 発注不要（実在庫だけなら発注してしまう）
    expect(needsReorder({ available: 40, incoming: 60, reorderPoint: 60 })).toBe(false)
    expect(needsReorder({ available: 40, incoming: 0, reorderPoint: 60 })).toBe(true)
  })

  it('境界：有効在庫 + 入荷予定 が発注点ちょうどなら発注しない', () => {
    expect(needsReorder({ available: 30, incoming: 30, reorderPoint: 60 })).toBe(false)
    expect(needsReorder({ available: 30, incoming: 29, reorderPoint: 60 })).toBe(true)
  })

  it('推奨数量は不足数を発注ロットで切り上げる', () => {
    expect(recommendedOrderQty({ available: 12, incoming: 0, reorderPoint: 50 }, 24)).toBe(48)
    expect(recommendedOrderQty({ available: 12, incoming: 0, reorderPoint: 50 }, 1)).toBe(38)
    expect(recommendedOrderQty({ available: 80, incoming: 60, reorderPoint: 60 }, 24)).toBe(0)
  })

  it('スナップショットから判定すると、引当と発注残が反映される', () => {
    const d = data({
      txns: [txn({ type: 'opening', qtyBase: 70 })],
      allocations: [
        {
          id: 'a',
          itemId: 'i1',
          warehouseId: 'tokyo',
          qtyBase: 30,
          refType: 'shipping_order',
          refId: 'x',
          status: 'active',
          createdAt: NOW,
        },
      ],
    })
    const s = getSnapshot(d, { itemId: 'i1', warehouseId: 'tokyo' }, NOW)
    expect(s.onHand).toBe(70) // 実在庫だけなら発注点60を上回っている
    expect(needsReorder(s)).toBe(true) // 有効在庫40で判定するので発注が必要
  })

  it('発注点の推奨値 = リードタイム × 平均出庫 + 安全在庫', () => {
    const txns = [
      txn({ type: 'opening', qtyBase: 500, occurredAt: '2026-08-01T00:00:00.000Z' }),
      txn({ type: 'ship', qtyBase: -60, occurredAt: '2026-09-10T00:00:00.000Z' }),
      txn({ type: 'ship', qtyBase: -30, occurredAt: '2026-09-25T00:00:00.000Z' }),
      txn({ type: 'ship', qtyBase: -999, occurredAt: '2026-06-01T00:00:00.000Z' }), // 期間外
    ]
    const avg = averageDailyShipped(txns, 'i1', NOW, 30)
    expect(avg).toBe(3)
    expect(suggestReorderPoint({ leadTimeDays: 7, safetyStock: 40 }, avg)).toBe(61)
  })
})
