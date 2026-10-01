// シードの「計画」：商品×拠点の組を決め、180日分の出来事（入出庫・移動・調整・棚卸差異）を並べる
//
// 方針
// ・最終的な在庫状態（欠品／発注点以下／適正／過剰／滞留）を先に決め、そこに着地する履歴を作る
// ・在庫がマイナスになる時点が出ないよう、期首棚卸の数量で底上げする（時系列の矛盾を作らない）
import type { Device, Item, TxnType } from '@/lib/types'
import { excessThreshold } from '@/lib/inventory'
import type { Rng } from './rng'
import type { ItemProfile } from './items'
import { locations } from './locations'

export const HISTORY_DAYS = 180
const DAY_MS = 86_400_000

export type Target = 'stockout' | 'below' | 'normal' | 'excess' | 'idle'

export type PlannedEvent = {
  at: string
  type: TxnType
  qty: number
  unitCost?: number
  reasonCodeId?: string
  refType?: 'purchase_order' | 'shipping_order' | 'transfer' | 'stocktake'
  refId?: string
  userId: string
  device: Device
  note: string
}

export type Pair = {
  key: string
  item: Item
  warehouseId: string
  locationId: string
  area: string
  target: Target
  finalQty: number
  events: PlannedEvent[]
  opening: number
  openingAt: string
}

export const TOKYO = 'wh-tokyo'
export const OSAKA = 'wh-osaka'

export function daysAgo(now: string, days: number, rng?: Rng): string {
  // 営業時間らしく、9〜18時台のどこかに寄せる
  const base = Date.parse(now) - days * DAY_MS
  const jitter = rng ? rng.int(0, 8 * 60) * 60_000 : 0
  return new Date(Math.min(base - jitter, Date.parse(now) - 60_000)).toISOString()
}

export const staffOf = (wh: string, rng: Rng) =>
  wh === TOKYO ? rng.pick(['u-staff-1', 'u-staff-2']) : 'u-staff-3'
export const keeperOf = (rng: Rng) => rng.pick(['u-keeper-1', 'u-keeper-2'])

// ---------------------------------------------------------------------------
// 商品 × 拠点 の割り当て（東京 240 SKU、大阪 460 SKU、うち 80 SKU は両拠点）
// ---------------------------------------------------------------------------

const TARGET_WEIGHTS: [Target, number][] = [
  ['stockout', 4],
  ['below', 13],
  ['normal', 52],
  ['excess', 14],
  ['idle', 17],
]

function pickTarget(rng: Rng): Target {
  const total = TARGET_WEIGHTS.reduce((s, [, w]) => s + w, 0)
  let r = rng.next() * total
  for (const [t, w] of TARGET_WEIGHTS) {
    r -= w
    if (r < 0) return t
  }
  return 'normal'
}

function finalQtyFor(item: Item, target: Target, rng: Rng): number {
  const rp = item.reorderPoint
  const ex = excessThreshold(item)
  switch (target) {
    case 'stockout':
      return 0
    case 'below':
      return rng.int(1, Math.max(1, rp - 1))
    case 'normal':
    case 'idle':
      return rng.int(rp, ex)
    case 'excess':
      return Math.round(ex * (1.3 + rng.next() * 1.2))
  }
}

export function assignPairs(rng: Rng, items: Item[]): Pair[] {
  const fixed = new Set(['SKU-1042', 'SKU-2011'])
  const pool = rng.shuffle(items.filter((i) => !fixed.has(i.sku)))
  const tokyoItems = [...items.filter((i) => fixed.has(i.sku)), ...pool.slice(0, 238)]
  const osakaOnly = pool.slice(238)
  const overlap = tokyoItems.filter((i) => !fixed.has(i.sku)).slice(0, 80)
  const osakaItems = [...osakaOnly, ...overlap]

  // ロット管理品（食品・飲料・調味料）はエリアC、それ以外はエリアA・B
  const locsByWh = (wh: string, lot: boolean) =>
    locations.filter((l) => l.warehouseId === wh && (lot ? l.area === 'C' : l.area !== 'C'))

  const make = (item: Item, wh: string): Pair => {
    let target = pickTarget(rng)
    let finalQty = finalQtyFor(item, target, rng)
    if (item.sku === 'SKU-1042') [target, finalQty] = ['normal', 120]
    if (item.sku === 'SKU-2011') [target, finalQty] = ['below', 12]
    const loc = rng.pick(locsByWh(wh, item.isLotManaged))
    return {
      key: `${item.id}|${wh}`,
      item,
      warehouseId: wh,
      locationId: loc.id,
      area: loc.area,
      target,
      finalQty,
      events: [],
      opening: 0,
      openingAt: '',
    }
  }

  return [...tokyoItems.map((i) => make(i, TOKYO)), ...osakaItems.map((i) => make(i, OSAKA))]
}

// ---------------------------------------------------------------------------
// 出来事の生成
// ---------------------------------------------------------------------------

/** 棚卸の凍結〜承認の間に出来事を置かない（差異の意味がぶれないように） */
export type Blackout = { from: string; to: string }

function avoid(at: string, blackouts: Blackout[]): string {
  let t = at
  for (const b of blackouts)
    if (t >= b.from && t <= b.to) t = new Date(Date.parse(b.from) - 2 * DAY_MS).toISOString()
  return t
}

