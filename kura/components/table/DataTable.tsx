'use client'
// データテーブル（1-1）：TanStack Table をヘッドレスで使い、UI は自前で組む
//
// ・固定ヘッダー、列幅のリサイズ、複数列ソート（Shift+クリック）
// ・行選択（絞り込み結果の全件選択に対応）
// ・仮想スクロール（FR-213）：620行でも描画するのは見えている行だけ
// ・キーボード（IX-02）：↑↓ 行移動 / Enter 詳細 / Space 選択 / ⌘A・Ctrl+A 全選択
// ・<table> + caption + scope（A11Y-07）。数量列は右寄せ・Condensed（FR-215）
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { getCoreRowModel, useReactTable, type ColumnDef, type ColumnSizingState } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import type { SortSpec } from '@/lib/query'
import { cn } from '@/lib/utils/cn'
import { Checkbox } from '@/components/ui/checkbox'

export type Column<Row> = {
  id: string
  header: string
  cell: (row: Row) => ReactNode
  /** 数量・金額は右寄せ */
  align?: 'left' | 'right'
  width: number
  minWidth?: number
  sortable?: boolean
  /** 読み上げ用の補足（見出しが記号のとき） */
  headerLabel?: string
}

type Props<Row> = {
  caption: string
  rows: Row[]
  columns: Column<Row>[]
  getRowId: (row: Row) => string
  sort: SortSpec[]
  /** 見出しクリック。multi は Shift が押されていたか */
  onSortToggle: (field: string, multi: boolean) => void
  selection?: Set<string>
  onSelectionChange?: (next: Set<string>) => void
  density?: 'standard' | 'compact'
  onOpenRow?: (row: Row) => void
  /** スクロール領域の高さ（CSS） */
  height?: string
  empty?: ReactNode
  /** 行の先頭セル（SKU 等）を行見出し（scope=row）にする列 */
  rowHeaderId?: string
}

const ROW_H = { standard: 38, compact: 30 } as const

