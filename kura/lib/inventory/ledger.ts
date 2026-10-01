// 在庫元帳：履歴と残高推移、任意時点の在庫（FR-106, F-M04）
// 残高列は「現在庫がどの取引の積み上げか」を見せるためのもの

import type { Transaction } from '@/lib/types'
import type { SnapshotKey } from './snapshot'
import { byOccurred } from './time'

export type LedgerRow = {
  txn: Transaction
  balance: number // この取引を反映した後の残高
  isReversed: boolean // 逆仕訳で打ち消された元取引か（FR-315：元取引は書き換えずに導出する）
  isReversal: boolean // 逆仕訳そのものか
}

function matches(t: Transaction, key: SnapshotKey): boolean {
  return (
    t.itemId === key.itemId &&
    (key.warehouseId === undefined || t.warehouseId === key.warehouseId) &&
    (key.lotId === undefined || t.lotId === key.lotId)
  )
}

/** 時系列順の元帳。asOf を渡すとその時点までで打ち切る */
export function getLedger(txns: Transaction[], key: SnapshotKey, asOf?: string): LedgerRow[] {
  const reversed = new Set<string>()
  for (const t of txns) if (t.reversesTxnId) reversed.add(t.reversesTxnId)

  const rows: LedgerRow[] = []
  let balance = 0
  for (const t of txns.filter((x) => matches(x, key)).sort(byOccurred)) {
    if (asOf !== undefined && t.occurredAt > asOf) break
    balance += t.qtyBase
    rows.push({ txn: t, balance, isReversed: reversed.has(t.id), isReversal: Boolean(t.reversesTxnId) })
  }
  return rows
}

/** 任意時点の実在庫（FR-106）。棚卸の理論在庫の凍結にも使う（FR-401） */
export function onHandAsOf(txns: Transaction[], key: SnapshotKey, asOf: string): number {
  let sum = 0
  for (const t of txns) if (t.occurredAt <= asOf && matches(t, key)) sum += t.qtyBase
  return sum
}

/** 逆仕訳の下書き：数量の符号を反転し、元取引を参照する（INV-03） */
export function buildReversal(
  original: Transaction,
  meta: { userId: string; device: Transaction['device']; occurredAt: string; note?: string },
): Omit<Transaction, 'id' | 'seq' | 'createdAt'> {
  return {
    type: original.type,
    itemId: original.itemId,
    warehouseId: original.warehouseId,
    locationId: original.locationId,
    lotId: original.lotId,
    qtyBase: -original.qtyBase,
    inputQty: -original.inputQty,
    inputUnit: original.inputUnit,
    unitCost: original.unitCost,
    reasonCodeId: original.reasonCodeId,
    refType: original.refType,
    refId: original.refId,
    reversesTxnId: original.id,
    userId: meta.userId,
    device: meta.device,
    occurredAt: meta.occurredAt,
    note: meta.note ?? '',
    syncState: 'synced',
  }
}
