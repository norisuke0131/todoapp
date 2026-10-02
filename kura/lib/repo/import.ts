// CSV インポート（SC-014, FR-701〜FR-703）
// ・dryRun=true で検証だけ（プレビュー）、false でエラー行を除いて取り込む（部分取込）
// ・★ 在庫初期値は「期首棚卸」トランザクションとして登録する。在庫数を直接書き込まない（FR-703）
import type { Item, Lot, Partner, Result, TransactionDraft } from '@/lib/types'
import type { ImportKind, RowResult } from '@/lib/csv'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId, type Ctx } from './_context'
import { delay } from './_delay'
import { DENY_REASON } from './_scope'
import { draftBase, post } from './_post'

export type ImportLineResult = {
  line: number
  status: 'ok' | 'error'
  action?: 'create' | 'update'
  errors: string[]
}
export type ImportSummary = {
  kind: ImportKind
  lines: ImportLineResult[]
  created: number
  updated: number
  failed: number
  committed: boolean
}

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase()
const truthy = (s: string) => ['1', 'true', 'yes', 'はい', '○', '◯', 'する', 'あり', '対象'].includes(norm(s))

export async function importCsv(
  kind: ImportKind,
  rows: RowResult[],
  opts: { dryRun: boolean },
): Promise<Result<ImportSummary>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('master.write')) return err(DENY_REASON['master.write'])
    const plan =
      kind === 'items'
        ? planItems(c, rows)
        : kind === 'opening'
          ? planOpening(c, rows)
          : planPartners(c, rows)
    const lines = plan.map((p) => ({
      line: p.line,
      status: p.errors.length ? ('error' as const) : ('ok' as const),
      action: p.action,
      errors: p.errors,
    }))
    const good = plan.filter((p) => p.errors.length === 0)
    const summary: ImportSummary = {
      kind,
      lines,
      created: good.filter((p) => p.action === 'create').length,
      updated: good.filter((p) => p.action === 'update').length,
      failed: plan.length - good.length,
      committed: false,
    }
    if (opts.dryRun || good.length === 0) return ok(summary)

    await delay()
    for (const p of good) p.apply()
    getStores()
      .data.getState()
      .appendAudit({
        id: newId('log'),
        actorId: c.scope.userId,
        action: 'import',
        targetType: kind,
        targetId: kind,
        changes: [{ field: 'rows', before: null, after: good.length }],
        createdAt: c.now,
      })
    return ok({ ...summary, committed: true })
  })
}

type Plan = { line: number; errors: string[]; action?: 'create' | 'update'; apply: () => void }

function planItems(c: Ctx, rows: RowResult[]): Plan[] {
  const cats = new Map(c.data.categories.map((x) => [norm(x.name), x.id]))
  const store = getStores().data.getState()
  const seen = new Set<string>()
  return rows.map((r) => {
    const v = r.values
    const errors = [...r.errors]
    const sku = v.sku ?? ''
    if (sku && !/^[A-Za-z0-9-]{3,20}$/.test(sku))
      errors.push(`SKU「${sku}」は半角英数字とハイフンで3〜20文字にしてください`)
    if (seen.has(sku)) errors.push(`SKU「${sku}」がファイル内で重複しています`)
    seen.add(sku)
    const categoryId = cats.get(norm(v.category ?? ''))
    if (v.category && !categoryId)
      errors.push(
        `カテゴリ「${v.category}」が見つかりません。${c.data.categories.map((x) => x.name).join('・')} のいずれかにしてください`,
      )
    const existing = c.data.items.find((i) => i.sku === sku)
    const action = existing ? 'update' : 'create'
    return {
      line: r.line,
      errors,
      action,
      apply: () => {
        const caseQty = v.caseQty ? Number(v.caseQty) : undefined
        const base: Item = existing ?? {
          id: newId('item'),
          sku,
          name: '',
          categoryId: categoryId!,
          baseUnit: v.baseUnit ?? '個',
          packUnits: [],
          cost: Number(v.cost),
          price: 0,
          reorderPoint: 0,
          safetyStock: 0,
          orderLot: 1,
          leadTimeDays: 7,
          isLotManaged: false,
          isSerialManaged: false,
          storageCondition: 'normal',
          isActive: true,
        }
        store.upsert('items', {
          ...base,
          name: v.name ?? base.name,
          jan: v.jan || base.jan,
          categoryId: categoryId ?? base.categoryId,
          // 最小単位と原価は、既存商品では上書きしない（過去の数量・評価額の意味が変わるため）
          baseUnit: existing ? base.baseUnit : (v.baseUnit ?? base.baseUnit),
          cost: existing ? base.cost : Number(v.cost),
          price: Number(v.price),
          packUnits: caseQty ? [{ name: 'ケース', qtyInBase: caseQty }] : base.packUnits,
          reorderPoint: v.reorderPoint ? Number(v.reorderPoint) : base.reorderPoint,
          safetyStock: v.safetyStock ? Number(v.safetyStock) : base.safetyStock,
          orderLot: v.orderLot ? Math.max(1, Number(v.orderLot)) : base.orderLot,
          isLotManaged: v.lotManaged ? truthy(v.lotManaged) : base.isLotManaged,
          shelfLifeDays: base.shelfLifeDays ?? (v.lotManaged && truthy(v.lotManaged) ? 180 : undefined),
        })
      },
    }
  })
}

