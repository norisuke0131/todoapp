// 出荷指示 60件（出荷済30・引当済20・ピッキング中10）と、引当 約90件
// ★ 「実在庫はあるのに有効在庫が足りない」商品を必ず作る（1章の事実②）
import type { Allocation, ShippingOrder, Transaction } from '@/lib/types'
import { composeSnapshot, type InventoryIndex } from '@/lib/inventory'
import type { Rng } from './rng'
import { daysAgo, TOKYO, type Pair } from './plan'

const DAY_MS = 86_400_000

export function buildShippingOrders(
  rng: Rng,
  now: string,
  pairs: Pair[],
  txns: Transaction[],
  index: InventoryIndex,
): { shippingOrders: ShippingOrder[]; allocations: Allocation[] } {
  const customers = Array.from({ length: 20 }, (_, i) => `cus-${String(i + 1).padStart(2, '0')}`)
  const orders: ShippingOrder[] = []
  const allocations: Allocation[] = []
  let no = 0
  const nextId = () => {
    no += 1
    return { id: `so-${String(no).padStart(3, '0')}`, code: `SO-${String(8800 + no)}` }
  }

  // 出荷済 30：直近の出庫トランザクションに紐づける（同じ日・同じ拠点の出庫を1件の指示にまとめる）
  const ships = txns
    .filter((t) => t.type === 'ship' && !t.refId && t.qtyBase < 0 && !t.lotId)
    .sort((a, b) => (a.occurredAt > b.occurredAt ? -1 : 1))
  const used = new Set<string>()
  for (const head of ships) {
    if (orders.length >= 30) break
    if (used.has(head.id)) continue
    const day = head.occurredAt.slice(0, 10)
    const group = ships
      .filter(
        (t) => !used.has(t.id) && t.warehouseId === head.warehouseId && t.occurredAt.slice(0, 10) === day,
      )
      .slice(0, rng.int(1, 3))
    const { id, code } = nextId()
    group.forEach((t) => {
      used.add(t.id)
      Object.assign(t, { refType: 'shipping_order', refId: id })
    })
    orders.push({
      id,
      code,
      customerId: rng.pick(customers),
      warehouseId: head.warehouseId,
      status: 'shipped',
      shipBy: head.occurredAt,
      lines: group.map((t, i) => ({
        id: `${id}-${i + 1}`,
        itemId: t.itemId,
        qtyBase: -t.qtyBase,
        shippedQtyBase: -t.qtyBase,
      })),
      createdAt: new Date(Date.parse(head.occurredAt) - 2 * DAY_MS).toISOString(),
    })
  }

  // 引当済 20 / ピッキング中 10：未出荷の受注に在庫を確保する
  const remaining = new Map<string, number>()
  const availableOf = (p: Pair) => {
    if (!remaining.has(p.key)) {
      remaining.set(
        p.key,
        composeSnapshot(index, { itemId: p.item.id, warehouseId: p.warehouseId }, now).available,
      )
    }
    return remaining.get(p.key) ?? 0
  }

  const bottle = pairs.find((p) => p.item.sku === 'SKU-1042' && p.warehouseId === TOKYO)!
  // 有効在庫を発注点の下まで押し下げる「売れない在庫」候補（拠点ごとに分けて持つ）
  const pools = new Map<string, { squeeze: Pair[]; normal: Pair[] }>()
  for (const wh of [TOKYO, 'wh-osaka']) {
    const squeeze = rng
      .shuffle(pairs.filter((p) => p.warehouseId === wh && p.target === 'normal' && p !== bottle))
      .slice(0, 6)
    const normal = rng.shuffle(
      pairs.filter(
        (p) =>
          p.warehouseId === wh &&
          (p.target === 'normal' || p.target === 'excess') &&
          p !== bottle &&
          !squeeze.includes(p),
      ),
    )
    pools.set(wh, { squeeze, normal })
  }

  for (let o = 0; o < 30; o++) {
    const { id, code } = nextId()
    const wh = o === 0 || o % 3 !== 2 ? TOKYO : 'wh-osaka'
    const pool = pools.get(wh)!
    const linePairs: { p: Pair; qty: number }[] = []
    if (o === 0) linePairs.push({ p: bottle, qty: 30 }) // フローAの「引当済 30」
    const nLines = o === 0 ? 2 : rng.int(2, 4)
    while (linePairs.length < nLines) {
      const useSqueeze = pool.squeeze.length > 0 && rng.chance(0.4)
      const p = useSqueeze ? pool.squeeze.shift() : pool.normal.shift()
      if (!p) break
      const avail = availableOf(p)
      if (avail <= 1) continue
      // 「売れない在庫」は有効在庫が発注点を下回るまで引き当てる
      const qty = useSqueeze
        ? Math.max(1, avail - Math.max(1, Math.floor(p.item.reorderPoint * 0.6)))
        : Math.max(1, Math.min(avail - 1, Math.round(avail * (0.05 + rng.next() * 0.2))))
      linePairs.push({ p, qty: Math.min(qty, avail - 1) })
    }
    const status = o < 20 ? 'allocated' : 'picking'
    const created = daysAgo(now, rng.int(0, 3), rng)
    const lines = linePairs.map(({ p, qty }, i) => {
      remaining.set(p.key, availableOf(p) - qty)
      allocations.push({
        id: `al-${String(allocations.length + 1).padStart(3, '0')}`,
        itemId: p.item.id,
        warehouseId: p.warehouseId,
        qtyBase: qty,
        refType: 'shipping_order',
        refId: id,
        status: 'active',
        createdAt: created,
      })
      return { id: `${id}-${i + 1}`, itemId: p.item.id, qtyBase: qty, shippedQtyBase: 0 }
    })
    orders.push({
      id,
      code,
      customerId: rng.pick(customers),
      warehouseId: wh,
      status,
      // 2件は出荷期日を過ぎている
      shipBy: o < 2 ? daysAgo(now, 1) : new Date(Date.parse(now) + rng.int(1, 7) * DAY_MS).toISOString(),
      lines,
      createdAt: created,
    })
  }
  return { shippingOrders: orders, allocations }
}
