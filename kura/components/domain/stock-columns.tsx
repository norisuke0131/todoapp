// 在庫一覧の列（SC-010）。4つの在庫数 + 行内水位バーを同じ行に並べる（FR-201）
import Link from 'next/link'
import type { StockRow } from '@/lib/repo/stock'
import type { Column } from '@/components/table/DataTable'
import { StockGauge } from '@/components/gauge/StockGauge'
import { GaugeTooltip } from '@/components/gauge/GaugeTooltip'
import { StockStatusBadge } from '@/components/domain/StockStatusBadge'
import { ExpiryBadge } from '@/components/domain/ExpiryBadge'
import { fmtDate, fmtQty, fmtYen } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

const Qty = ({
  v,
  strong,
  plus,
  unit,
}: {
  v: number | undefined
  strong?: boolean
  plus?: boolean
  unit?: string
}) =>
  v === undefined ? (
    <span className="text-ink-400">—</span>
  ) : (
    <span
      className={cn(
        'num text-qty',
        strong ? 'text-ink-900' : 'text-ink-600',
        v < 0 && 'text-st-ink-stockout',
      )}
    >
      {plus && v > 0 ? '+' : ''}
      {fmtQty(v)}
      {unit && <span className="ml-0.5 font-sans text-[10px] font-normal text-ink-500">{unit}</span>}
    </span>
  )

