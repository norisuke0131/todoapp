'use client'
// SC-010 在庫一覧：4つの在庫数 + 行内水位バー、絞り込み、列設定、保存ビュー、一括操作
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Rows3, Rows4, Search } from 'lucide-react'
import { applyFilters, applySort, type FieldDef } from '@/lib/query'
import { stockFields, stockStates, type StockState } from '@/lib/query/stock-fields'
import {
  bulkUpdateItems,
  deleteView,
  getMasters,
  getSession,
  getSettings,
  getUiPrefs,
  listStock,
  listViews,
  revertBulkUpdate,
  moveAllToLocation,
  reverseTransaction,
  saveView,
  setTableColumns,
  setUiPrefs,
  type StockRow,
} from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { downloadCsv, toCsv } from '@/lib/csv'
import { nowIso } from '@/lib/utils/clock'
import { fmtQty } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { PageTitle } from '@/components/layout/PageTitle'
import { DataTable } from '@/components/table/DataTable'
import { ConditionChips } from '@/components/table/ConditionChips'
import { FilterBuilder } from '@/components/table/FilterBuilder'
import { StateFilter } from '@/components/table/StateFilter'
import { ColumnPicker } from '@/components/table/ColumnPicker'
import { ViewSidebar } from '@/components/table/ViewSidebar'
import { BulkActionBar, BulkButton } from '@/components/table/BulkActionBar'
import { useListQuery } from '@/components/table/useListQuery'
import { BulkEditDialog, type BulkKind } from '@/components/domain/BulkEditDialog'
import { BulkLocationDialog } from '@/components/domain/BulkLocationDialog'
import { EmptyState } from '@/components/domain/EmptyState'
import { TableSkeleton } from '@/components/domain/Skeleton'
import { DEFAULT_STOCK_COLUMNS, stockColumns } from '@/components/domain/stock-columns'
import { StockCardList } from '@/components/domain/StockCardList'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

const SEVERITY: Record<string, number> = { stockout: 0, below_reorder: 1, excess: 2, normal: 3 }
const rowId = (r: StockRow) => `${r.item.sku}|${r.warehouseId ?? 'all'}`

