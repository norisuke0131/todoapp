// 棚卸 4件：完了2回 + カウント中1件 + 未承認の差異あり1件
// 承認済みの棚卸だけが「棚卸差異」トランザクションを生む（FR-408）
import type { Stocktake, StocktakeLine, Transaction } from '@/lib/types'
import { onHandAsOf, type CostIndex } from '@/lib/inventory'
import type { Rng } from './rng'
import { daysAgo, keeperOf, staffOf, OSAKA, TOKYO, type Blackout, type Pair } from './plan'

type Spec = {
  id: string
  code: string
  warehouseId: string
  area: string
  status: Stocktake['status']
  frozenDaysAgo: number
  countedRatio: number
  varianceLines: number
  classifiedRatio: number
}

const SPECS: Spec[] = [
  {
    id: 'st-001',
    code: 'ST-2604',
    warehouseId: TOKYO,
    area: 'A',
    status: 'approved',
    frozenDaysAgo: 120,
    countedRatio: 1,
    varianceLines: 16,
    classifiedRatio: 1,
  },
  {
    id: 'st-002',
    code: 'ST-2607',
    warehouseId: OSAKA,
    area: 'B',
    status: 'approved',
    frozenDaysAgo: 60,
    countedRatio: 1,
    varianceLines: 14,
    classifiedRatio: 1,
  },
  {
    id: 'st-003',
    code: 'ST-2609',
    warehouseId: OSAKA,
    area: 'A',
    status: 'reviewing',
    frozenDaysAgo: 4,
    countedRatio: 1,
    varianceLines: 9,
    classifiedRatio: 0.45,
  },
  {
    id: 'st-004',
    code: 'ST-2610',
    warehouseId: TOKYO,
    area: 'B',
    status: 'counting',
    frozenDaysAgo: 1,
    countedRatio: 0.6,
    varianceLines: 4,
    classifiedRatio: 0,
  },
]

// 差異の原因はばらつかせる（差異分析に意味のあるパターンを出す）
const REASON_WEIGHTS: [string, number][] = [
  ['var-unrecorded', 30],
  ['var-damage', 20],
  ['var-lost', 14],
  ['var-misship', 16],
  ['var-misplace', 12],
  ['var-unknown', 8],
]

function pickReason(rng: Rng): string {
  let r = rng.next() * 100
  for (const [id, w] of REASON_WEIGHTS) {
    r -= w
    if (r < 0) return id
  }
  return 'var-unknown'
}

function varianceFor(reason: string, rng: Rng): number {
  if (reason === 'var-misplace' || reason === 'var-unrecorded')
    return rng.chance(0.4) ? rng.int(1, 3) : -rng.int(1, 4)
  if (reason === 'var-misship') return rng.chance(0.3) ? rng.int(1, 2) : -rng.int(1, 3)
  return -rng.int(1, 6)
}

export type StocktakePlan = Spec & {
  frozenAt: string
  approvedAt?: string
  approverId?: string
  pairs: Pair[]
  variances: Map<string, { qty: number; reason: string }>
  counted: Set<string>
}

export function stocktakeBlackouts(now: string): Blackout[] {
  return SPECS.filter((s) => s.status === 'approved').map((s) => ({
    from: daysAgo(now, s.frozenDaysAgo + 0.5),
    to: daysAgo(now, s.frozenDaysAgo - 2),
  }))
}

/** 計画：対象行・差異を決め、承認済みの差異をトランザクション予定として積む */
export function planStocktakes(rng: Rng, now: string, pairs: Pair[]): StocktakePlan[] {
  return SPECS.map((spec) => {
    const target = pairs.filter((p) => p.warehouseId === spec.warehouseId && p.area === spec.area)
    const frozenAt = daysAgo(now, spec.frozenDaysAgo)
    const approvedAt = spec.status === 'approved' ? daysAgo(now, spec.frozenDaysAgo - 1) : undefined
    const approverId = approvedAt ? keeperOf(rng) : undefined

    const counted = new Set(
      rng
        .shuffle([...target])
        .slice(0, Math.round(target.length * spec.countedRatio))
        .map((p) => p.key),
    )
    const variances = new Map<string, { qty: number; reason: string }>()
    for (const p of rng
      .shuffle([...target])
      .filter((x) => counted.has(x.key))
      .slice(0, spec.varianceLines)) {
      const reason = pickReason(rng)
      variances.set(p.key, { qty: varianceFor(reason, rng), reason })
      if (approvedAt && approverId) {
        p.events.push({
          at: approvedAt,
          type: 'stocktake',
          qty: variances.get(p.key)!.qty,
          reasonCodeId: reason,
          refType: 'stocktake',
          refId: spec.id,
          userId: approverId,
          device: 'pc',
          note: `棚卸 ${spec.code} の差異を承認`,
        })
      }
    }
    return { ...spec, frozenAt, approvedAt, approverId, pairs: target, variances, counted }
  })
}

/** トランザクション確定後に、凍結時点の理論在庫から棚卸データを組み立てる */
export function buildStocktakes(
  rng: Rng,
  plans: StocktakePlan[],
  txns: Transaction[],
  cost: CostIndex,
): Stocktake[] {
  return plans.map((plan) => {
    const lines: StocktakeLine[] = plan.pairs
      .sort((a, b) => (a.locationId < b.locationId ? -1 : 1))
      .map((p, i) => {
        const theoreticalQty = onHandAsOf(
          txns,
          { itemId: p.item.id, warehouseId: p.warehouseId },
          plan.frozenAt,
        )
        const line: StocktakeLine = {
          id: `${plan.id}-l${i + 1}`,
          itemId: p.item.id,
          locationId: p.locationId,
          theoreticalQty,
          note: '',
        }
        if (!plan.counted.has(p.key)) return line
        const v = plan.variances.get(p.key)
        const varianceQty = v ? Math.max(-theoreticalQty, v.qty) : 0
        const unitCost = cost.unitCostAt(p.item.id, plan.frozenAt) ?? p.item.cost
        line.countedQty = theoreticalQty + varianceQty
        line.varianceQty = varianceQty
        line.varianceAmount = Math.round(varianceQty * unitCost)
        line.countedBy = staffOf(p.warehouseId, rng)
        line.countedAt = new Date(Date.parse(plan.frozenAt) + rng.int(1, 6) * 3_600_000).toISOString()
        if (v && varianceQty !== 0 && rng.next() < plan.classifiedRatio) line.reasonCodeId = v.reason
        return line
      })
    return {
      id: plan.id,
      code: plan.code,
      warehouseId: plan.warehouseId,
      scope: { areas: [plan.area] },
      status: plan.status,
      frozenAt: plan.frozenAt,
      assigneeIds: plan.warehouseId === TOKYO ? ['u-staff-1', 'u-staff-2'] : ['u-staff-3'],
      lines,
      approvedBy: plan.approverId,
      approvedAt: plan.approvedAt,
      createdAt: plan.frozenAt,
    }
  })
}
