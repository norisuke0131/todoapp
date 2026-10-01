// 移動平均原価と在庫金額（FR-111）
//
// ・入庫（期首棚卸を含む）のたびに単価を更新する。出庫・調整では単価は変わらない
// ・拠点間移動は社内の付け替えなので、単価計算の数量からは除外する
// ・浮動小数の累積誤差を避けるため、単価は「1/100円」の整数で計算する

import type { Transaction } from '@/lib/types'
import { byOccurred } from './time'

const toCents = (yen: number) => Math.round(yen * 100)
const toYen = (cents: number) => cents / 100

/** 移動平均単価の更新に使う取引か */
function isCostInbound(t: Transaction): boolean {
  return (
    (t.type === 'receive' || t.type === 'opening') &&
    t.qtyBase > 0 &&
    t.unitCost !== undefined &&
    !t.reversesTxnId
  )
}

/** 1件の入庫で単価を更新する（純粋関数・整数演算） */
export function nextAverageCents(
  qtyBefore: number,
  avgCents: number,
  inQty: number,
  inCents: number,
): number {
  if (qtyBefore <= 0) return inCents
  return Math.round((qtyBefore * avgCents + inQty * inCents) / (qtyBefore + inQty))
}

export type CostPoint = { at: string; seq: number; cents: number }

export type CostIndex = {
  /** 現在の移動平均単価（円）。入庫実績がなければ undefined */
  unitCostOf(itemId: string): number | undefined
  /** 任意時点の移動平均単価（円）（FR-607） */
  unitCostAt(itemId: string, at: string): number | undefined
  /** 単価の履歴 */
  timeline(itemId: string): CostPoint[]
}

export function buildCostIndex(txns: Transaction[]): CostIndex {
  const sorted = [...txns].sort(byOccurred)
  const qty = new Map<string, number>()
  const avg = new Map<string, number>()
  const lines = new Map<string, CostPoint[]>()

  for (const t of sorted) {
    if (t.type === 'transfer_out' || t.type === 'transfer_in') continue
    const q = qty.get(t.itemId) ?? 0
    if (isCostInbound(t)) {
      const next = nextAverageCents(q, avg.get(t.itemId) ?? 0, t.qtyBase, toCents(t.unitCost ?? 0))
      avg.set(t.itemId, next)
      let line = lines.get(t.itemId)
      if (!line) lines.set(t.itemId, (line = []))
      line.push({ at: t.occurredAt, seq: t.seq, cents: next })
    }
    qty.set(t.itemId, q + t.qtyBase)
  }

  return {
    unitCostOf(itemId) {
      const c = avg.get(itemId)
      return c === undefined ? undefined : toYen(c)
    },
    unitCostAt(itemId, at) {
      const line = lines.get(itemId)
      if (!line) return undefined
      let found: number | undefined
      for (const p of line) {
        if (p.at > at) break
        found = p.cents
      }
      return found === undefined ? undefined : toYen(found)
    },
    timeline(itemId) {
      return lines.get(itemId) ?? []
    },
  }
}

/** 在庫金額（円・整数）。数量 × 単価を 1/100円で計算してから丸める */
export function stockValueOf(qtyBase: number, unitCostYen: number): number {
  return Math.round((qtyBase * toCents(unitCostYen)) / 100)
}
