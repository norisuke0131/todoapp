// 画面の選択肢に使うマスタ（カテゴリ・拠点・仕入先・理由コード・棚番）
import type { Category, Location, Partner, ReasonCode, Result, Warehouse } from '@/lib/types'
import { stockedPairs } from '@/lib/inventory'
import { ctx, ok, run } from './_context'
import { canSeeWarehouse } from './_scope'

export type Masters = {
  categories: Category[]
  warehouses: (Warehouse & { visible: boolean })[]
  suppliers: Partner[]
  reasonCodes: ReasonCode[]
  /** 担当者の絞り込み用（氏名のみ） */
  users: { id: string; name: string }[]
}

export async function getMasters(): Promise<Result<Masters>> {
  return run(() => {
    const c = ctx()
    return ok({
      categories: [...c.data.categories].sort((a, b) => a.sortOrder - b.sortOrder),
      warehouses: c.data.warehouses.map((w) => ({ ...w, visible: canSeeWarehouse(c.scope, w.id) })),
      suppliers: c.data.partners.filter((p) => p.kind === 'supplier'),
      reasonCodes: [...c.data.reasonCodes].sort((a, b) => a.sortOrder - b.sortOrder),
      users: c.data.users.map((u) => ({ id: u.id, name: u.name })),
    })
  })
}

export type LocationRow = Location & { itemCount: number }
export type WarehouseLocations = {
  warehouse: Warehouse
  skuCount: number
  areas: { area: string; locations: LocationRow[] }[]
}

/** 拠点・ロケーション（SC-020）：棚番の階層と巡回順、棚ごとの商品数 */
export async function listLocations(): Promise<Result<WarehouseLocations[]>> {
  return run(() => {
    const c = ctx()
    const index = c.index()
    // 商品の主な棚＝その拠点で最後に入出庫した棚
    const lastLoc = new Map<string, string>()
    for (const t of c.data.txns) if (t.locationId) lastLoc.set(`${t.itemId}|${t.warehouseId}`, t.locationId)
    const count = new Map<string, number>()
    for (const k of stockedPairs(index)) {
      const loc = lastLoc.get(`${k.itemId}|${k.warehouseId}`)
      if (loc) count.set(loc, (count.get(loc) ?? 0) + 1)
    }
    return ok(
      c.data.warehouses
        .filter((w) => canSeeWarehouse(c.scope, w.id))
        .map((w) => {
          const locs = c.data.locations
            .filter((l) => l.warehouseId === w.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
          const areas = [...new Set(locs.map((l) => l.area))].map((area) => ({
            area,
            locations: locs
              .filter((l) => l.area === area)
              .map((l) => ({ ...l, itemCount: count.get(l.id) ?? 0 })),
          }))
          return {
            warehouse: w,
            skuCount: stockedPairs(index).filter((k) => k.warehouseId === w.id).length,
            areas,
          }
        }),
    )
  })
}

/** 取引先（SC-021） */
export async function listPartners(): Promise<Result<Partner[]>> {
  return run(() => ok(ctx().data.partners))
}
