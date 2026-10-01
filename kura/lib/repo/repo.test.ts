// リポジトリ層のテスト：スコープ（見える行・見える列）と、4章「ロールを跨ぐ体験」
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Result, Role } from '@/lib/types'
import { createStores, memoryStorage, setStores } from '@/lib/store'
import { setClock } from '@/lib/utils/clock'
import { setDelayEnabled } from './_delay'
import * as repo from './index'

const NOW = '2026-10-01T09:00:00.000Z'

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error)
  return r.data
}

async function as(role: Role, wh = 'wh-tokyo') {
  unwrap(await repo.switchRole(role, wh))
}

async function bottle(role: Role = 'keeper') {
  await as(role)
  const d = unwrap(await repo.getStockDetail('SKU-1042'))
  return d.byWarehouse.find((w) => w.warehouseId === 'wh-tokyo')!
}

beforeEach(() => {
  setStores(createStores(memoryStorage))
  setClock(() => NOW)
  setDelayEnabled(false)
})
afterAll(() => {
  setStores(undefined)
  setClock(undefined)
})

describe('データスコープと項目スコープ（SCP-01〜03, FR-707, FR-708）', () => {
  it('★ 現場担当（東京）：東京の 240 SKU だけ。原価・在庫金額はキーごと存在しない', async () => {
    await as('staff', 'wh-tokyo')
    const rows = unwrap(await repo.listStock())
    expect(rows).toHaveLength(240)
    expect(rows.every((r) => r.warehouseId === 'wh-tokyo')).toBe(true)
    for (const r of rows) {
      expect('cost' in r.item).toBe(false)
      expect('unitCost' in r.snapshot).toBe(false)
      expect('stockValue' in r.snapshot).toBe(false)
    }
    // JSON にしても出てこない（CSS で隠しているのではない）
    expect(JSON.stringify(rows)).not.toMatch(/"(cost|unitCost|stockValue)"/)
  })

  it('★ 在庫管理者：全拠点 620 SKU。原価・在庫金額が出現する', async () => {
    await as('keeper')
    const rows = unwrap(await repo.listStock())
    expect(rows).toHaveLength(620)
    expect(rows.every((r) => r.warehouseId === undefined)).toBe(true)
    expect(
      rows.every((r) => typeof r.item.cost === 'number' && typeof r.snapshot.stockValue === 'number'),
    ).toBe(true)
  })

  it('現場担当（大阪）は大阪の行だけ。東京を指定するとエラー', async () => {
    await as('staff', 'wh-osaka')
    const rows = unwrap(await repo.listStock())
    expect(rows.length).toBe(460)
    expect(rows.every((r) => r.warehouseId === 'wh-osaka')).toBe(true)
    const denied = await repo.listStock({ warehouseId: 'wh-tokyo' })
    expect(denied.ok).toBe(false)
  })

  it('管理者だけに設定・操作ログの権限がある', async () => {
    await as('keeper')
    expect(unwrap(await repo.getSession()).permissions['admin.access'].allowed).toBe(false)
    await as('admin')
    expect(unwrap(await repo.getSession()).permissions['admin.access'].allowed).toBe(true)
  })

  it('権限のない操作は、理由つきで拒否する（FR-712）', async () => {
    await as('staff')
    const s = unwrap(await repo.getSession())
    expect(s.permissions['adjust.write']).toEqual({
      allowed: false,
      reason: '在庫調整は在庫管理者以上が行えます',
    })
    const r = await repo.adjustStock({
      itemId: 'item-1042',
      warehouseId: 'wh-tokyo',
      qty: -1,
      unit: '本',
      reasonCodeId: 'adj-damage',
    })
    expect(r).toEqual({ ok: false, error: '在庫調整は在庫管理者以上が行えます' })
  })

  it('ダッシュボード：現場担当は自拠点のみ・金額なし、在庫管理者は全拠点・金額あり（FR-602）', async () => {
    await as('staff')
    const staff = unwrap(await repo.getDashboard())
    expect(staff.scopeLabel).toBe('東京倉庫')
    expect(staff.skuCount).toBe(240)
    expect('stockValue' in staff).toBe(false)
    await as('keeper')
    const keeper = unwrap(await repo.getDashboard())
    expect(keeper.skuCount).toBe(620)
    expect(keeper.stockValue).toBeGreaterThan(0)
    expect(keeper.delayedPurchaseOrders).toBeGreaterThanOrEqual(2)
    expect(keeper.pendingVarianceStocktakes).toBeGreaterThanOrEqual(1)
  })

  it('元帳の単価は、現場担当には返さない', async () => {
    await as('staff')
    const ledger = unwrap(await repo.getItemLedger('SKU-1042'))
    expect(ledger.length).toBeGreaterThan(3)
    expect(ledger.every((e) => !('unitCost' in e.txn))).toBe(true)
  })
})