function planOpening(c: Ctx, rows: RowResult[]): Plan[] {
  const whByName = new Map(
    c.data.warehouses.flatMap(
      (w) =>
        [
          [norm(w.name), w.id],
          [norm(w.code), w.id],
          [norm(w.name.replace('倉庫', '')), w.id],
        ] as const,
    ),
  )
  const locByCode = new Map(c.data.locations.map((l) => [`${l.warehouseId}|${norm(l.code)}`, l.id]))
  const hasHistory = new Set(c.data.txns.map((t) => `${t.itemId}|${t.warehouseId}`))
  const seen = new Set<string>()
  const store = getStores().data.getState()
  return rows.map((r) => {
    const v = r.values
    const errors = [...r.errors]
    const item = c.data.items.find((i) => i.sku === v.sku)
    if (v.sku && !item)
      errors.push(`SKU「${v.sku}」の商品が登録されていません。先に商品マスタを取り込んでください`)
    const wh = whByName.get(norm(v.warehouse ?? ''))
    if (v.warehouse && !wh)
      errors.push(
        `拠点「${v.warehouse}」が見つかりません。${c.data.warehouses.map((w) => w.name).join('・')} のいずれかにしてください`,
      )
    if (wh && !c.scope.can('master.write', { warehouseId: wh })) errors.push('この拠点には取り込めません')
    const qty = Number(v.qty)
    if (v.qty && qty <= 0) errors.push('数量は1以上で入力してください（在庫0の商品は行ごと省いてください）')
    const key = `${item?.id}|${wh}|${v.lotNo ?? ''}`
    if (item && wh && hasHistory.has(`${item.id}|${wh}`)) {
      errors.push(
        'この商品はこの拠点ですでに在庫の履歴があります。期首棚卸は最初の1回だけです。差を直すときは棚卸か在庫調整を使ってください',
      )
    }
    if (seen.has(key)) errors.push('同じ商品・拠点・ロットの行が重複しています')
    seen.add(key)
    if (item?.isLotManaged && (!v.lotNo || !v.expiryDate))
      errors.push(`${item.name} はロット管理の対象です。ロット番号と期限を入れてください`)
    const locationId = v.location && wh ? locByCode.get(`${wh}|${norm(v.location)}`) : undefined
    if (v.location && wh && !locationId) errors.push(`棚番「${v.location}」がこの拠点にありません`)
    return {
      line: r.line,
      errors,
      action: 'create',
      apply: () => {
        if (!item || !wh) return
        let lotId: string | undefined
        if (item.isLotManaged && v.lotNo) {
          const lot: Lot = {
            id: newId('lot'),
            itemId: item.id,
            lotNo: v.lotNo,
            receivedAt: c.now,
            expiryDate: v.expiryDate,
          }
          store.upsert('lots', lot)
          lotId = lot.id
        }
        const draft: TransactionDraft = {
          ...draftBase(c),
          type: 'opening',
          itemId: item.id,
          warehouseId: wh,
          locationId,
          lotId,
          qtyBase: qty,
          inputQty: qty,
          inputUnit: item.baseUnit,
          unitCost: item.cost,
          note: 'CSVで取り込んだ期首棚卸',
        }
        post(c, [draft])
      },
    }
  })
}

function planPartners(c: Ctx, rows: RowResult[]): Plan[] {
  const store = getStores().data.getState()
  return rows.map((r) => {
    const v = r.values
    const errors = [...r.errors]
    const k = norm(v.kind ?? '')
    const kind = ['仕入先', 'supplier', '仕入'].includes(k)
      ? 'supplier'
      : ['出荷先', 'customer', '得意先', '出荷'].includes(k)
        ? 'customer'
        : undefined
    if (v.kind && !kind) errors.push(`区分「${v.kind}」は「仕入先」か「出荷先」にしてください`)
    const existing = c.data.partners.find((p) => p.code === v.code)
    return {
      line: r.line,
      errors,
      action: existing ? 'update' : 'create',
      apply: () => {
        const p: Partner = {
          id: existing?.id ?? newId('ptn'),
          kind: kind ?? 'supplier',
          code: v.code ?? '',
          name: v.name ?? '',
          leadTimeDays: v.leadTimeDays ? Number(v.leadTimeDays) : (existing?.leadTimeDays ?? 7),
          minOrderAmount: v.minOrderAmount ? Number(v.minOrderAmount) : (existing?.minOrderAmount ?? 0),
        }
        store.upsert('partners', p)
      },
    }
  })
}
