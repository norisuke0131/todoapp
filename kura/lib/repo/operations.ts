// 入出庫の画面が使う照会と、棚入れ・棚番変更（SC-100〜SC-104, FR-301〜FR-310）
// ★ 棚を変えるのも「棚間移動」のトランザクションの追加で行う（INV-02）
import type { Result, ShippingOrder, TransactionDraft } from '@/lib/types'
import type { ScanItem } from '@/lib/scan'
import { composeSnapshot, lotBalances, selectLotsFefo } from '@/lib/inventory'
import { ctx, err, ok, run, type Ctx } from './_context'
import { delay } from './_delay'
import { draftBase, post } from './_post'
import { DENY_REASON, canSeeWarehouse, filterByWarehouse } from './_scope'

// ---------------------------------------------------------------------------
// スキャンの照合表
// ---------------------------------------------------------------------------

export async function getScanCatalog(): Promise<Result<(ScanItem & { jan?: string })[]>> {
  return run(() =>
    ok(
      ctx()
        .data.items.filter((i) => i.isActive)
        .map((i) => ({
          itemId: i.id,
          sku: i.sku,
          name: i.name,
          baseUnit: i.baseUnit,
          isLotManaged: i.isLotManaged,
          packUnits: i.packUnits,
          jan: i.jan,
        })),
    ),
  )
}

// ---------------------------------------------------------------------------
// 棚番：その拠点で最後に入出庫した棚を「いまの棚」とみなす
// ---------------------------------------------------------------------------

function lastLocations(c: Ctx): Map<string, string> {
  const m = new Map<string, string>()
  for (const t of c.data.txns)
    if (t.locationId && t.qtyBase > 0) m.set(`${t.itemId}|${t.warehouseId}`, t.locationId)
  for (const t of c.data.txns)
    if (t.locationId && !m.has(`${t.itemId}|${t.warehouseId}`))
      m.set(`${t.itemId}|${t.warehouseId}`, t.locationId)
  return m
}

export type LocationOption = { id: string; code: string; area: string; sortOrder: number }

export async function listWarehouseLocations(warehouseId: string): Promise<Result<LocationOption[]>> {
  return run(() => {
    const c = ctx()
    if (!canSeeWarehouse(c.scope, warehouseId)) return err('この拠点の棚は閲覧できません')
    return ok(
      c.data.locations
        .filter((l) => l.warehouseId === warehouseId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => ({ id: l.id, code: l.code, area: l.area, sortOrder: l.sortOrder })),
    )
  })
}

// ---------------------------------------------------------------------------
// 入庫（SC-100）：発注書の行と、棚入れの推奨棚（FR-306）
// ---------------------------------------------------------------------------

export type ReceivingLine = {
  itemId: string
  sku: string
  name: string
  baseUnit: string
  packUnits: { name: string; qtyInBase: number }[]
  isLotManaged: boolean
  shelfLifeDays?: number
  ordered: number
  received: number
  remaining: number
  suggestedLocationId?: string
  suggestedLocationCode?: string
}

export type OpenPurchaseOrder = {
  id: string
  code: string
  supplierName: string
  warehouseId: string
  warehouseName: string
  expectedAt?: string
  isDelayed: boolean
  status: 'ordered' | 'partial'
  lines: ReceivingLine[]
}