export function DataTable<Row>({
  caption,
  rows,
  columns,
  getRowId,
  sort,
  onSortToggle,
  selection,
  onSelectionChange,
  density = 'standard',
  onOpenRow,
  height = 'calc(100dvh - 300px)',
  empty,
  rowHeaderId,
}: Props<Row>) {
  const selectable = Boolean(selection && onSelectionChange)
  const [sizing, setSizing] = useState<ColumnSizingState>({})
  const [active, setActive] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowH = ROW_H[density]

  const defs = useMemo<ColumnDef<Row>[]>(() => {
    const base: ColumnDef<Row>[] = columns.map((c) => ({
      id: c.id,
      header: c.header,
      size: c.width,
      minSize: c.minWidth ?? 48,
      enableResizing: true,
      cell: (ctx) => c.cell(ctx.row.original),
      meta: c,
    }))
    if (!selectable) return base
    return [
      { id: '__select', header: '', size: 40, minSize: 40, enableResizing: false, cell: () => null },
      ...base,
    ]
  }, [columns, selectable])

  const table = useReactTable({
    data: rows,
    columns: defs,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => getRowId(r),
    columnResizeMode: 'onChange',
    state: { columnSizing: sizing },
    onColumnSizingChange: setSizing,
    manualSorting: true,
  })

  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 12,
  })

  useEffect(() => {
    virtual.measure()
  }, [rowH, virtual])

  useEffect(() => {
    if (active >= rows.length) setActive(Math.max(0, rows.length - 1))
  }, [rows.length, active])

  const ids = useMemo(() => rows.map(getRowId), [rows, getRowId])
  const allSelected = selectable && rows.length > 0 && ids.every((id) => selection!.has(id))
  const someSelected = selectable && !allSelected && ids.some((id) => selection!.has(id))

  const toggle = useCallback(
    (id: string) => {
      if (!selection || !onSelectionChange) return
      const next = new Set(selection)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onSelectionChange(next)
    },
    [selection, onSelectionChange],
  )

  const toggleAll = useCallback(() => {
    if (!selection || !onSelectionChange) return
    onSelectionChange(allSelected ? new Set() : new Set(ids))
  }, [allSelected, ids, selection, onSelectionChange])

  const focusRow = (index: number) => {
    const i = Math.max(0, Math.min(rows.length - 1, index))
    setActive(i)
    virtual.scrollToIndex(i, { align: 'auto' })
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus())
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const row = rows[active]
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusRow(active + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusRow(active - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusRow(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusRow(rows.length - 1)
    } else if (e.key === 'Enter' && row && onOpenRow) {
      e.preventDefault()
      onOpenRow(row)
    } else if (e.key === ' ' && row && selectable) {
      e.preventDefault()
      toggle(getRowId(row))
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && selectable) {
      e.preventDefault()
      toggleAll()
    }
  }

  // 行の描画に使う列定義（スクロールしても変わらない。行の memo を効かせるため）
  const metas = useMemo(() => columns, [columns])
  const widthsKey = headers0(table)
  const openRow = useCallback((r: Row) => onOpenRow?.(r), [onOpenRow])

  const items = virtual.getVirtualItems()
  const padTop = items[0]?.start ?? 0
  const padBottom = virtual.getTotalSize() - (items.at(-1)?.end ?? 0)
  const totalWidth = table.getTotalSize()
  const headers = table.getHeaderGroups()[0]?.headers ?? []

  return (
    <div ref={scrollRef} className="relative overflow-auto overscroll-contain" style={{ height }}>
      <table
        className="w-full border-separate border-spacing-0 text-body"
        style={{ minWidth: totalWidth, tableLayout: 'fixed' }}
      >
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {headers.map((h) => (
            <col key={h.id} style={{ width: h.getSize() }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr>
            {headers.map((h) => {
              const meta = h.column.columnDef.meta as Column<Row> | undefined
              if (h.id === '__select') {
                return (
                  <th
                    key={h.id}
                    scope="col"
                    className="h-9 border-b border-line-hi bg-panel-alt px-3 text-left"
                  >
                    <Checkbox
                      aria-label={
                        allSelected ? 'すべての選択を解除' : `表示中の ${rows.length} 件をすべて選択`
                      }
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                )
              }
              const s = sort.findIndex((x) => x.field === h.id)
              const dir = s >= 0 ? sort[s]!.dir : undefined
              return (
                <th
                  key={h.id}
                  scope="col"
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                  className={cn(
                    'group relative h-9 select-none border-b border-line-hi bg-panel-alt px-3 text-label text-ink-600',
                    meta?.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {meta?.sortable ? (
                    <button
                      type="button"
                      onClick={(e) => onSortToggle(h.id, e.shiftKey)}
                      className={cn(
                        'inline-flex max-w-full items-center gap-1 rounded-sm hover:text-ink-900',
                        meta.align === 'right' && 'flex-row-reverse',
                        dir && 'text-ink-900',
                      )}
                      title="クリックで並べ替え（Shift+クリックで列を追加）"
                    >
                      <span className="truncate">{meta.header}</span>
                      {dir === 'asc' ? (
                        <ArrowUp aria-hidden className="size-3 shrink-0" />
                      ) : dir === 'desc' ? (
                        <ArrowDown aria-hidden className="size-3 shrink-0" />
                      ) : (
                        <ChevronsUpDown
                          aria-hidden
                          className="hidden size-3 shrink-0 opacity-60 group-hover:inline"
                        />
                      )}
                      {sort.length > 1 && s >= 0 && (
                        <span className="num text-[10px] text-ink-500">{s + 1}</span>
                      )}
                    </button>
                  ) : (
                    <span className="truncate">{meta?.header}</span>
                  )}
                  {meta?.headerLabel && <span className="sr-only">{meta.headerLabel}</span>}
                  {h.column.getCanResize() && (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`${meta?.header ?? ''} の列幅`}
                      onMouseDown={h.getResizeHandler()}
                      onTouchStart={h.getResizeHandler()}
                      onDoubleClick={() => h.column.resetSize()}
                      className={cn(
                        'absolute inset-y-1.5 right-0 w-1.5 cursor-col-resize rounded-sm',
                        h.column.getIsResizing() ? 'bg-primary' : 'hover:bg-line-hi',
                      )}
                    />
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody onKeyDown={onKeyDown}>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="bg-panel">
                {empty}
              </td>
            </tr>
          ) : (
            <>
              {padTop > 0 && (
                <tr aria-hidden>
                  <td colSpan={headers.length} style={{ height: padTop, padding: 0, border: 0 }} />
                </tr>
              )}
              {items.map((vi) => {
                const original = rows[vi.index]
                if (original === undefined) return null
                const id = ids[vi.index]!
                return (
                  <MemoRow
                    key={id}
                    id={id}
                    index={vi.index}
                    row={original}
                    metas={metas}
                    widthsKey={widthsKey}
                    selectable={selectable}
                    selected={selection?.has(id) ?? false}
                    active={vi.index === active}
                    clickable={Boolean(onOpenRow)}
                    rowH={rowH}
                    rowHeaderId={rowHeaderId}
                    onFocusRow={setActive}
                    onToggle={toggle}
                    onOpen={openRow}
                  />
                )
              })}
              {padBottom > 0 && (
                <tr aria-hidden>
                  <td colSpan={headers.length} style={{ height: padBottom, padding: 0, border: 0 }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

function headers0<Row>(table: ReturnType<typeof useReactTable<Row>>): string {
  return (table.getHeaderGroups()[0]?.headers ?? []).map((h) => h.getSize()).join(',')
}

type RowProps<Row> = {
  id: string
  index: number
  row: Row
  metas: Column<Row>[]
  /** 列幅が変わったときだけ描き直すためのキー */
  widthsKey: string
  selectable: boolean
  selected: boolean
  active: boolean
  clickable: boolean
  rowH: number
  rowHeaderId?: string
  onFocusRow: (i: number) => void
  onToggle: (id: string) => void
  onOpen: (r: Row) => void
}

/** ★ 行は中身が変わったときだけ描き直す。スクロールでは新しく見えた行だけを描く（NFR-06） */
function RowView<Row>({
  id,
  index,
  row,
  metas,
  selectable,
  selected,
  active,
  clickable,
  rowH,
  rowHeaderId,
  onFocusRow,
  onToggle,
  onOpen,
}: RowProps<Row>) {
  return (
    <tr
      data-index={index}
      tabIndex={active ? 0 : -1}
      aria-selected={selectable ? selected : undefined}
      onFocus={() => onFocusRow(index)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,a,input,[role=checkbox]')) return
        if (clickable) onOpen(row)
      }}
      className={cn(
        'group/row cursor-default outline-none transition-colors duration-80',
        selected ? 'bg-primary-50' : 'hover:bg-primary-50/50 bg-panel',
        clickable && 'cursor-pointer',
        'focus-visible:bg-primary-50/60 focus-visible:shadow-[inset_3px_0_0_var(--primary)]',
      )}
      style={{ height: rowH }}
    >
      {selectable && (
        <td className="border-b border-line px-3">
          <Checkbox
            aria-label="この行を選択"
            checked={selected}
            onCheckedChange={() => onToggle(id)}
            tabIndex={-1}
          />
        </td>
      )}
      {metas.map((m) => {
        const Tag = m.id === rowHeaderId ? 'th' : 'td'
        return (
          <Tag
            key={m.id}
            scope={Tag === 'th' ? 'row' : undefined}
            className={cn(
              'overflow-hidden whitespace-nowrap border-b border-line px-3 font-normal',
              m.align === 'right' ? 'text-right' : 'text-left',
            )}
          >
            {m.cell(row)}
          </Tag>
        )
      })}
    </tr>
  )
}

const MemoRow = memo(RowView) as typeof RowView
