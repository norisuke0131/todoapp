// ロットの割り当て：入庫ごとにロットを作り、出庫は FEFO（期限が近い順）で引き当てる
// 期限切れのロットは出庫に使わない（＝自然に「期限切れのまま残る在庫」ができる）
import type { Lot } from '@/lib/types'
import type { Rng } from './rng'
import type { Pair, PlannedEvent } from './plan'

export type LotRow = PlannedEvent & { lotId?: string; locationId: string }

const DAY_MS = 86_400_000
const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function assignLots(
  rng: Rng,
  pair: Pair,
  events: PlannedEvent[],
  nextLotNo: () => number,
): { rows: LotRow[]; lots: Lot[] } {
  const loc = pair.locationId
  if (!pair.item.isLotManaged) return { rows: events.map((e) => ({ ...e, locationId: loc })), lots: [] }

  const shelf = pair.item.shelfLifeDays ?? 180
  const lots: Lot[] = []
  const remain = new Map<string, number>()
  const rows: LotRow[] = []

  const newLot = (receivedMs: number): Lot => {
    const n = nextLotNo()
    const lot: Lot = {
      id: `lot-${String(n).padStart(4, '0')}`,
      itemId: pair.item.id,
      lotNo: `L${dateOnly(receivedMs).replace(/-/g, '').slice(2)}-${String(n % 100).padStart(2, '0')}`,
      receivedAt: new Date(receivedMs).toISOString(),
      expiryDate: dateOnly(receivedMs + Math.round(shelf * (0.85 + rng.next() * 0.3)) * DAY_MS),
      supplierId: pair.item.defaultSupplierId,
    }
    lots.push(lot)
    remain.set(lot.id, 0)
    return lot
  }

  for (const e of events) {
    const atMs = Date.parse(e.at)
    if (e.qty > 0 && (e.type === 'opening' || e.type === 'receive' || e.type === 'transfer_in')) {
      // 期首在庫は製造日の違う 1〜2 ロットに分かれている
      const parts = e.type === 'opening' && e.qty >= 4 && rng.chance(0.2) ? 2 : 1
      let rest = e.qty
      for (let i = 0; i < parts; i++) {
        const q = i === parts - 1 ? rest : Math.floor(e.qty / 2)
        rest -= q
        const recMs = e.type === 'opening' ? atMs - rng.int(5, 100) * DAY_MS : atMs
        const lot = newLot(recMs)
        remain.set(lot.id, q)
        rows.push({ ...e, qty: q, lotId: lot.id, locationId: loc })
      }
      continue
    }
    if (e.qty > 0) {
      const lot = lots.at(-1) ?? newLot(atMs)
      remain.set(lot.id, (remain.get(lot.id) ?? 0) + e.qty)
      rows.push({ ...e, lotId: lot.id, locationId: loc })
      continue
    }
    // 出庫・マイナス調整：期限内のロットを期限順に、足りなければ期限切れから
    const today = e.at.slice(0, 10)
    const order = [...lots].sort((a, b) => ((a.expiryDate ?? '') < (b.expiryDate ?? '') ? -1 : 1))
    const usable = [
      ...order.filter((l) => (l.expiryDate ?? '9999') >= today),
      ...order.filter((l) => (l.expiryDate ?? '9999') < today),
    ]
    let need = -e.qty
    for (const l of usable) {
      if (need <= 0) break
      const have = remain.get(l.id) ?? 0
      if (have <= 0) continue
      const q = Math.min(have, need)
      remain.set(l.id, have - q)
      need -= q
      rows.push({ ...e, qty: -q, lotId: l.id, locationId: loc })
    }
    if (need > 0) throw new Error(`${pair.key}: ロットの在庫が足りません（シードの時系列が矛盾しています）`)
  }
  return { rows, lots }
}
