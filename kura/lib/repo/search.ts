// グローバル検索（FR-211）：SKU・商品名・JAN・ロット番号を横断
import type { Result } from '@/lib/types'
import { stockedPairs } from '@/lib/inventory'
import { ctx, ok, run } from './_context'
import { canSeeWarehouse } from './_scope'

export type SearchHit =
  | { kind: 'item'; sku: string; name: string; jan?: string; matched: 'sku' | 'name' | 'jan' }
  | { kind: 'lot'; sku: string; name: string; lotNo: string; expiryDate?: string }

const norm = (s: string) => s.normalize('NFKC').toLowerCase()

export async function search(q: string, limit = 12): Promise<Result<SearchHit[]>> {
  return run(() => {
    const needle = norm(q.trim())
    if (!needle) return ok([])
    const c = ctx()
    const visibleItems = new Set(
      stockedPairs(c.index())
        .filter((k) => canSeeWarehouse(c.scope, k.warehouseId))
        .map((k) => k.itemId),
    )
    const items = c.data.items.filter((i) => visibleItems.has(i.id))
    const hits: SearchHit[] = []
    // SKU・JAN の前方一致を先に、商品名の部分一致を後に
    for (const i of items) {
      if (norm(i.sku).includes(needle))
        hits.push({ kind: 'item', sku: i.sku, name: i.name, jan: i.jan, matched: 'sku' })
      else if (i.jan && i.jan.includes(needle))
        hits.push({ kind: 'item', sku: i.sku, name: i.name, jan: i.jan, matched: 'jan' })
    }
    for (const i of items) {
      if (hits.length >= limit) break
      if (!hits.some((h) => h.sku === i.sku) && norm(i.name).includes(needle))
        hits.push({ kind: 'item', sku: i.sku, name: i.name, jan: i.jan, matched: 'name' })
    }
    const byId = new Map(items.map((i) => [i.id, i]))
    for (const l of c.data.lots) {
      if (hits.length >= limit) break
      const item = byId.get(l.itemId)
      if (item && norm(l.lotNo).includes(needle))
        hits.push({ kind: 'lot', sku: item.sku, name: item.name, lotNo: l.lotNo, expiryDate: l.expiryDate })
    }
    return ok(hits.slice(0, limit))
  })
}