export async function listOpenPurchaseOrders(): Promise<Result<OpenPurchaseOrder[]>> {
  return run(() => {
    const c = ctx()
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const partners = new Map(c.data.partners.map((p) => [p.id, p.name]))
    const whs = new Map(c.data.warehouses.map((w) => [w.id, w.name]))
    const locs = new Map(c.data.locations.map((l) => [l.id, l.code]))
    const last = lastLocations(c)
    return ok(
      filterByWarehouse(c.scope, c.data.purchaseOrders, (p) => p.warehouseId)
        .filter(
          (p): p is typeof p & { status: 'ordered' | 'partial' } =>
            p.status === 'ordered' || p.status === 'partial',
        )
        .sort((a, b) => ((a.expectedAt ?? '') < (b.expectedAt ?? '') ? -1 : 1))
        .map((p) => ({
          id: p.id,
          code: p.code,
          supplierName: partners.get(p.supplierId) ?? '',
          warehouseId: p.warehouseId,
          warehouseName: whs.get(p.warehouseId) ?? '',
          expectedAt: p.expectedAt,
          isDelayed: !!p.expectedAt && p.expectedAt < c.now,
          status: p.status,
          lines: p.lines.flatMap((l) => {
            const i = items.get(l.itemId)
            if (!i) return []
            const loc = last.get(`${i.id}|${p.warehouseId}`)
            return [
              {
                itemId: i.id,
                sku: i.sku,
                name: i.name,
                baseUnit: i.baseUnit,
                packUnits: i.packUnits,
                isLotManaged: i.isLotManaged,
                shelfLifeDays: i.shelfLifeDays,
                ordered: l.qtyBase,
                received: l.receivedQtyBase,
                remaining: Math.max(0, l.qtyBase - l.receivedQtyBase),
                suggestedLocationId: loc,
                suggestedLocationCode: loc ? locs.get(loc) : undefined,
              },
            ]
          }),
        })),
    )
  })
}

/** 発注書なしの入庫で、商品ごとに推奨棚を引く */
export async function suggestLocation(
  itemId: string,
  warehouseId: string,
): Promise<Result<{ id?: string; code?: string }>> {
  return run(() => {
    const c = ctx()
    const id = lastLocations(c).get(`${itemId}|${warehouseId}`)
    return ok({ id, code: id ? c.data.locations.find((l) => l.id === id)?.code : undefined })
  })
}

// ---------------------------------------------------------------------------
// 棚入れ（SC-101）と、棚番の一括変更（FR-209）：どちらも棚間移動の取引を足す
// ---------------------------------------------------------------------------

/** 指定した商品×拠点の在庫を、まるごと別の棚へ移す（ロット管理品はロットごと） */
export async function moveAllToLocation(
  rows: { itemId: string; warehouseId: string }[],
  toLocationId: string,
): Promise<Result<{ moved: number; undoTxnIds: string[] }>> {
  return run(async () => {
    const c = ctx()
    const to = c.data.locations.find((l) => l.id === toLocationId)
    if (!to) return err('移動先の棚が見つかりません')
    if (!c.scope.can('txn.inout', { warehouseId: to.warehouseId })) return err(DENY_REASON['txn.inout'])
    if (rows.some((r) => r.warehouseId !== to.warehouseId))
      return err('移動先の棚と違う拠点の行が含まれています。拠点を絞り込んでから選んでください')
    const index = c.index()
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const last = lastLocations(c)
    const drafts: TransactionDraft[] = []
    let moved = 0
    for (const r of rows) {
      const item = items.get(r.itemId)
      const from = last.get(`${r.itemId}|${r.warehouseId}`)
      if (!item || from === toLocationId) continue
      const parts = item.isLotManaged
        ? lotBalances(index, r.itemId, r.warehouseId)
            .filter((b) => b.onHand > 0)
            .map((b) => ({ lotId: b.lotId as string | undefined, qty: b.onHand }))
        : [
            {
              lotId: undefined,
              qty: composeSnapshot(index, { itemId: r.itemId, warehouseId: r.warehouseId }, c.now).onHand,
            },
          ]
      for (const p of parts) {
        if (p.qty <= 0) continue
        const base = {
          ...draftBase(c, 'mobile'),
          type: 'move' as const,
          itemId: r.itemId,
          warehouseId: r.warehouseId,
          lotId: p.lotId,
          inputUnit: item.baseUnit,
          note: '棚番の変更',
        }
        drafts.push(
          { ...base, locationId: from, qtyBase: -p.qty, inputQty: -p.qty },
          { ...base, locationId: toLocationId, qtyBase: p.qty, inputQty: p.qty },
        )
      }
      moved += 1
    }
    if (drafts.length === 0) return err('移す在庫がありません（すでにその棚にあるか、在庫が0です）')
    await delay()
    const created = post(c, drafts)
    return ok({ moved, undoTxnIds: created.map((t) => t.id) })
  })
}

