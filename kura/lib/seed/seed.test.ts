// シードの品質検査（7章「シード作成のルール」を1つずつ確かめる）
import { beforeAll, describe, expect, it } from 'vitest'
import { buildIndex, composeSnapshot, byOccurred, needsReorder, stockedPairs, isIdle } from '@/lib/inventory'
import type { StockSnapshot } from '@/lib/types'
import { generateSeed, type SeedData } from './index'

const NOW = '2026-10-01T09:00:00.000Z'
let seed: SeedData
let snaps: StockSnapshot[]

beforeAll(() => {
  seed = generateSeed(NOW)
  const index = buildIndex(seed)
  snaps = stockedPairs(index).map((k) => composeSnapshot(index, k, NOW))
})

describe('件数（7章の表）', () => {
  it('マスタ', () => {
    expect(seed.warehouses).toHaveLength(2)
    expect(seed.locations).toHaveLength(120)
    expect(seed.users).toHaveLength(6)
    expect(seed.categories).toHaveLength(8)
    expect(seed.partners.filter((p) => p.kind === 'supplier')).toHaveLength(12)
    expect(seed.partners.filter((p) => p.kind === 'customer')).toHaveLength(20)
    expect(seed.items).toHaveLength(620)
  })

  it('取引・ロット・引当・発注・出荷・移動・棚卸', () => {
    console.info('txns', seed.txns.length, 'lots', seed.lots.length, 'allocations', seed.allocations.length)
    expect(seed.txns.length).toBeGreaterThan(4300)
    expect(seed.txns.length).toBeLessThan(5800)
    expect(seed.lots.length).toBeGreaterThan(300)
    expect(seed.lots.length).toBeLessThan(520)
    expect(seed.allocations.length).toBeGreaterThanOrEqual(75)
    expect(seed.allocations.length).toBeLessThanOrEqual(105)
    expect(seed.purchaseOrders).toHaveLength(45)
    expect(seed.shippingOrders).toHaveLength(60)
    expect(seed.transfers).toHaveLength(12)
    expect(seed.stocktakes).toHaveLength(4)
  })

  it('東京倉庫は 240 SKU、全拠点で 620 SKU', () => {
    const tokyo = new Set(snaps.filter((s) => s.warehouseId === 'wh-tokyo').map((s) => s.itemId))
    expect(tokyo.size).toBe(240)
    expect(new Set(snaps.map((s) => s.itemId)).size).toBe(620)
  })
})

