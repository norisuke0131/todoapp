// FEFO（First Expired, First Out：期限が近いロットから出す）（FR-308）

import type { Lot } from '@/lib/types'

export type LotStock = { lotId: string; available: number }
export type FefoPick = { lotId: string; qty: number; expiryDate?: string }
export type FefoResult = { picks: FefoPick[]; shortfall: number }

/**
 * 必要数を期限の近い順に割り当てる。
 * ・期限切れロットは既定で除外（includeExpired で含められる / FR-510）
 * ・期限のないロットは最後
 */
export function selectLotsFefo(
  stocks: LotStock[],
  lots: Map<string, Lot> | Lot[],
  requiredQty: number,
  now: string,
  opts: { includeExpired?: boolean } = {},
): FefoResult {
  const lotMap = lots instanceof Map ? lots : new Map(lots.map((l) => [l.id, l]))
  const today = now.slice(0, 10)
  const candidates = stocks
    .filter((s) => s.available > 0)
    .map((s) => ({ ...s, lot: lotMap.get(s.lotId) }))
    .filter((s) => opts.includeExpired || !s.lot?.expiryDate || s.lot.expiryDate >= today)
    .sort((a, b) => {
      const ea = a.lot?.expiryDate ?? '9999-12-31'
      const eb = b.lot?.expiryDate ?? '9999-12-31'
      if (ea !== eb) return ea < eb ? -1 : 1
      const ra = a.lot?.receivedAt ?? ''
      const rb = b.lot?.receivedAt ?? ''
      return ra < rb ? -1 : ra > rb ? 1 : 0
    })

  const picks: FefoPick[] = []
  let rest = requiredQty
  for (const c of candidates) {
    if (rest <= 0) break
    const q = Math.min(rest, c.available)
    picks.push({ lotId: c.lotId, qty: q, expiryDate: c.lot?.expiryDate })
    rest -= q
  }
  return { picks, shortfall: Math.max(0, rest) }
}

/** 推奨と異なるロットを選んだか（逸脱時は理由確認を求める / FR-308） */
export function isFefoDeviation(recommended: FefoResult, chosenLotId: string): boolean {
  const first = recommended.picks[0]
  return first !== undefined && first.lotId !== chosenLotId
}
