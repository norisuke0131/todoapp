// 棚卸差異の集計（FR-609）：原因別・拠点別・担当者別
// 対象は承認済みの棚卸だけ（承認前の差異は在庫を動かしていないため）

import type { Stocktake, VarianceSummary } from '@/lib/types'
import type { Period } from './turnover'

export type VarianceAxis = 'reason' | 'warehouse' | 'user'
export type VarianceGroup = { key: string; count: number; varianceQty: number; varianceAmount: number }

export function summarizeVariance(
  stocktakes: Stocktake[],
  axis: VarianceAxis,
  period?: Period,
): VarianceGroup[] {
  const agg = new Map<string, VarianceGroup>()
  for (const st of stocktakes) {
    if (st.status !== 'approved') continue
    const at = st.approvedAt ?? st.frozenAt
    if (period && (at <= period.from || at > period.to)) continue
    for (const l of st.lines) {
      if (!l.varianceQty) continue
      const key =
        axis === 'reason'
          ? (l.reasonCodeId ?? 'unclassified')
          : axis === 'warehouse'
            ? st.warehouseId
            : (l.countedBy ?? 'unknown')
      const g = agg.get(key) ?? { key, count: 0, varianceQty: 0, varianceAmount: 0 }
      g.count += 1
      g.varianceQty += l.varianceQty
      g.varianceAmount += l.varianceAmount ?? 0
      agg.set(key, g)
    }
  }
  // 金額の絶対値が大きい順（マイナス差異が上に来る）
  return [...agg.values()].sort((a, b) => Math.abs(b.varianceAmount) - Math.abs(a.varianceAmount))
}

/** 7章の VarianceSummary 形式（原因別） */
export function varianceByReason(stocktakes: Stocktake[], period?: Period): VarianceSummary[] {
  return summarizeVariance(stocktakes, 'reason', period).map((g) => ({
    reasonCodeId: g.key,
    count: g.count,
    varianceQty: g.varianceQty,
    varianceAmount: g.varianceAmount,
  }))
}

/** 棚卸の精度（差異が出なかった行の割合）。棚卸履歴の改善度に使う（FR-410） */
export function stocktakeAccuracy(st: Stocktake): number {
  const counted = st.lines.filter((l) => l.countedQty !== undefined)
  if (counted.length === 0) return 0
  return counted.filter((l) => (l.varianceQty ?? 0) === 0).length / counted.length
}
