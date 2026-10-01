import { describe, expect, it } from 'vitest'
import type { Stocktake, StockSnapshot } from '@/lib/types'
import { NOW, makeItem, txn } from '@/lib/inventory/test-fixtures'
import { abcAnalysis } from './abc'
import { computeTurnover, idleStock, turnoverByCategory } from './turnover'
import { stocktakeAccuracy, summarizeVariance, varianceByReason } from './variance'
import { computeStockouts } from './stockout'

const period = { from: '2026-07-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }

describe('回転率・滞留（FR-603, FR-604）', () => {
  it('回転率 = 出庫金額 ÷ 平均在庫金額', () => {
    const item = makeItem({ cost: 1000 })
    const txns = [
      txn({ type: 'opening', qtyBase: 100, unitCost: 1000, occurredAt: '2026-06-01T00:00:00.000Z' }),
      txn({ type: 'ship', qtyBase: -60, occurredAt: '2026-08-01T00:00:00.000Z' }),
      txn({ type: 'receive', qtyBase: 60, unitCost: 1000, occurredAt: '2026-09-01T00:00:00.000Z' }),
    ]
    const [m] = computeTurnover([item], txns, period)
    // 出庫 60×1000 = 60,000 / 平均在庫 (100,000 + 100,000)/2 = 100,000 → 0.6
    expect(m).toMatchObject({ shippedValue: 60_000, avgStockValue: 100_000, turnover: 0.6, idleDays: 61 })
  })

  it('取り消された出庫は出庫金額から相殺される', () => {
    const item = makeItem({ cost: 1000 })
    const ship = txn({ type: 'ship', qtyBase: -10, occurredAt: '2026-08-01T00:00:00.000Z' })
    const txns = [
      txn({ type: 'opening', qtyBase: 100, unitCost: 1000, occurredAt: '2026-06-01T00:00:00.000Z' }),
      ship,
      txn({ type: 'ship', qtyBase: 10, reversesTxnId: ship.id, occurredAt: '2026-08-02T00:00:00.000Z' }),
    ]
    const [m] = computeTurnover([item], txns, period)
    expect(m?.shippedValue).toBe(0)
    expect(m?.idleDays).toBe(122) // 出庫が取り消されたので、期首棚卸から数える
  })

  it('カテゴリ別は合算してから割る', () => {
    const items = [makeItem({ id: 'a', categoryId: 'c' }), makeItem({ id: 'b', categoryId: 'c' })]
    const rows = turnoverByCategory(items, [
      { itemId: 'a', shippedValue: 100, avgStockValue: 100, turnover: 1, idleDays: 0 },
      { itemId: 'b', shippedValue: 0, avgStockValue: 300, turnover: 0, idleDays: 0 },
    ])
    expect(rows).toEqual([{ categoryId: 'c', shippedValue: 100, avgStockValue: 400, turnover: 0.25 }])
  })

  it('滞留在庫は閾値以上・在庫ありのものを滞留金額順に返す', () => {
    const s = (itemId: string, idleDays: number, stockValue: number, onHand = 1) =>
      ({ itemId, idleDays, stockValue, onHand }) as StockSnapshot
    const rows = idleStock([s('a', 120, 1000), s('b', 200, 5000), s('c', 30, 9000), s('d', 300, 9000, 0)], 90)
    expect(rows.map((r) => r.itemId)).toEqual(['b', 'a'])
  })
})

describe('ABC分析（FR-605）', () => {
  it('累積構成比で A/B/C を区分し、出庫ゼロは C', () => {
    const r = abcAnalysis([
      { itemId: 'x', shippedValue: 50 },
      { itemId: 'y', shippedValue: 30 },
      { itemId: 'z', shippedValue: 15 },
      { itemId: 'w', shippedValue: 5 },
      { itemId: 'v', shippedValue: 0 },
    ])
    expect(r.map((x) => [x.itemId, x.abcClass])).toEqual([
      ['x', 'A'], // 累積 0% → 50%
      ['y', 'A'], // 累積 50% → 80%（境界をまたぐので A）
      ['z', 'B'], // 80% → 95%
      ['w', 'C'],
      ['v', 'C'],
    ])
    expect(r[1]?.cumulativeRatio).toBeCloseTo(0.8)
  })

  it('全件ゼロでも落ちない', () => {
    expect(abcAnalysis([{ itemId: 'a', shippedValue: 0 }])[0]?.abcClass).toBe('C')
  })
})

describe('差異分析（FR-609）', () => {
  const st = (over: Partial<Stocktake>): Stocktake => ({
    id: 's',
    code: 'ST',
    warehouseId: 'tokyo',
    scope: {},
    status: 'approved',
    frozenAt: '2026-09-01T00:00:00.000Z',
    approvedAt: '2026-09-02T00:00:00.000Z',
    assigneeIds: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    lines: [
      {
        id: '1',
        itemId: 'a',
        theoreticalQty: 120,
        countedQty: 116,
        varianceQty: -4,
        varianceAmount: -5200,
        reasonCodeId: 'damage',
        countedBy: 'u1',
        note: '',
      },
      {
        id: '2',
        itemId: 'b',
        theoreticalQty: 10,
        countedQty: 12,
        varianceQty: 2,
        varianceAmount: 800,
        reasonCodeId: 'misplace',
        countedBy: 'u2',
        note: '',
      },
      {
        id: '3',
        itemId: 'c',
        theoreticalQty: 5,
        countedQty: 5,
        varianceQty: 0,
        varianceAmount: 0,
        countedBy: 'u1',
        note: '',
      },
    ],
    ...over,
  })

  it('原因別・拠点別・担当者別に集計し、承認前の棚卸は含めない', () => {
    const list = [st({}), st({ id: 'x', status: 'reviewing' }), st({ id: 'o', warehouseId: 'osaka' })]
    expect(varianceByReason(list)).toEqual([
      { reasonCodeId: 'damage', count: 2, varianceQty: -8, varianceAmount: -10400 },
      { reasonCodeId: 'misplace', count: 2, varianceQty: 4, varianceAmount: 1600 },
    ])
    expect(summarizeVariance(list, 'warehouse').map((g) => [g.key, g.varianceAmount])).toEqual([
      ['tokyo', -4400],
      ['osaka', -4400],
    ])
    expect(summarizeVariance(list, 'user').map((g) => g.key)).toEqual(['u1', 'u2'])
  })

  it('期間で絞り込める', () => {
    const out = summarizeVariance([st({})], 'reason', { from: '2026-09-05T00:00:00.000Z', to: NOW })
    expect(out).toEqual([])
  })

  it('棚卸の精度 = 差異なし行 ÷ カウント済み行', () => {
    expect(stocktakeAccuracy(st({}))).toBeCloseTo(1 / 3)
  })
})

describe('欠品分析（FR-608）', () => {
  it('欠品回数・欠品日数・機会損失（欠品日数 × 平均出庫/日 × 粗利）', () => {
    const item = makeItem({ price: 2400, cost: 1300 })
    const txns = [
      txn({ type: 'opening', qtyBase: 46, occurredAt: '2026-06-01T00:00:00.000Z' }),
      txn({ type: 'ship', qtyBase: -46, occurredAt: '2026-08-01T00:00:00.000Z' }), // 欠品1回目
      txn({ type: 'receive', qtyBase: 46, occurredAt: '2026-08-11T00:00:00.000Z' }), // 10日間
      txn({ type: 'ship', qtyBase: -46, occurredAt: '2026-09-21T00:00:00.000Z' }), // 欠品2回目 → 期末まで10日
    ]
    const [m] = computeStockouts([item], txns, period)
    expect(m?.occurrences).toBe(2)
    expect(m?.stockoutDays).toBe(20)
    expect(m?.avgDailyShipped).toBe(1) // 92本 / 92日
    expect(m?.estimatedLoss).toBe(20 * 1 * 1100)
  })

  it('期首時点で欠品中なら、期首から数える', () => {
    const item = makeItem()
    const txns = [
      txn({ type: 'opening', qtyBase: 5, occurredAt: '2026-05-01T00:00:00.000Z' }),
      txn({ type: 'ship', qtyBase: -5, occurredAt: '2026-06-01T00:00:00.000Z' }),
      txn({ type: 'receive', qtyBase: 10, occurredAt: '2026-07-11T00:00:00.000Z' }),
    ]
    const [m] = computeStockouts([item], txns, period)
    expect(m?.occurrences).toBe(0)
    expect(m?.stockoutDays).toBe(10)
  })
})