describe('4章「ロールを跨ぐ体験」', () => {
  it('1. 現場担当で出庫 → 在庫管理者で見ると在庫が減り、履歴に並ぶ', async () => {
    const before = await bottle()
    await as('staff')
    const r = unwrap(
      await repo.ship({ warehouseId: 'wh-tokyo', lines: [{ itemId: 'item-1042', qty: 10, unit: '本' }] }),
    )
    expect(r.status).toBe('done')
    const after = await bottle('keeper')
    expect(after.onHand).toBe(before.onHand - 10)
    const ledger = unwrap(await repo.getItemLedger('SKU-1042', { warehouseId: 'wh-tokyo' }))
    expect(ledger.at(-1)).toMatchObject({ balance: after.onHand, userName: '高瀬 湊' })
    expect(ledger.at(-1)?.txn.qtyBase).toBe(-10)
  })

  it('★ 2. 棚卸：カウントしても承認まで在庫は動かず、未分類があると承認できない。承認で差異トランザクションが入る', async () => {
    await as('keeper')
    const st = unwrap(
      await repo.startStocktake({ warehouseId: 'wh-tokyo', areas: ['A'], assigneeIds: ['u-staff-1'] }),
    )
    const line = st.lines.find((l) => l.itemId === 'item-1042')!
    expect(line.theoreticalQty).toBe(120) // 凍結時点の理論在庫

    await as('staff')
    for (const l of st.lines)
      unwrap(await repo.countLine(st.id, l.id, l.id === line.id ? 116 : l.theoreticalQty))
    expect((await bottle()).onHand).toBe(120) // ★ カウントしただけでは動かない
    await as('staff')
    unwrap(await repo.submitCounts(st.id))

    await as('keeper')
    const blocked = await repo.approveStocktake(st.id)
    expect(blocked).toEqual({
      ok: false,
      error: '原因が未分類の差異が 1 件あります。すべて分類してから承認してください',
    })
    expect((await bottle()).onHand).toBe(120) // ★ 承認前は動かない

    const reviewed = unwrap(await repo.getStocktake(st.id))
    expect(reviewed.lines.find((l) => l.id === line.id)).toMatchObject({
      varianceQty: -4,
      varianceAmount: -5200,
    })

    unwrap(await repo.classifyLine(st.id, line.id, 'var-damage'))
    const approved = unwrap(await repo.approveStocktake(st.id))
    expect(approved.generated).toBe(1)
    expect((await bottle()).onHand).toBe(116) // ★ 承認して初めて動く
    const ledger = unwrap(await repo.getItemLedger('SKU-1042', { warehouseId: 'wh-tokyo' }))
    expect(ledger.at(-1)).toMatchObject({ balance: 116 })
    expect(ledger.at(-1)?.txn).toMatchObject({ type: 'stocktake', qtyBase: -4, reasonCodeId: 'var-damage' })
  })

  it('カウントした本人だけでは承認できない（FR-409）', async () => {
    await as('keeper')
    const st = unwrap(await repo.startStocktake({ warehouseId: 'wh-tokyo', areas: ['A'], assigneeIds: [] }))
    for (const l of st.lines) unwrap(await repo.countLine(st.id, l.id, l.theoreticalQty))
    const r = await repo.approveStocktake(st.id)
    expect(r.ok).toBe(false)
  })

  it('3. 発注を登録すると入荷予定が増え、推奨発注リストから消える', async () => {
    await as('keeper')
    const find = (groups: repo.ReplenishmentGroup[]) =>
      groups.flatMap((g) => g.rows).find((r) => r.sku === 'SKU-2011' && r.warehouseId === 'wh-tokyo')
    const before = find(unwrap(await repo.getReplenishment()))
    expect(before?.recommendedQty).toBe(44) // 発注点50 − 有効12 = 38 → ロット44で切り上げ
    unwrap(
      await repo.createPurchaseOrder({
        supplierId: 'sup-03',
        warehouseId: 'wh-tokyo',
        lines: [{ itemId: 'item-2011', qtyBase: 44 }],
      }),
    )
    expect(find(unwrap(await repo.getReplenishment()))).toBeUndefined()
    const d = unwrap(await repo.getStockDetail('SKU-2011'))
    expect(d.byWarehouse.find((w) => w.warehouseId === 'wh-tokyo')?.incoming).toBe(44)
  })

  it('★ 4. 在庫管理者が引当 → 現場担当で見ると、実在庫は同じで有効在庫だけ減っている', async () => {
    const before = await bottle('keeper')
    unwrap(await repo.createAllocation({ itemId: 'item-1042', warehouseId: 'wh-tokyo', qtyBase: 10 }))
    await as('staff')
    const rows = unwrap(await repo.listStock())
    const s = rows.find((r) => r.item.sku === 'SKU-1042')!.snapshot
    expect(s.onHand).toBe(before.onHand)
    expect(s.available).toBe(before.available - 10)
    expect(s.allocated).toBe(before.allocated + 10)
  })

  it('現場担当は引当を作れない', async () => {
    await as('staff')
    const r = await repo.createAllocation({ itemId: 'item-1042', warehouseId: 'wh-tokyo', qtyBase: 1 })
    expect(r.ok).toBe(false)
  })

  it('5. 発注点を変えると、推奨発注リストの件数が変わる', async () => {
    await as('keeper')
    const count = async () => unwrap(await repo.getReplenishment()).reduce((s, g) => s + g.rows.length, 0)
    const before = await count()
    unwrap(await repo.updateItem('SKU-1042', { reorderPoint: 500 }))
    expect(await count()).toBe(before + 1)
  })

  it('★ 6. 拠点間移動：出荷元から減り「移動中」に計上、入荷処理まで到着先に入らない', async () => {
    await as('keeper')
    const item = 'item-1042'
    const tokyoBefore = await bottle()
    const tr = unwrap(
      await repo.createTransfer({
        fromWarehouseId: 'wh-tokyo',
        toWarehouseId: 'wh-osaka',
        lines: [{ itemId: item, qtyBase: 20 }],
      }),
    )
    let d = unwrap(await repo.getStockDetail('SKU-1042'))
    expect(d.byWarehouse.find((w) => w.warehouseId === 'wh-tokyo')?.onHand).toBe(tokyoBefore.onHand - 20)
    expect(d.total.inTransit).toBe(20)
    expect(d.byWarehouse.find((w) => w.warehouseId === 'wh-osaka')).toBeUndefined() // まだ到着先の在庫にない

    unwrap(await repo.receiveTransfer(tr.id))
    d = unwrap(await repo.getStockDetail('SKU-1042'))
    expect(d.byWarehouse.find((w) => w.warehouseId === 'wh-osaka')?.onHand).toBe(20)
    expect(d.total.inTransit).toBe(0)
    expect(d.total.onHand).toBe(tokyoBefore.onHand)
  })

  it('現場担当は自拠点発の移動だけ起票できる', async () => {
    await as('staff', 'wh-tokyo')
    const ng = await repo.createTransfer({
      fromWarehouseId: 'wh-osaka',
      toWarehouseId: 'wh-tokyo',
      lines: [{ itemId: 'item-1042', qtyBase: 1 }],
    })
    expect(ng.ok).toBe(false)
  })
})