export function generateEvents(
  rng: Rng,
  now: string,
  pair: Pair,
  profile: ItemProfile,
  blackouts: Blackout[],
): void {
  const { item, warehouseId: wh } = pair
  const idle = pair.target === 'idle'
  const rate = idle ? Math.max(0.1, profile.dailyRate * 0.3) : profile.dailyRate
  // 出庫は高回転品ほど回数を多く
  const nShips = idle ? rng.int(1, 2) : rng.int(2, 4) + Math.min(3, Math.floor(Math.log2(rate + 1)))
  const span = idle ? [HISTORY_DAYS - 5, 95] : [HISTORY_DAYS - 5, 1]

  let shipped = 0
  const ships: PlannedEvent[] = []
  for (let i = 0; i < nShips; i++) {
    const d = span[1]! + rng.next() * (span[0]! - span[1]!)
    const qty = Math.max(1, Math.round(((rate * HISTORY_DAYS) / nShips) * (0.6 + rng.next() * 0.8)))
    shipped += qty
    ships.push({
      at: avoid(daysAgo(now, d, rng), blackouts),
      type: 'ship',
      qty: -qty,
      userId: staffOf(wh, rng),
      device: rng.chance(0.8) ? 'scanner' : 'mobile',
      note: '',
    })
  }

  // 入庫：期首在庫（発注点 + 1ロット）から始めて最終在庫に着地する分だけ入れる
  const openingTarget = item.reorderPoint + item.orderLot
  const need = shipped + pair.finalQty - openingTarget
  const receives: PlannedEvent[] = []
  if (need > 0) {
    const maxN = item.isLotManaged ? 1 : 3
    const n = Math.min(maxN, Math.max(1, Math.round(need / (item.orderLot * 3))))
    const per = Math.max(item.orderLot, Math.ceil(need / n / item.orderLot) * item.orderLot)
    const recentEnd = idle ? 100 : pair.target === 'excess' ? 2 : 6
    for (let i = 0; i < n; i++) {
      const d = recentEnd + rng.next() * (HISTORY_DAYS - 10 - recentEnd)
      receives.push({
        at: avoid(daysAgo(now, d, rng), blackouts),
        type: 'receive',
        qty: per,
        // SKU-1042 は5章フローBの差異金額（−4本 = −¥5,200）を再現するため単価を固定
        unitCost: item.sku === 'SKU-1042' ? item.cost : Math.round(item.cost * (0.95 + rng.next() * 0.1)),
        userId: rng.chance(0.7) ? staffOf(wh, rng) : keeperOf(rng),
        device: rng.chance(0.6) ? 'scanner' : 'mobile',
        note: '',
      })
    }
  }

  // 在庫調整（破損・紛失・誤記訂正）を少しだけ
  if (rng.chance(0.07)) {
    const reason = rng.pick(['adj-damage', 'adj-damage', 'adj-lost', 'adj-correction', 'adj-other'])
    const qty = reason === 'adj-correction' && rng.chance(0.5) ? rng.int(1, 3) : -rng.int(1, 4)
    pair.events.push({
      at: avoid(daysAgo(now, rng.int(idle ? 100 : 5, 170), rng), blackouts),
      type: 'adjust',
      qty,
      reasonCodeId: reason,
      userId: keeperOf(rng),
      device: 'pc',
      note:
        reason === 'adj-damage'
          ? '検品時に外箱つぶれ。販売不可'
          : reason === 'adj-lost'
            ? '所在不明（社内調査済み）'
            : '',
    })
  }

  pair.events.push(...ships, ...receives)
  pair.openingAt = daysAgo(now, HISTORY_DAYS)
}

// ---------------------------------------------------------------------------
// 着地調整：在庫を一度もマイナスにせず、目標の最終在庫に合わせる
// ---------------------------------------------------------------------------

export function settle(rng: Rng, now: string, pair: Pair): void {
  const byTime = () => pair.events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  byTime()
  const minPrefix = () => {
    let bal = 0
    let min = 0
    for (const e of pair.events) {
      bal += e.qty
      if (bal < min) min = bal
    }
    return { min, net: bal }
  }

  const { min, net } = minPrefix()
  let opening = Math.max(1, pair.item.reorderPoint + pair.item.orderLot, -min)
  let final = opening + net

  if (final < pair.finalQty) {
    opening += pair.finalQty - final
    final = pair.finalQty
  }
  if (final > pair.finalQty) {
    const d = final - pair.finalQty
    if (opening - d >= Math.max(1, -min)) {
      opening -= d
    } else {
      // 期首を下げられない分は、最後の出来事の後ろに出庫を置いて合わせる。
      // 最後に置くので途中の残高は変わらず、マイナスになる時点は生まれない。
      // 滞留品は最後の出来事の直後（＝90日以上前）、それ以外は直近数日のどこか
      const lastAt = pair.events.at(-1)?.at ?? pair.openingAt
      const recent = daysAgo(now, 0.3 + rng.next() * 2, rng)
      const at =
        pair.target === 'idle' || recent <= lastAt
          ? new Date(Date.parse(lastAt) + 2 * 3_600_000).toISOString()
          : recent
      pair.events.push({
        at,
        type: 'ship',
        qty: -d,
        userId: staffOf(pair.warehouseId, rng),
        device: 'scanner',
        note: '',
      })
    }
  }
  pair.opening = opening
}