/** 入庫した取引を棚に入れる（FR-306）。入庫時に棚が決まっていなかった分を、棚間移動で振り分ける */
export async function putaway(assignments: { txnId: string; locationId: string }[]): Promise<Result<number>> {
  return run(async () => {
    const c = ctx()
    const drafts: TransactionDraft[] = []
    for (const a of assignments) {
      const t = c.data.txns.find((x) => x.id === a.txnId)
      if (!t || t.type !== 'receive') return err('入庫の取引が見つかりません')
      if (t.locationId === a.locationId) continue
      const loc = c.data.locations.find((l) => l.id === a.locationId)
      if (!loc || loc.warehouseId !== t.warehouseId) return err('棚番が入庫した拠点と一致しません')
      const base = {
        ...draftBase(c, 'mobile'),
        type: 'move' as const,
        itemId: t.itemId,
        warehouseId: t.warehouseId,
        lotId: t.lotId,
        inputUnit: t.inputUnit,
        note: '棚入れ',
      }
      drafts.push(
        { ...base, locationId: t.locationId, qtyBase: -t.qtyBase, inputQty: -t.qtyBase },
        { ...base, locationId: a.locationId, qtyBase: t.qtyBase, inputQty: t.qtyBase },
      )
    }
    if (drafts.length === 0) return ok(0)
    await delay()
    post(c, drafts)
    return ok(drafts.length / 2)
  })
}

// ---------------------------------------------------------------------------
// 出荷指示とピッキングリスト（SC-102, SC-103, FR-307, FR-308）
// ---------------------------------------------------------------------------

export type ShippingOrderSummary = ShippingOrder & {
  customerName: string
  warehouseName: string
  lineCount: number
  totalQty: number
  isOverdue: boolean
}

export async function listShippingOrders(
  opts: { open?: boolean } = { open: true },
): Promise<Result<ShippingOrderSummary[]>> {
  return run(() => {
    const c = ctx()
    const partners = new Map(c.data.partners.map((p) => [p.id, p.name]))
    const whs = new Map(c.data.warehouses.map((w) => [w.id, w.name]))
    return ok(
      filterByWarehouse(c.scope, c.data.shippingOrders, (s) => s.warehouseId)
        .filter(
          (s) => !opts.open || s.status === 'allocated' || s.status === 'picking' || s.status === 'draft',
        )
        .sort((a, b) => ((a.shipBy ?? '') < (b.shipBy ?? '') ? -1 : 1))
        .map((s) => ({
          ...s,
          customerName: partners.get(s.customerId) ?? '',
          warehouseName: whs.get(s.warehouseId) ?? '',
          lineCount: s.lines.length,
          totalQty: s.lines.reduce((a, l) => a + l.qtyBase - l.shippedQtyBase, 0),
          isOverdue: !!s.shipBy && s.shipBy < c.now && s.status !== 'shipped',
        })),
    )
  })
}

export type PickingLine = {
  itemId: string
  sku: string
  name: string
  baseUnit: string
  isLotManaged: boolean
  qty: number // 指示数（未出荷分）
  locationId?: string
  locationCode?: string
  sortOrder: number // ★ 巡回順
  available: number // 引当分を含めた、この受注で使える数
  /** FEFO の推奨ロット（期限の近い順） */
  lots: { lotId: string; lotNo: string; expiryDate?: string; onHand: number; recommended: number }[]
}

export type PickingList = { order: ShippingOrderSummary; lines: PickingLine[] }

