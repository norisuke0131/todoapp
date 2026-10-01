// 棚卸（SC-200〜SC-205, FR-401〜FR-409）
// ★ 承認するまで在庫は動かない。承認した瞬間に「棚卸差異」トランザクションを生成する
import type { Result, Stocktake, StocktakeLine, TransactionDraft } from '@/lib/types'
import { composeSnapshot, lotBalances, selectLotsFefo, stockedPairs } from '@/lib/inventory'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId } from './_context'
import { delay } from './_delay'
import { draftBase, post } from './_post'
import { DENY_REASON, canSeeWarehouse, scopeStocktake, type ScopedStocktake } from './_scope'

export async function listStocktakes(): Promise<Result<ScopedStocktake[]>> {
  return run(() => {
    const c = ctx()
    return ok(
      c.data.stocktakes
        .filter((s) => canSeeWarehouse(c.scope, s.warehouseId))
        .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
        .map((s) => scopeStocktake(c.scope, s)),
    )
  })
}

export async function getStocktake(id: string): Promise<Result<ScopedStocktake>> {
  return run(() => {
    const c = ctx()
    const st = c.data.stocktakes.find((s) => s.id === id)
    if (!st || !canSeeWarehouse(c.scope, st.warehouseId)) return err('棚卸が見つかりません')
    return ok(scopeStocktake(c.scope, st))
  })
}

/** 開始：対象範囲の理論在庫を、この時点で凍結する（FR-401） */
export async function startStocktake(input: {
  warehouseId: string
  areas?: string[]
  categoryIds?: string[]
  assigneeIds: string[]
}): Promise<Result<ScopedStocktake>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('stocktake.start', { warehouseId: input.warehouseId }))
      return err(DENY_REASON['stocktake.start'])
    const index = c.index()
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    // 商品の主な棚＝その拠点で最後に入出庫した棚
    const locOf = new Map<string, string>()
    for (const t of c.data.txns)
      if (t.warehouseId === input.warehouseId && t.locationId) locOf.set(t.itemId, t.locationId)
    const locs = new Map(c.data.locations.map((l) => [l.id, l]))

    const lines: StocktakeLine[] = stockedPairs(index)
      .filter((k) => k.warehouseId === input.warehouseId)
      .filter((k) => {
        const item = items.get(k.itemId)
        const loc = locs.get(locOf.get(k.itemId) ?? '')
        if (input.categoryIds?.length && !input.categoryIds.includes(item?.categoryId ?? '')) return false
        if (input.areas?.length && !input.areas.includes(loc?.area ?? '')) return false
        return true
      })
      .map((k) => ({ k, loc: locs.get(locOf.get(k.itemId) ?? '') }))
      .sort((a, b) => (a.loc?.sortOrder ?? 9999) - (b.loc?.sortOrder ?? 9999)) // 棚番の巡回順
      .map(({ k, loc }, i) => ({
        id: `l${i + 1}`,
        itemId: k.itemId,
        locationId: loc?.id,
        theoreticalQty: composeSnapshot(index, k, c.now).onHand,
        note: '',
      }))
    if (lines.length === 0) return err('対象範囲に在庫のある商品がありません')

    await delay()
    const st: Stocktake = {
      id: newId('st'),
      code: `ST-${String(2700 + c.data.stocktakes.length + 1)}`,
      warehouseId: input.warehouseId,
      scope: { areas: input.areas, categoryIds: input.categoryIds },
      status: 'counting',
      frozenAt: c.now,
      assigneeIds: input.assigneeIds,
      lines,
      createdAt: c.now,
    }
    getStores().data.getState().upsert('stocktakes', st)
    return ok(scopeStocktake(c.scope, st))
  })
}

function withLine(st: Stocktake, lineId: string, fn: (l: StocktakeLine) => StocktakeLine): Stocktake {
  return { ...st, lines: st.lines.map((l) => (l.id === lineId ? fn(l) : l)) }
}

/** カウント入力（FR-403）。在庫はまだ動かさない */
export async function countLine(
  stocktakeId: string,
  lineId: string,
  countedQty: number,
): Promise<Result<ScopedStocktake>> {
  return run(() => {
    const c = ctx()
    const st = c.data.stocktakes.find((s) => s.id === stocktakeId)
    if (!st) return err('棚卸が見つかりません')
    if (!c.scope.can('stocktake.count', { warehouseId: st.warehouseId }))
      return err(DENY_REASON['stocktake.count'])
    if (st.status !== 'counting' && st.status !== 'reviewing')
      return err('この棚卸はカウントを受け付けていません')
    if (!Number.isInteger(countedQty) || countedQty < 0) return err('実数は0以上の整数で入力してください')
    const item = new Map(c.data.items.map((i) => [i.id, i]))
    // ★ 連続入力を止めないため、カウントには擬似ディレイを入れない（IX-09）
    const next = withLine(st, lineId, (l) => {
      const varianceQty = countedQty - l.theoreticalQty
      const unitCost = c.index().cost.unitCostAt(l.itemId, st.frozenAt) ?? item.get(l.itemId)?.cost ?? 0
      return {
        ...l,
        countedQty,
        countedBy: c.scope.userId,
        countedAt: c.now,
        varianceQty,
        varianceAmount: Math.round(varianceQty * unitCost),
        reasonCodeId: varianceQty === 0 ? undefined : l.reasonCodeId,
      }
    })
    getStores().data.getState().upsert('stocktakes', next)
    return ok(scopeStocktake(c.scope, next))
  })
}

