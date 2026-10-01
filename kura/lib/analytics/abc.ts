// ABC分析（FR-605）：出庫金額の累積構成比で A/B/C に区分する
// 区分の境界は一般的な 70% / 90% を既定値とし、引数で変えられるようにしている

import type { AbcClass, AbcResult } from '@/lib/types'

export const DEFAULT_ABC_THRESHOLDS = { a: 0.7, b: 0.9 }

export function abcAnalysis(
  rows: { itemId: string; shippedValue: number }[],
  thresholds = DEFAULT_ABC_THRESHOLDS,
): AbcResult[] {
  const sorted = [...rows].sort((x, y) => y.shippedValue - x.shippedValue || (x.itemId < y.itemId ? -1 : 1))
  const total = sorted.reduce((s, r) => s + Math.max(0, r.shippedValue), 0)
  let cum = 0
  return sorted.map((r) => {
    const before = total > 0 ? cum / total : 1
    cum += Math.max(0, r.shippedValue)
    const cumulativeRatio = total > 0 ? cum / total : 1
    // 境界をまたぐ品目は上位区分に入れる（先頭の品目は必ず A）
    let abcClass: AbcClass = 'C'
    if (r.shippedValue > 0 && before < thresholds.a) abcClass = 'A'
    else if (r.shippedValue > 0 && before < thresholds.b) abcClass = 'B'
    return { itemId: r.itemId, shippedValue: r.shippedValue, cumulativeRatio, abcClass }
  })
}