/** ピッキングリスト：棚番の巡回順に並べ、ロット管理品には FEFO の推奨ロットを付ける */
export async function getPickingList(shippingOrderId: string): Promise<Result<PickingList>> {
  return run(async () => {
    const orders = await listShippingOrders({ open: false })
    if (!orders.ok) return orders
    const order = orders.data.find((o) => o.id === shippingOrderId)
    if (!order) return err('出荷指示が見つかりません')
    const c = ctx()
    const index = c.index()
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const locs = new Map(c.data.locations.map((l) => [l.id, l]))
    const lots = new Map(c.data.lots.map((l) => [l.id, l]))
    const last = lastLocations(c)
    const lines: PickingLine[] = order.lines
      .filter((l) => l.qtyBase > l.shippedQtyBase)
      .flatMap((l) => {
        const item = items.get(l.itemId)
        if (!item) return []
        const qty = l.qtyBase - l.shippedQtyBase
        const locId = last.get(`${item.id}|${order.warehouseId}`)
        const loc = locId ? locs.get(locId) : undefined
        const snap = composeSnapshot(index, { itemId: item.id, warehouseId: order.warehouseId }, c.now)
        const own = c.data.allocations
          .filter((a) => a.status === 'active' && a.refId === order.id && a.itemId === item.id)
          .reduce((s, a) => s + a.qtyBase, 0)
        const balances = item.isLotManaged
          ? lotBalances(index, item.id, order.warehouseId).filter((b) => b.onHand > 0)
          : []
        const fefo = item.isLotManaged
          ? selectLotsFefo(
              balances.map((b) => ({ lotId: b.lotId, available: b.onHand })),
              lots,
              qty,
              c.now,
            )
          : undefined
        return [
          {
            itemId: item.id,
            sku: item.sku,
            name: item.name,
            baseUnit: item.baseUnit,
            isLotManaged: item.isLotManaged,
            qty,
            locationId: loc?.id,
            locationCode: loc?.code,
            sortOrder: loc?.sortOrder ?? 9999,
            available: snap.available + own,
            lots: balances
              .map((b) => {
                const lot = lots.get(b.lotId)
                return {
                  lotId: b.lotId,
                  lotNo: lot?.lotNo ?? b.lotId,
                  expiryDate: lot?.expiryDate,
                  onHand: b.onHand,
                  recommended: fefo?.picks.find((p) => p.lotId === b.lotId)?.qty ?? 0,
                }
              })
              .sort((a, b) => ((a.expiryDate ?? '9') < (b.expiryDate ?? '9') ? -1 : 1)),
          },
        ]
      })
      .sort((a, b) => a.sortOrder - b.sortOrder)
    return ok({ order, lines })
  })
}

export type PutawayLine = {
  txnId: string
  sku: string
  name: string
  qty: number
  unit: string
  warehouseId: string
  lotNo?: string
  locationId?: string
  locationCode?: string
  suggestedLocationId?: string
}

/** 棚入れの対象（入庫した取引） */
export async function getPutawayLines(txnIds: string[]): Promise<Result<PutawayLine[]>> {
  return run(() => {
    const c = ctx()
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const locs = new Map(c.data.locations.map((l) => [l.id, l.code]))
    const lots = new Map(c.data.lots.map((l) => [l.id, l.lotNo]))
    const last = lastLocations(c)
    const rows = c.data.txns.filter(
      (t) => txnIds.includes(t.id) && t.type === 'receive' && canSeeWarehouse(c.scope, t.warehouseId),
    )
    // 入庫した後に棚入れ済みなら、その棚を「いまの棚」として見せる
    return ok(
      rows.map((t) => {
        const item = items.get(t.itemId)
        const current = last.get(`${t.itemId}|${t.warehouseId}`) ?? t.locationId
        return {
          txnId: t.id,
          sku: item?.sku ?? '',
          name: item?.name ?? '',
          qty: t.qtyBase,
          unit: item?.baseUnit ?? '',
          warehouseId: t.warehouseId,
          lotNo: t.lotId ? lots.get(t.lotId) : undefined,
          locationId: t.locationId,
          locationCode: t.locationId ? locs.get(t.locationId) : undefined,
          suggestedLocationId: current,
        }
      }),
    )
  })
}
