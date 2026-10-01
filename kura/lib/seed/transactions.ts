// 計画した出来事を、ロット付きのトランザクションに確定する（期首棚卸 + 過去180日）
import type { Lot, Transaction } from '@/lib/types'
import type { Rng } from './rng'
import type { Pair, PlannedEvent } from './plan'
import { assignLots, type LotRow } from './lots'

/** 入力単位：ケースで割り切れる入庫はケースで打った体にする（FR-110 の「入庫はケース」） */
function inputOf(pair: Pair, row: LotRow): { inputQty: number; inputUnit: string } {
  const pack = pair.item.packUnits[0]
  if (
    pack &&
    (row.type === 'receive' || row.type === 'opening') &&
    row.qty % pack.qtyInBase === 0 &&
    row.qty > 0
  ) {
    return { inputQty: row.qty / pack.qtyInBase, inputUnit: pack.name }
  }
  return { inputQty: row.qty, inputUnit: pair.item.baseUnit }
}

export function buildTransactions(rng: Rng, pairs: Pair[]): { txns: Transaction[]; lots: Lot[] } {
  let lotNo = 0
  const nextLotNo = () => ++lotNo
  const all: { pair: Pair; row: LotRow }[] = []
  const lots: Lot[] = []

  for (const pair of pairs) {
    const opening: PlannedEvent = {
      at: pair.openingAt,
      type: 'opening',
      qty: pair.opening,
      unitCost: pair.item.cost,
      userId: 'u-keeper-1',
      device: 'pc',
      note: 'システム導入時の実地棚卸',
    }
    const events = [opening, ...pair.events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    const res = assignLots(rng, pair, events, nextLotNo)
    lots.push(...res.lots)
    for (const row of res.rows) all.push({ pair, row })
  }

  all.sort((a, b) => (a.row.at < b.row.at ? -1 : a.row.at > b.row.at ? 1 : 0))
  const txns = all.map(({ pair, row }, i): Transaction => ({
    id: `txn-${String(i + 1).padStart(6, '0')}`,
    seq: i + 1,
    type: row.type,
    itemId: pair.item.id,
    warehouseId: pair.warehouseId,
    locationId: row.locationId,
    lotId: row.lotId,
    qtyBase: row.qty,
    ...inputOf(pair, row),
    unitCost: row.unitCost,
    reasonCodeId: row.reasonCodeId,
    refType: row.refType,
    refId: row.refId,
    userId: row.userId,
    device: row.device,
    occurredAt: row.at,
    createdAt: row.at,
    note: row.note,
    syncState: 'synced',
  }))
  return { txns, lots }
}
