// 在庫状態の判定
// 判定は「有効在庫」で行う（実在庫で判定すると、引当済を売れる在庫と誤認する）

import type { Item, StockStatus } from '@/lib/types'

type StatusSource = Pick<Item, 'reorderPoint' | 'orderLot'>

/**
 * 過剰在庫の境界。
 * 発注点で1回発注しても届けば戻る水準＝「発注点 + 発注ロット × 2」を超えたら過剰とみなす。
 * ※ 要件書に明示がないため、ここに集約して差し替え可能にしている。
 */
export const EXCESS_LOT_MULTIPLIER = 2

export function excessThreshold(item: StatusSource): number {
  return item.reorderPoint + item.orderLot * EXCESS_LOT_MULTIPLIER
}

export function judgeStatus(available: number, item: StatusSource): StockStatus {
  if (available <= 0) return 'stockout'
  if (available < item.reorderPoint) return 'below_reorder'
  if (available > excessThreshold(item)) return 'excess'
  return 'normal'
}

/** 滞留の判定（最終出庫からの経過日数）。状態とは独立した軸として扱う */
export const DEFAULT_IDLE_DAYS = 90

export function isIdle(idleDays: number | undefined, thresholdDays = DEFAULT_IDLE_DAYS): boolean {
  return idleDays !== undefined && idleDays >= thresholdDays
}