export function stockColumns(opts: {
  now: string
  idleDays: number
  alertDaysOf: (categoryId: string) => number
  categoryName: (id: string) => string
  warehouseName: (id?: string) => string
}): Column<StockRow>[] {
  return [
    {
      id: 'sku',
      header: 'SKU',
      width: 96,
      sortable: true,
      cell: (r) => (
        <Link
          href={`/items/${r.item.sku}`}
          className="num text-[13px] text-primary-d hover:underline"
          tabIndex={-1}
        >
          {r.item.sku}
        </Link>
      ),
    },
    {
      id: 'name',
      header: '商品名',
      width: 224,
      minWidth: 140,
      sortable: true,
      cell: (r) => <span title={r.item.name}>{r.item.name}</span>,
    },
    {
      id: 'category',
      header: 'カテゴリ',
      width: 140,
      sortable: true,
      cell: (r) => <span className="text-ink-600">{opts.categoryName(r.item.categoryId)}</span>,
    },
    {
      id: 'warehouse',
      header: '拠点',
      width: 96,
      sortable: true,
      cell: (r) => <span className="text-ink-600">{opts.warehouseName(r.warehouseId)}</span>,
    },
    {
      id: 'location',
      header: '棚番',
      width: 84,
      cell: (r) => <span className="num text-[13px] text-ink-600">{r.locationCode ?? '—'}</span>,
    },
    {
      id: 'onHand',
      header: '実在庫',
      width: 76,
      align: 'right',
      sortable: true,
      cell: (r) => <Qty v={r.snapshot.onHand} />,
    },
    {
      id: 'allocated',
      header: '引当済',
      width: 72,
      align: 'right',
      sortable: true,
      cell: (r) => <Qty v={r.snapshot.allocated} />,
    },
    {
      id: 'available',
      header: '有効在庫',
      width: 88,
      align: 'right',
      sortable: true,
      cell: (r) => <Qty v={r.snapshot.available} strong unit={r.item.baseUnit} />,
    },
    {
      id: 'incoming',
      header: '入荷予定',
      width: 80,
      align: 'right',
      sortable: true,
      cell: (r) => <Qty v={r.snapshot.incoming} plus />,
    },
    {
      id: 'gauge',
      header: '水位',
      headerLabel: '（在庫水位バー）',
      width: 148,
      cell: (r) => {
        const g = {
          onHand: r.snapshot.onHand,
          allocated: r.snapshot.allocated,
          incoming: r.snapshot.incoming,
          reorderPoint: r.snapshot.reorderPoint,
          safetyStock: r.snapshot.safetyStock,
          excessLine: r.excessLine,
        }
        return (
          <GaugeTooltip values={g} unit={r.item.baseUnit}>
            <StockGauge {...g} unit={r.item.baseUnit} />
          </GaugeTooltip>
        )
      },
    },
    {
      id: 'state',
      header: '状態',
      width: 104,
      sortable: true,
      cell: (r) => {
        const idle = r.snapshot.onHand > 0 && (r.snapshot.idleDays ?? 0) >= opts.idleDays
        return (
          <span className="flex items-center gap-1">
            <StockStatusBadge state={r.snapshot.status} />
            {idle && r.snapshot.status === 'normal' && <StockStatusBadge state="idle" />}
          </span>
        )
      },
    },
    {
      id: 'reorderPoint',
      header: '発注点',
      width: 76,
      align: 'right',
      sortable: true,
      cell: (r) => <Qty v={r.snapshot.reorderPoint} />,
    },
    {
      id: 'safetyStock',
      header: '安全在庫',
      width: 80,
      align: 'right',
      sortable: true,
      cell: (r) => <Qty v={r.snapshot.safetyStock} />,
    },
    {
      id: 'abcClass',
      header: 'ABC',
      width: 56,
      sortable: true,
      cell: (r) => <span className="num text-ink-600">{r.item.abcClass ?? '—'}</span>,
    },
    {
      id: 'unitCost',
      header: '原価',
      width: 92,
      align: 'right',
      sortable: true,
      cell: (r) => (
        <span className="num text-qty text-ink-600">
          {r.snapshot.unitCost !== undefined ? fmtYen(Math.round(r.snapshot.unitCost)) : '—'}
        </span>
      ),
    },
    {
      id: 'stockValue',
      header: '在庫金額',
      width: 112,
      align: 'right',
      sortable: true,
      cell: (r) => (
        <span className="num text-qty text-ink-900">
          {r.snapshot.stockValue !== undefined ? fmtYen(r.snapshot.stockValue) : '—'}
        </span>
      ),
    },
    {
      id: 'idleDays',
      header: '出庫なし',
      width: 84,
      align: 'right',
      sortable: true,
      cell: (r) =>
        r.snapshot.idleDays === undefined ? (
          <span className="text-ink-400">—</span>
        ) : (
          <span className="num text-qty text-ink-600">
            {r.snapshot.idleDays}
            <span className="ml-0.5 font-sans text-[10px] font-normal text-ink-500">日</span>
          </span>
        ),
    },
    {
      id: 'lastShippedAt',
      header: '最終出庫日',
      width: 104,
      sortable: true,
      cell: (r) => (
        <span className="num text-[13px] text-ink-600">
          {r.snapshot.lastShippedAt ? fmtDate(r.snapshot.lastShippedAt) : '—'}
        </span>
      ),
    },
    {
      id: 'nearestExpiryDate',
      header: '最短の期限',
      width: 108,
      sortable: true,
      cell: (r) => {
        const d = r.snapshot.nearestExpiryDate
        if (!d) return <span className="text-ink-400">—</span>
        const days = Math.floor((Date.parse(d) - Date.parse(opts.now.slice(0, 10))) / 86_400_000)
        return <ExpiryBadge expiryDate={d} daysLeft={days} alertDays={opts.alertDaysOf(r.item.categoryId)} />
      },
    },
    {
      id: 'jan',
      header: 'JAN',
      width: 128,
      sortable: true,
      cell: (r) => <span className="num text-[13px] text-ink-600">{r.item.jan ?? '—'}</span>,
    },
  ]
}

// 4つの在庫数と水位バーを左に寄せ、PC の最初の画面に必ず入るようにする
export const DEFAULT_STOCK_COLUMNS = [
  'sku',
  'name',
  'onHand',
  'allocated',
  'available',
  'incoming',
  'gauge',
  'state',
  'reorderPoint',
  'warehouse',
  'location',
  'stockValue',
  'nearestExpiryDate',
]
