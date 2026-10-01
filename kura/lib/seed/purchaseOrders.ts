// 発注 45件：入荷済20・部分入荷6・発注済15（うち遅延4）・下書き4
import type { Item, PurchaseOrder, Transaction } from '@/lib/types'
import { needsReorder, type InventoryIndex, composeSnapshot } from '@/lib/inventory'
import type { Rng } from './rng'
import { daysAgo, TOKYO, type Pair } from './plan'

const DAY_MS = 86_400_000
const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY_MS).toISOString()

export function buildPurchaseOrders(
  rng: Rng,
  now: string,
  pairs: Pair[],
  txns: Transaction[],
  index: InventoryIndex,
): PurchaseOrder[] {
  const pos: PurchaseOrder[] = []
  let no = 0
  const nextId = () => {
    no += 1
    return { id: `po-${String(no).padStart(3, '0')}`, code: `PO-${String(5100 + no)}` }
  }
  const supplierOf = (item: Item) => item.defaultSupplierId ?? 'sup-01'

  // 直近の入庫トランザクション（ロット分割された行は先頭だけ）
  const seen = new Set<string>()
  const receives = txns
    .filter((t) => t.type === 'receive' && !t.refId)
    .filter((t) => {
      const k = `${t.itemId}|${t.warehouseId}|${t.occurredAt}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => (a.occurredAt > b.occurredAt ? -1 : 1))
  const itemById = new Map(pairs.map((p) => [p.item.id, p.item]))

  // 入荷済 20 / 部分入荷 6：実際の入庫トランザクションに発注書を紐づける
  const recentCut = daysAgo(now, 20)
  const partialSrc = receives.filter((t) => t.occurredAt >= recentCut).slice(0, 6)
  const receivedSrc = receives.filter((t) => !partialSrc.includes(t)).slice(0, 20)
  for (const [src, status] of [
    ...receivedSrc.map((t) => [t, 'received'] as const),
    ...partialSrc.map((t) => [t, 'partial'] as const),
  ]) {
    const item = itemById.get(src.itemId)!
    const { id, code } = nextId()
    const related = txns.filter(
      (t) =>
        t.type === 'receive' &&
        t.itemId === src.itemId &&
        t.warehouseId === src.warehouseId &&
        t.occurredAt === src.occurredAt,
    )
    const received = related.reduce((s, t) => s + t.qtyBase, 0)
    for (const t of related) Object.assign(t, { refType: 'purchase_order', refId: id })
    const ordered = status === 'partial' ? received + item.orderLot : received
    pos.push({
      id,
      code,
      supplierId: supplierOf(item),
      warehouseId: src.warehouseId,
      status,
      orderedAt: shift(src.occurredAt, -item.leadTimeDays),
      expectedAt: shift(src.occurredAt, status === 'partial' ? rng.int(2, 6) : -rng.int(0, 1)),
      lines: [
        {
          id: `${id}-1`,
          itemId: item.id,
          qtyBase: ordered,
          receivedQtyBase: received,
          unitCost: src.unitCost ?? item.cost,
        },
      ],
      createdAt: shift(src.occurredAt, -item.leadTimeDays),
    })
  }

  // 発注済 15：発注点を下回る商品の半分ほどに発注をかけておく（残りは「要発注」として見える）
  const low = rng.shuffle(
    pairs.filter((p) => {
      if (p.target === 'idle' || p.item.sku === 'SKU-2011') return false
      const s = composeSnapshot(index, { itemId: p.item.id, warehouseId: p.warehouseId }, now)
      return needsReorder(s) && !partialSrc.some((t) => t.itemId === p.item.id)
    }),
  )
  const bottle = pairs.find((p) => p.item.sku === 'SKU-1042' && p.warehouseId === TOKYO)!
  const orderTargets = [bottle, ...low.slice(0, 14)]
  orderTargets.forEach((p, i) => {
    const { id, code } = nextId()
    const qty = p === bottle ? 60 : p.item.orderLot * rng.int(1, 2)
    const delayed = i >= 1 && i <= 4 // 遅延 4件
    const orderedAt = daysAgo(
      now,
      delayed ? p.item.leadTimeDays + rng.int(2, 6) : rng.int(1, Math.max(1, p.item.leadTimeDays - 1)),
      rng,
    )
    pos.push({
      id,
      code,
      supplierId: supplierOf(p.item),
      warehouseId: p.warehouseId,
      status: 'ordered',
      orderedAt,
      expectedAt: shift(orderedAt, p.item.leadTimeDays),
      lines: [{ id: `${id}-1`, itemId: p.item.id, qtyBase: qty, receivedQtyBase: 0, unitCost: p.item.cost }],
      createdAt: orderedAt,
    })
  })

  // 下書き 4
  for (const p of rng.shuffle(pairs.filter((x) => x.target === 'normal')).slice(0, 4)) {
    const { id, code } = nextId()
    pos.push({
      id,
      code,
      supplierId: supplierOf(p.item),
      warehouseId: p.warehouseId,
      status: 'draft',
      lines: [
        {
          id: `${id}-1`,
          itemId: p.item.id,
          qtyBase: p.item.orderLot,
          receivedQtyBase: 0,
          unitCost: p.item.cost,
        },
      ],
      createdAt: daysAgo(now, rng.int(0, 3), rng),
    })
  }
  return pos
}
