// 水位バーの目盛り。発注点・過剰ラインが必ず収まり、きりのよい上限にそろえる
export type GaugeValues = {
  onHand: number
  allocated: number
  incoming: number
  reorderPoint: number
  safetyStock: number
  /** 過剰とみなす境界（lib/inventory の excessThreshold） */
  excessLine: number
}

export function niceMax(v: number): number {
  if (v <= 10) return 10
  const pow = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pow >= v) return m * pow
  return 10 * pow
}

export function gaugeMax(g: GaugeValues): number {
  return niceMax(Math.max(g.excessLine * 1.5, g.onHand + Math.max(0, g.incoming), g.reorderPoint * 2, 1))
}

export const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`

/** A11Y-05：バーを読み上げるときの文言 */
export function gaugeLabel(g: GaugeValues, unit = ''): string {
  const available = g.onHand - g.allocated
  return `実在庫${g.onHand}${unit}、引当${g.allocated}${unit}、有効${available}${unit}、入荷予定${g.incoming}${unit}。発注点${g.reorderPoint}${unit}、安全在庫${g.safetyStock}${unit}`
}