export default function StockPage() {
  const router = useRouter()
  const toast = useToast()
  const list = useListQuery()
  const { state } = list

  // 拠点の絞り込みは、全拠点ロールなら「その拠点の行」を取り直す（合計行には拠点がないため）
  const whFilter = state.filters.find((f) => f.field === 'warehouse' && f.operator === 'in')
  const whOnly =
    Array.isArray(whFilter?.value) && whFilter.value.length === 1 ? String(whFilter.value[0]) : undefined

  const session = useRepo(getSession)
  const stock = useRepo(
    () => listStock({ warehouseId: session.data?.allWarehouses ? whOnly : undefined }),
    [whOnly, session.data?.allWarehouses],
  )
  const masters = useRepo(getMasters)
  const settings = useRepo(getSettings)
  const prefs = useRepo(getUiPrefs)
  const views = useRepo(() => listViews('stock'))
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<BulkKind | undefined>()
  const searchRef = useRef<HTMLInputElement>(null)
  const isNarrow = useIsNarrow()

  const rows = useMemo(() => stock.data ?? [], [stock.data])
  const idleDays = settings.data?.idleThresholdDays ?? 90
  const hasCost = rows.length > 0 && 'stockValue' in rows[0]!.snapshot
  const hasWarehouse = rows.some((r) => r.warehouseId) || Boolean(session.data?.allWarehouses)
  // 全拠点の合計行には拠点・棚番がないので、その列は出さない
  const rowsHaveWarehouse = rows.some((r) => r.warehouseId)

  const fields = useMemo<FieldDef<StockRow>[]>(() => {
    const all = stockFields({
      idleDays,
      categories: masters.data?.categories ?? [],
      warehouses: (masters.data?.warehouses ?? []).filter((w) => w.visible),
    })
    // ★ 権限のない列（原価・在庫金額）は、絞り込み項目にも存在させない
    return all.filter((f) =>
      f.key === 'unitCost' || f.key === 'stockValue' ? hasCost : f.key === 'warehouse' ? hasWarehouse : true,
    )
  }, [idleDays, masters.data, hasCost, hasWarehouse])

  // 並べ替え用：状態は深刻な順、拠点の絞り込みは取り直し済みなので無視
  const sortFields = useMemo(
    () =>
      fields.map((f) =>
        f.key === 'state' ? { ...f, accessor: (r: StockRow) => SEVERITY[r.snapshot.status] ?? 9 } : f,
      ),
    [fields],
  )
  const effectiveFilters = useMemo(
    () =>
      whOnly && session.data?.allWarehouses ? state.filters.filter((f) => f !== whFilter) : state.filters,
    [state.filters, whOnly, whFilter, session.data?.allWarehouses],
  )

  // ★ 絞り込み・並べ替えは擬似ディレイなしで即座に（IX-01, NFR-05）
  const shown = useMemo(
    () =>
      applySort(
        applyFilters(rows, effectiveFilters, fields, state.q),
        state.sort.length ? state.sort : [{ field: 'sku', dir: 'asc' }],
        sortFields,
      ),
    [rows, effectiveFilters, fields, sortFields, state.q, state.sort],
  )

  const stateCounts = useMemo(() => {
    const c = { stockout: 0, below_reorder: 0, normal: 0, excess: 0, idle: 0, expiring: 0 } as Record<
      StockState,
      number
    >
    for (const r of rows) for (const s of stockStates(r, idleDays)) c[s] += 1
    return c
  }, [rows, idleDays])
  const stateFilterIndex = state.filters.findIndex((f) => f.field === 'state' && f.operator === 'in')
  const selectedStates =
    (stateFilterIndex >= 0 ? (state.filters[stateFilterIndex]!.value as StockState[]) : []) ?? []

  const now = nowIso()
  const catName = useMemo(
    () => new Map((masters.data?.categories ?? []).map((c) => [c.id, c])),
    [masters.data],
  )
  const whName = useMemo(
    () => new Map((masters.data?.warehouses ?? []).map((w) => [w.id, w.name])),
    [masters.data],
  )
  const columns = useMemo(
    () =>
      stockColumns({
        now,
        idleDays,
        alertDaysOf: (id) => catName.get(id)?.expiryAlertDays ?? 30,
        categoryName: (id) => catName.get(id)?.name ?? '',
        warehouseName: (id) => (id ? (whName.get(id) ?? '') : '全拠点'),
      }).filter((c) =>
        c.id === 'unitCost' || c.id === 'stockValue'
          ? hasCost
          : c.id === 'warehouse' || c.id === 'location'
            ? rowsHaveWarehouse
            : true,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idleDays, catName, whName, hasCost, rowsHaveWarehouse],
  )
  const colOptions = columns.map((c) => ({
    id: c.id,
    label: c.header === '水位' ? '水位バー' : c.header,
    locked: c.id === 'sku',
  }))
  const savedCols = prefs.data?.columns.stock
  const visibleIds = (state.columns ?? savedCols ?? DEFAULT_STOCK_COLUMNS).filter((id) =>
    columns.some((c) => c.id === id),
  )
  const visibleCols = visibleIds.map((id) => columns.find((c) => c.id === id)!).filter(Boolean)

  const viewList = useMemo(
    () =>
      (views.data ?? []).map((v) => ({
        ...v,
        mine: v.ownerId === session.data?.userId,
        count: applyFilters(rows, v.filters, fields).length,
      })),
    [views.data, rows, fields, session.data?.userId],
  )

  const density = prefs.data?.density ?? 'standard'
  const canBulk = session.data?.permissions['master.write']
  const selectedSkus = [...new Set([...selection].map((id) => id.split('|')[0]!))]
  // 棚番の一括変更は、拠点別の行を1拠点に揃えて選んだときだけ（全拠点合計の行には棚が無い）
  const selectedWhs = [...new Set([...selection].map((id) => id.split('|')[1]!))]
  const moveWh = selectedWhs.length === 1 && selectedWhs[0] !== 'all' ? selectedWhs[0] : undefined
  const moveReason = !selection.size
    ? undefined
    : selectedWhs.includes('all')
      ? '拠点別の行を選ぶと使えます（全拠点合計の行には棚がありません）'
      : !moveWh
        ? '1つの拠点の行だけを選ぶと使えます'
        : undefined
  const [moving, setMoving] = useState(false)

  const exportCsv = () => {
    const cols = visibleCols.filter((c) => c.id !== 'gauge')
    const csv = toCsv(
      shown,
      cols.flatMap((c) => {
        const f = fields.find((x) => x.key === c.id)
        if (c.id === 'state')
          return [{ label: '在庫状態', value: (r: StockRow) => stockStates(r, idleDays).join(' ') }]
        if (c.id === 'location') return [{ label: '棚番', value: (r: StockRow) => r.locationCode ?? '' }]
        if (c.id === 'category')
          return [{ label: 'カテゴリ', value: (r: StockRow) => catName.get(r.item.categoryId)?.name ?? '' }]
        if (c.id === 'warehouse')
          return [
            {
              label: '拠点',
              value: (r: StockRow) => (r.warehouseId ? (whName.get(r.warehouseId) ?? '') : '全拠点'),
            },
          ]
        return f
          ? [{ label: f.label, value: (r: StockRow) => (f.accessor(r) as string | number | undefined) ?? '' }]
          : []
      }),
    )
    const d = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
    downloadCsv(`kura-stock-${d}.csv`, csv)
    toast.show({ message: `${fmtQty(shown.length)} 件を CSV に書き出しました` })
  }

  const loading = !stock.data || !masters.data || !session.data

  return (
    <>
      <PageTitle
        title="在庫一覧"
        lead={
          session.data
            ? `${
                session.data.allWarehouses
                  ? whOnly
                    ? whName.get(whOnly)
                    : '全拠点の合計'
                  : session.data.warehouses
                      .filter((w) => w.visible)
                      .map((w) => w.name)
                      .join('・')
              }。有効在庫＝実在庫−引当済。水位バーの斜線は「棚にあるが売れない」引当分です。`
            : ' '
        }
      />

      <div className="grid gap-5 lg:grid-cols-[208px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <ViewSidebar
            views={viewList}
            allCount={rows.length}
            activeId={state.viewId}
            isDirty={state.filters.length > 0 || Boolean(state.q)}
            canShare={Boolean(session.data?.permissions['view.share'].allowed)}
            shareReason={session.data?.permissions['view.share'].reason}
            onSelect={(v) => {
              setSelection(new Set())
              list.set(
                v
                  ? { q: '', viewId: v.id, filters: v.filters, sort: v.sort, columns: v.visibleColumns }
                  : { q: '', filters: [], sort: [] },
              )
            }}
            onSave={async (name, shared) => {
              const r = await saveView({
                name,
                target: 'stock',
                isShared: shared,
                filters: state.filters,
                sort: state.sort,
                visibleColumns: visibleIds,
              })
              if (!r.ok) return r.error
              list.set({ ...state, viewId: r.data.id })
              toast.show({ message: `ビュー「${r.data.name}」を保存しました` })
            }}
            onDelete={async (id) => {
              const r = await deleteView(id)
              toast.show(r.ok ? { message: 'ビューを削除しました' } : { message: r.error, tone: 'error' })
              if (r.ok && state.viewId === id) list.patch({})
            }}
          />
        </aside>

        <section aria-label="在庫の表" className="relative min-w-0 rounded border border-line bg-panel">
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
                <span className="sr-only">SKU・商品名・JAN で絞り込む</span>
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-500"
                />
                <input
                  ref={searchRef}
                  type="search"
                  value={state.q}
                  onChange={(e) => list.setQ(e.target.value)}
                  placeholder="SKU・商品名・JAN"
                  className="h-8 w-full rounded border border-line-hi bg-panel pl-8 pr-2.5 text-body"
                />
              </label>
              <FilterBuilder fields={fields.filter((f) => f.key !== 'state')} onAdd={list.addFilter} />
              <div className="ml-auto flex items-center gap-1.5">
                <ColumnPicker
                  options={colOptions}
                  visible={visibleIds}
                  onChange={(next) => {
                    void setTableColumns('stock', next)
                    list.patch({ columns: next })
                  }}
                  onReset={() => {
                    void setTableColumns('stock', DEFAULT_STOCK_COLUMNS)
                    list.patch({ columns: undefined })
                  }}
                />
                <Button
                  size="sm"
                  aria-label={
                    density === 'standard' ? '行を詰めて表示（30px）' : '行を標準の高さで表示（38px）'
                  }
                  onClick={() =>
                    void setUiPrefs({ density: density === 'standard' ? 'compact' : 'standard' })
                  }
                >
                  {density === 'standard' ? <Rows4 aria-hidden /> : <Rows3 aria-hidden />}
                </Button>
                <Button size="sm" onClick={exportCsv} disabled={shown.length === 0}>
                  <Download aria-hidden />
                  <span className="hidden sm:inline">CSV</span>
                  <span className="sr-only sm:hidden">CSV に書き出す</span>
                </Button>
              </div>
            </div>
            <StateFilter
              selected={selectedStates}
              counts={stateCounts}
              onChange={(next) => {
                const others = state.filters.filter((_, i) => i !== stateFilterIndex)
                list.patch({
                  filters: next.length
                    ? [...others, { field: 'state', operator: 'in', value: next }]
                    : others,
                })
              }}
            />
            <ConditionChips
              filters={state.filters.filter((f) => f.field !== 'state')}
              fields={fields}
              q={state.q}
              onRemove={(i) => {
                const target = state.filters.filter((f) => f.field !== 'state')[i]
                list.patch({ filters: state.filters.filter((f) => f !== target) })
              }}
              onClearQ={() => list.setQ('')}
              onClearAll={list.clearFilters}
            />
          </div>

          <p aria-live="polite" className={cn('px-4 pt-2 text-[12px] text-ink-500', loading && 'invisible')}>
            <span className="num text-[13px] text-ink-900">{fmtQty(shown.length)}</span> 件を表示
            {shown.length !== rows.length && <>（全 {fmtQty(rows.length)} 件）</>}
            <span className="ml-3 hidden md:inline">↑↓ で移動・Enter で詳細・Space で選択</span>
          </p>

          {loading ? (
            <TableSkeleton rows={12} rowHeight={density === 'compact' ? 30 : 38} />
          ) : isNarrow ? (
            <StockCardList
              rows={shown}
              warehouseName={(id) => (id ? (whName.get(id) ?? '') : '')}
              height="max(420px, calc(100dvh - 300px))"
              empty={
                rows.length === 0 ? (
                  <EmptyState kind="no-data" />
                ) : (
                  <EmptyState
                    kind="no-match"
                    action={<Button onClick={list.clearFilters}>条件をすべて外す</Button>}
                  />
                )
              }
            />
          ) : (
            <DataTable
              caption="在庫一覧"
              rows={shown}
              columns={visibleCols}
              getRowId={rowId}
              rowHeaderId="name"
              sort={state.sort}
              onSortToggle={list.toggleSort}
              selection={canBulk?.allowed ? selection : undefined}
              onSelectionChange={canBulk?.allowed ? setSelection : undefined}
              density={density}
              onOpenRow={(r) =>
                router.push(`/items/${r.item.sku}${r.warehouseId ? `?wh=${r.warehouseId}` : ''}`)
              }
              height="max(420px, calc(100dvh - 340px))"
              empty={
                rows.length === 0 ? (
                  <EmptyState kind="no-data" />
                ) : (
                  <EmptyState
                    kind="no-match"
                    action={<Button onClick={list.clearFilters}>条件をすべて外す</Button>}
                  />
                )
              }
            />
          )}

          <BulkActionBar count={selection.size} onClear={() => setSelection(new Set())}>
            <BulkButton onClick={() => setBulk('category')}>カテゴリを変更</BulkButton>
            <BulkButton onClick={() => setBulk('reorderPoint')}>発注点を変更</BulkButton>
            <BulkButton onClick={() => setMoving(true)} disabled={Boolean(moveReason)} reason={moveReason}>
              棚番を変更
            </BulkButton>
          </BulkActionBar>
        </section>
      </div>

      <BulkLocationDialog
        open={moving}
        count={selection.size}
        warehouseId={moveWh}
        warehouseName={moveWh ? (whName.get(moveWh) ?? '') : ''}
        onClose={() => setMoving(false)}
        onSubmit={async (locationId) => {
          const targets = rows.filter((r) => r.warehouseId === moveWh && selection.has(rowId(r)))
          const r = await moveAllToLocation(
            targets.map((t) => ({ itemId: t.item.id, warehouseId: moveWh! })),
            locationId,
          )
          if (!r.ok) return r.error
          setMoving(false)
          setSelection(new Set())
          toast.show({
            message: r.data.moved
              ? `${r.data.moved} 品目の棚を移しました`
              : '選んだ品目は、すでにその棚にあります',
            undo: r.data.undoTxnIds.length
              ? async () => {
                  for (const id of r.data.undoTxnIds) await reverseTransaction(id, '棚番の一括変更を元に戻す')
                  toast.show({ message: '棚の移動を取り消しました' })
                }
              : undefined,
          })
        }}
      />
      <BulkEditDialog
        kind={bulk}
        count={selectedSkus.length}
        categories={masters.data?.categories ?? []}
        onClose={() => setBulk(undefined)}
        onSubmit={async (patch) => {
          const r = await bulkUpdateItems(selectedSkus, patch)
          if (!r.ok) return r.error
          setBulk(undefined)
          setSelection(new Set())
          toast.show({
            message: `${r.data.updated} 件の${patch.categoryId ? 'カテゴリ' : '発注点'}を変更しました`,
            undo: async () => {
              await revertBulkUpdate(r.data.before)
              toast.show({ message: '変更を元に戻しました' })
            },
          })
        }}
      />
    </>
  )
}

/** スマホ幅（768px 未満）では表ではなくカードで見せる。現場はスマホが主戦場 */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}
