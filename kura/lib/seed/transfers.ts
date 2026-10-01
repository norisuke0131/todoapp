// 拠点間移動 12件（うち3件は移動中のまま残す：「どこの棚にもない在庫」を見せる）
import type { Transfer } from '@/lib/types'
import type { Rng } from './rng'
import { daysAgo, staffOf, type Blackout, type Pair } from './plan'

export function planTransfers(rng: Rng, now: string, pairs: Pair[], blackouts: Blackout[]): Transfer[] {
  const byKey = new Map(pairs.map((p) => [p.key, p]))
  const candidates = rng.shuffle(
    pairs.filter(
      (p) =>
        p.warehouseId === 'wh-tokyo' &&
        !p.item.isLotManaged &&
        p.target !== 'idle' &&
        byKey.has(`${p.item.id}|wh-osaka`) &&
        byKey.get(`${p.item.id}|wh-osaka`)?.target !== 'idle',
    ),
  )
  const inBlackout = (at: string) => blackouts.some((b) => at >= b.from && at <= b.to)

  const transfers: Transfer[] = []
  for (let i = 0; i < 12 && i < candidates.length; i++) {
    const tokyo = candidates[i]!
    const osaka = byKey.get(`${tokyo.item.id}|wh-osaka`)!
    const [from, to] = rng.chance(0.5) ? [tokyo, osaka] : [osaka, tokyo]
    const inTransit = i < 3
    let shippedAt = inTransit ? daysAgo(now, rng.int(1, 4), rng) : daysAgo(now, rng.int(15, 160), rng)
    if (inBlackout(shippedAt)) shippedAt = daysAgo(now, rng.int(15, 25), rng)
    const receivedAt = new Date(Date.parse(shippedAt) + rng.int(1, 2) * 86_400_000).toISOString()
    const qty = Math.max(6, Math.min(from.item.orderLot, 48))
    const id = `tr-${String(i + 1).padStart(3, '0')}`

    from.events.push({
      at: shippedAt,
      type: 'transfer_out',
      qty: -qty,
      refType: 'transfer',
      refId: id,
      userId: staffOf(from.warehouseId, rng),
      device: 'mobile',
      note: `${to.warehouseId === 'wh-tokyo' ? '東京' : '大阪'}倉庫へ補充`,
    })
    if (!inTransit) {
      to.events.push({
        at: receivedAt,
        type: 'transfer_in',
        qty,
        refType: 'transfer',
        refId: id,
        userId: staffOf(to.warehouseId, rng),
        device: 'scanner',
        note: '',
      })
    }
    transfers.push({
      id,
      code: `TR-${String(2401 + i)}`,
      fromWarehouseId: from.warehouseId,
      toWarehouseId: to.warehouseId,
      status: inTransit ? 'in_transit' : 'received',
      shippedAt,
      receivedAt: inTransit ? undefined : receivedAt,
      lines: [{ itemId: from.item.id, qtyBase: qty, receivedQtyBase: inTransit ? 0 : qty }],
    })
  }
  return transfers
}