/** 差異の原因分類（FR-406） */
export async function classifyLine(
  stocktakeId: string,
  lineId: string,
  reasonCodeId: string,
): Promise<Result<ScopedStocktake>> {
  return run(() => {
    const c = ctx()
    const st = c.data.stocktakes.find((s) => s.id === stocktakeId)
    if (!st) return err('棚卸が見つかりません')
    if (!c.scope.can('stocktake.approve', { warehouseId: st.warehouseId }))
      return err(DENY_REASON['stocktake.approve'])
    if (!c.data.reasonCodes.some((r) => r.id === reasonCodeId && r.kind === 'variance'))
      return err('差異の原因を選んでください')
    const next = withLine(st, lineId, (l) => ({ ...l, reasonCodeId }))
    getStores().data.getState().upsert('stocktakes', next)
    return ok(scopeStocktake(c.scope, next))
  })
}

/** カウント完了 → 差異確認へ */
export async function submitCounts(stocktakeId: string): Promise<Result<ScopedStocktake>> {
  return run(async () => {
    const c = ctx()
    const st = c.data.stocktakes.find((s) => s.id === stocktakeId)
    if (!st) return err('棚卸が見つかりません')
    if (!c.scope.can('stocktake.count', { warehouseId: st.warehouseId }))
      return err(DENY_REASON['stocktake.count'])
    const remaining = st.lines.filter((l) => l.countedQty === undefined).length
    if (remaining > 0) return err(`未カウントが ${remaining} 件あります`)
    await delay()
    const next: Stocktake = { ...st, status: 'reviewing' }
    getStores().data.getState().upsert('stocktakes', next)
    return ok(scopeStocktake(c.scope, next))
  })
}

/**
 * 承認（FR-408, FR-409）：原因が未分類の差異があれば進めない。
 * 承認と同時に、差異を「棚卸差異」トランザクションとして登録する（承認前は在庫を動かさない）
 */
export async function approveStocktake(
  stocktakeId: string,
): Promise<Result<{ stocktake: ScopedStocktake; generated: number }>> {
  return run(async () => {
    const c = ctx()
    const st = c.data.stocktakes.find((s) => s.id === stocktakeId)
    if (!st) return err('棚卸が見つかりません')
    if (!c.scope.can('stocktake.approve', { warehouseId: st.warehouseId }))
      return err(DENY_REASON['stocktake.approve'])
    if (st.status === 'approved') return err('この棚卸はすでに承認されています')
    if (st.lines.some((l) => l.countedQty === undefined)) return err('未カウントの行があるため承認できません')
    const unclassified = st.lines.filter((l) => (l.varianceQty ?? 0) !== 0 && !l.reasonCodeId)
    if (unclassified.length > 0)
      return err(`原因が未分類の差異が ${unclassified.length} 件あります。すべて分類してから承認してください`)
    const settings = getStores().settings.getState()
    const counters = new Set(st.lines.map((l) => l.countedBy).filter(Boolean))
    if (settings.forbidSelfApproval && counters.size === 1 && counters.has(c.scope.userId)) {
      return err('カウントした本人だけで承認することはできません。別の在庫管理者が承認してください')
    }

    const index = c.index()
    const lotsById = new Map(c.data.lots.map((l) => [l.id, l]))
    const items = new Map(c.data.items.map((i) => [i.id, i]))
    const drafts: TransactionDraft[] = []
    for (const l of st.lines) {
      const v = l.varianceQty ?? 0
      if (v === 0) continue
      const item = items.get(l.itemId)
      const base = {
        ...draftBase(c),
        type: 'stocktake' as const,
        itemId: l.itemId,
        warehouseId: st.warehouseId,
        locationId: l.locationId,
        reasonCodeId: l.reasonCodeId,
        refType: 'stocktake' as const,
        refId: st.id,
        inputUnit: item?.baseUnit ?? '',
        note: `棚卸 ${st.code} の差異を承認`,
      }
      if (!item?.isLotManaged) {
        drafts.push({ ...base, qtyBase: v, inputQty: v })
        continue
      }
      // ロット管理品：不足は期限の近いロットから、過剰は最新のロットへ
      const balances = lotBalances(index, l.itemId, st.warehouseId)
      if (v > 0) {
        const newest = [...balances].sort((a, b) =>
          (lotsById.get(a.lotId)?.receivedAt ?? '') > (lotsById.get(b.lotId)?.receivedAt ?? '') ? -1 : 1,
        )[0]
        if (!newest) return err(`${item.name}：ロットが見つかりません`)
        drafts.push({ ...base, lotId: newest.lotId, qtyBase: v, inputQty: v })
      } else {
        const picks = selectLotsFefo(
          balances.map((b) => ({ lotId: b.lotId, available: b.onHand })),
          lotsById,
          -v,
          c.now,
          { includeExpired: true },
        ).picks
        for (const p of picks) drafts.push({ ...base, lotId: p.lotId, qtyBase: -p.qty, inputQty: -p.qty })
      }
    }

    await delay()
    post(c, drafts)
    const next: Stocktake = { ...st, status: 'approved', approvedBy: c.scope.userId, approvedAt: c.now }
    const store = getStores().data.getState()
    store.upsert('stocktakes', next)
    store.appendAudit({
      id: newId('log'),
      actorId: c.scope.userId,
      action: 'approve_stocktake',
      targetType: 'stocktake',
      targetId: st.id,
      changes: [{ field: 'status', before: st.status, after: 'approved' }],
      createdAt: c.now,
    })
    return ok({ stocktake: scopeStocktake(c.scope, next), generated: drafts.length })
  })
}