describe('時系列の整合性', () => {
  it('★ どの時点でも、商品×拠点×ロットの在庫がマイナスにならない', () => {
    const bal = new Map<string, number>()
    for (const t of [...seed.txns].sort(byOccurred)) {
      for (const k of [`${t.itemId}|${t.warehouseId}`, `${t.itemId}|${t.warehouseId}|${t.lotId ?? '-'}`]) {
        const v = (bal.get(k) ?? 0) + t.qtyBase
        bal.set(k, v)
        expect(v, `${k} @ ${t.occurredAt}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('日付は now からの相対で、未来の取引がない', () => {
    expect(seed.txns.every((t) => t.occurredAt <= NOW)).toBe(true)
    const shifted = generateSeed('2027-01-01T00:00:00.000Z')
    expect(shifted.txns[0]?.occurredAt.slice(0, 10)).toBe('2026-07-05')
  })

  it('同じ now なら同じデータ（決定的）', () => {
    const again = generateSeed(NOW)
    expect(again.txns.length).toBe(seed.txns.length)
    expect(again.txns[1234]).toEqual(seed.txns[1234])
  })

  it('seq は時系列順の連番', () => {
    expect(seed.txns.map((t) => t.seq)).toEqual(seed.txns.map((_, i) => i + 1))
  })

  it('ロット管理品の取引には必ずロットがあり、調整と棚卸差異には理由がある', () => {
    const lotItems = new Set(seed.items.filter((i) => i.isLotManaged).map((i) => i.id))
    expect(seed.txns.filter((t) => lotItems.has(t.itemId)).every((t) => t.lotId)).toBe(true)
    expect(
      seed.txns.filter((t) => t.type === 'adjust' || t.type === 'stocktake').every((t) => t.reasonCodeId),
    ).toBe(true)
  })
})

describe('在庫状態の分散', () => {
  it('★ 欠品／発注点以下／適正／過剰／滞留がすべて存在する', () => {
    const count = (st: string) => snaps.filter((s) => s.status === st).length
    expect(count('stockout')).toBeGreaterThan(10)
    expect(count('below_reorder')).toBeGreaterThan(50)
    expect(count('normal')).toBeGreaterThan(200)
    expect(count('excess')).toBeGreaterThan(50)
    expect(snaps.filter((s) => isIdle(s.idleDays)).length).toBeGreaterThan(50)
  })

  it('★ 実在庫は発注点以上なのに、引当で有効在庫が発注点を下回る商品がある', () => {
    const hidden = snaps.filter(
      (s) => s.allocated > 0 && s.onHand >= s.reorderPoint && s.available < s.reorderPoint,
    )
    expect(hidden.length).toBeGreaterThanOrEqual(5)
  })

  it('★ 入荷予定のおかげで発注不要になっている商品と、要発注の商品が両方ある', () => {
    const covered = snaps.filter((s) => s.incoming > 0 && s.available < s.reorderPoint && !needsReorder(s))
    const needs = snaps.filter((s) => needsReorder(s))
    expect(covered.length).toBeGreaterThanOrEqual(3)
    expect(needs.length).toBeGreaterThanOrEqual(15)
  })

  it('★ 期限切れ・期限間近のロットがある', () => {
    const index = buildIndex(seed)
    const expired = seed.lots.filter((l) => {
      const s = composeSnapshot(index, { itemId: l.itemId, lotId: l.id }, NOW)
      return s.onHand > 0 && (l.expiryDate ?? '9') < NOW.slice(0, 10)
    })
    expect(expired.length).toBeGreaterThanOrEqual(3)
    expect(snaps.filter((s) => (s.expiringQty ?? 0) > 0).length).toBeGreaterThanOrEqual(10)
  })

  it('★ 移動中の在庫・遅延発注・未承認の棚卸差異がある', () => {
    expect(seed.transfers.filter((t) => t.status === 'in_transit')).toHaveLength(3)
    const late = seed.purchaseOrders.filter((p) => p.status === 'ordered' && (p.expectedAt ?? '9') < NOW)
    expect(late.length).toBeGreaterThanOrEqual(2)
    const reviewing = seed.stocktakes.find((s) => s.status === 'reviewing')
    expect(reviewing?.lines.some((l) => (l.varianceQty ?? 0) !== 0 && !l.reasonCodeId)).toBe(true)
  })

  it('★ 差異の原因が分散している', () => {
    const reasons = new Set(seed.txns.filter((t) => t.type === 'stocktake').map((t) => t.reasonCodeId))
    expect(reasons.size).toBeGreaterThanOrEqual(4)
  })
})

describe('フローA・Cで使う固定商品', () => {
  it('SKU-1042（東京）：実在庫120・引当30・有効90・入荷予定60・発注点60', () => {
    const item = seed.items.find((i) => i.sku === 'SKU-1042')!
    const s = snaps.find((x) => x.itemId === item.id && x.warehouseId === 'wh-tokyo')!
    expect(s).toMatchObject({ onHand: 120, allocated: 30, available: 90, incoming: 60, reorderPoint: 60 })
  })

  it('SKU-2011（東京）：有効在庫12で要発注', () => {
    const item = seed.items.find((i) => i.sku === 'SKU-2011')!
    const s = snaps.find((x) => x.itemId === item.id && x.warehouseId === 'wh-tokyo')!
    expect(s.available).toBe(12)
    expect(needsReorder(s)).toBe(true)
  })
})