describe('入出庫の規則', () => {
  it('★ 取消は逆仕訳。在庫が戻り、元の取引も逆仕訳も履歴に残る（FR-315）', async () => {
    await as('keeper')
    const shipped = unwrap(
      await repo.ship({ warehouseId: 'wh-tokyo', lines: [{ itemId: 'item-1042', qty: 5, unit: '本' }] }),
    )
    if (shipped.status !== 'done') throw new Error('出庫できませんでした')
    const target = shipped.txns[0]!
    unwrap(await repo.reverseTransaction(target.id, '数量の打ち間違い'))
    expect((await bottle()).onHand).toBe(120)
    const ledger = unwrap(await repo.getItemLedger('SKU-1042', { warehouseId: 'wh-tokyo' }))
    const orig = ledger.find((e) => e.txn.id === target.id)!
    expect(orig.isReversed).toBe(true)
    expect(ledger.at(-1)).toMatchObject({ isReversal: true, balance: 120 })
    expect((await repo.reverseTransaction(target.id)).ok).toBe(false) // 二重取消はできない
  })

  it('★ 有効在庫を超える出庫は止めずに確認を求め、確認すれば通す（FR-309）', async () => {
    await as('keeper')
    const ask = unwrap(
      await repo.ship({ warehouseId: 'wh-tokyo', lines: [{ itemId: 'item-1042', qty: 100, unit: '本' }] }),
    )
    expect(ask).toEqual({
      status: 'needs_confirmation',
      warnings: [{ itemId: 'item-1042', available: 90, requested: 100 }],
    })
    const done = unwrap(
      await repo.ship({
        warehouseId: 'wh-tokyo',
        confirmOverAvailable: true,
        lines: [{ itemId: 'item-1042', qty: 100, unit: '本' }],
      }),
    )
    expect(done.status).toBe('done')
    expect((await bottle()).onHand).toBe(20)
  })

  it('ケースで入庫すると最小単位で積み上がる（FR-110）', async () => {
    await as('keeper')
    unwrap(
      await repo.receive({
        warehouseId: 'wh-tokyo',
        lines: [{ itemId: 'item-1042', qty: 2, unit: 'ケース' }],
      }),
    )
    expect((await bottle()).onHand).toBe(168)
  })

  it('ロット管理品はロット番号と期限なしでは入庫できない（FR-305）。FEFO で出庫される', async () => {
    await as('keeper')
    const lotItem = unwrap(await repo.listStock()).find((r) => r.item.isLotManaged && r.snapshot.onHand > 30)!
    const wh = unwrap(await repo.getStockDetail(lotItem.item.sku)).byWarehouse[0]!.warehouseId!
    const ng = await repo.receive({
      warehouseId: wh,
      lines: [{ itemId: lotItem.item.id, qty: 1, unit: lotItem.item.baseUnit }],
    })
    expect(ng.ok).toBe(false)
    unwrap(
      await repo.receive({
        warehouseId: wh,
        lines: [
          {
            itemId: lotItem.item.id,
            qty: 5,
            unit: lotItem.item.baseUnit,
            lotNo: 'L-TEST-01',
            expiryDate: '2027-12-31',
          },
        ],
      }),
    )
    const lots = unwrap(await repo.listLots()).filter(
      (l) => l.itemId === lotItem.item.id && l.warehouseId === wh,
    )
    expect(lots.some((l) => l.lotNo === 'L-TEST-01' && l.onHand === 5)).toBe(true)
  })

  it('在庫調整は理由コードが必須（FR-314）', async () => {
    await as('keeper')
    const ng = await repo.adjustStock({
      itemId: 'item-1042',
      warehouseId: 'wh-tokyo',
      qty: -1,
      unit: '本',
      reasonCodeId: '',
    })
    expect(ng.ok).toBe(false)
    unwrap(
      await repo.adjustStock({
        itemId: 'item-1042',
        warehouseId: 'wh-tokyo',
        qty: -2,
        unit: '本',
        reasonCodeId: 'adj-damage',
      }),
    )
    expect((await bottle()).onHand).toBe(118)
  })
})

describe('永続化（FR-710）', () => {
  it('同じ保存領域から作り直しても、操作結果が残る。リセットで初期状態に戻る', async () => {
    const storage = memoryStorage()
    setStores(createStores(() => storage))
    await as('keeper')
    unwrap(await repo.ship({ warehouseId: 'wh-tokyo', lines: [{ itemId: 'item-1042', qty: 7, unit: '本' }] }))
    expect((await bottle()).onHand).toBe(113)

    // リロード相当：同じ保存領域から新しいストアを作る
    setStores(createStores(() => storage))
    expect((await bottle()).onHand).toBe(113)

    unwrap(await repo.resetDemo())
    expect((await bottle()).onHand).toBe(120)
  })
})
