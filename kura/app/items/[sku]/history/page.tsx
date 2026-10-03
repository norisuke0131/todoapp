'use client'
// SC-012 在庫履歴（元帳）：全トランザクションの時系列。★ 残高列で「積み上げ」を可視化する（FR-101, FR-106）
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getItemLedger, getMasters, getSession, getStockDetail, type LedgerEntry } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { fmtDateTime, fmtQty, fmtSigned } from '@/lib/utils/format'
import { DEVICE_LABEL, REF_LABEL, TXN_LABEL } from '@/lib/utils/labels'
import { cn } from '@/lib/utils/cn'
import { DataTable, type Column } from '@/components/table/DataTable'
import { TableSkeleton } from '@/components/domain/Skeleton'
import { EmptyState } from '@/components/domain/EmptyState'
import { ReverseDialog, canReverse, type ReverseTarget } from '@/components/domain/ReverseDialog'

export default function LedgerPage() {
  const { sku } = useParams<{ sku: string }>()
  const params = useSearchParams()
  const router = useRouter()
  const wh = params.get('wh') ?? undefined
  const ledger = useRepo(() => getItemLedger(sku, { warehouseId: wh }), [sku, wh])
  const detail = useRepo(() => getStockDetail(sku), [sku])
  const masters = useRepo(getMasters)
  const session = useRepo(getSession)

  const reason = useMemo(
    () => new Map((masters.data?.reasonCodes ?? []).map((r) => [r.id, r.name])),
    [masters.data],
  )
  const rows = useMemo(() => [...(ledger.data ?? [])].reverse(), [ledger.data]) // 新しい取引を上に
  const unit = detail.data?.item.baseUnit ?? ''
  const showWarehouse = !wh && session.data?.allWarehouses
  const canUndo = session.data?.permissions['txn.reverse'].allowed
  const [undo, setUndo] = useState<ReverseTarget>()

  const d = detail.data
  const columns: Column<LedgerEntry>[] = [
    {
      id: 'at',
      header: '日時',
      width: 112,
      cell: (e) => <span className="num text-[13px] text-ink-600">{fmtDateTime(e.txn.occurredAt)}</span>,
    },
    {
      id: 'type',
      header: '種別',
      width: 148,
      cell: (e) => (
        <span className="flex items-center gap-1.5">
          <span className={cn(e.isReversed && 'text-ink-500 line-through')}>{TXN_LABEL[e.txn.type]}</span>
          {e.isReversed && <Tag>取消済</Tag>}
          {e.isReversal && <Tag>取消</Tag>}
        </span>
      ),
    },
    {
      id: 'qty',
      header: '数量',
      width: 84,
      align: 'right',
      cell: (e) => (
        <span
          className={cn(
            'num text-qty',
            e.txn.qtyBase > 0 ? 'text-st-ink-normal' : 'text-ink-900',
            e.isReversed && 'text-ink-500 line-through',
          )}
        >
          {fmtSigned(e.txn.qtyBase)}
        </span>
      ),
    },
    {
      id: 'balance',
      header: '残高',
      width: 96,
      align: 'right',
      cell: (e) => (
        <span className="num text-qty text-ink-900">
          {fmtQty(e.balance)}
          <span className="ml-0.5 font-sans text-[10px] font-normal text-ink-500">{unit}</span>
        </span>
      ),
    },
    ...(showWarehouse
      ? [
          {
            id: 'wh',
            header: '拠点',
            width: 92,
            cell: (e: LedgerEntry) => <span className="text-ink-600">{e.warehouseName}</span>,
          },
        ]
      : []),
    {
      id: 'input',
      header: '入力',
      width: 92,
      align: 'right' as const,
      cell: (e: LedgerEntry) =>
        e.txn.inputUnit && e.txn.inputUnit !== unit ? (
          <span className="num text-[13px] text-ink-600">
            {fmtSigned(e.txn.inputQty)}
            <span className="ml-0.5 font-sans text-[10px] font-normal">{e.txn.inputUnit}</span>
          </span>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      id: 'user',
      header: '担当',
      width: 112,
      cell: (e) => (
        <span className="text-ink-600">
          {e.userName}
          <span className="ml-1.5 text-[11px] text-ink-500">{DEVICE_LABEL[e.txn.device]}</span>
        </span>
      ),
    },
    {
      id: 'ref',
      header: '参照・理由',
      width: 260,
      minWidth: 120,
      cell: (e) => {
        const parts = [
          e.txn.refType ? `${REF_LABEL[e.txn.refType]}` : '',
          e.txn.reasonCodeId ? reason.get(e.txn.reasonCodeId) : '',
          e.lotNo ? `ロット ${e.lotNo}` : '',
          e.txn.note,
        ].filter(Boolean)
        return (
          <span className="text-[12px] text-ink-600" title={parts.join(' ／ ')}>
            {parts.join(' ／ ') || '—'}
          </span>
        )
      },
    },
    ...(canUndo
      ? [
          {
            id: 'reverse',
            header: '取消',
            headerLabel: '取消の操作',
            width: 72,
            cell: (e: LedgerEntry) =>
              canReverse(e.txn, e.isReversed) ? (
                <button
                  onClick={(ev) => {
                    ev.stopPropagation()
                    setUndo({
                      id: e.txn.id,
                      type: e.txn.type,
                      qtyBase: e.txn.qtyBase,
                      unit,
                      itemLabel: `${sku} ${d?.item.name ?? ''}`,
                      occurredAt: e.txn.occurredAt,
                      userName: e.userName,
                    })
                  }}
                  className="rounded-sm px-1.5 py-0.5 text-[12px] font-bold text-primary-d hover:bg-panel-alt"
                >
                  取り消す
                </button>
              ) : null,
          },
        ]
      : []),
  ]

  return (
    <>
      <Link
        href={`/items/${sku}${wh ? `?wh=${wh}` : ''}`}
        className="mb-3 inline-flex items-center gap-1 text-[12px] font-bold text-primary-d hover:underline"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        商品詳細
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="num text-[13px] text-ink-600">{sku}</p>
          <h1 className="text-page-title">在庫履歴（元帳）</h1>
          <p className="mt-1 text-body text-ink-600">
            {d?.item.name}。上が新しい取引です。残高は、その取引を反映した後の実在庫です。
          </p>
        </div>
        {session.data?.allWarehouses && d && d.byWarehouse.length > 1 && (
          <label className="flex items-center gap-2 text-[12px] text-ink-600">
            拠点
            <select
              value={wh ?? ''}
              onChange={(e) =>
                router.replace(`/items/${sku}/history${e.target.value ? `?wh=${e.target.value}` : ''}`, {
                  scroll: false,
                })
              }
              className="h-8 rounded border border-line-hi bg-panel px-2 text-body text-ink-900"
            >
              <option value="">すべての拠点</option>
              {d.byWarehouse.map((w) => (
                <option key={w.warehouseId} value={w.warehouseId}>
                  {w.warehouseName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {rows.length > 0 && (
        <section
          aria-label="積み上げの要約"
          className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded border border-line bg-panel px-5 py-3.5"
        >
          <Summary label="取引" value={rows.length} unit="件" />
          <Summary
            label="入った数"
            value={rows.reduce((s, e) => s + Math.max(0, e.txn.qtyBase), 0)}
            unit={unit}
            sign="+"
          />
          <Summary
            label="出た数"
            value={rows.reduce((s, e) => s + Math.min(0, e.txn.qtyBase), 0)}
            unit={unit}
          />
          <span aria-hidden className="num text-[18px] text-ink-400">
            =
          </span>
          <Summary label="現在の実在庫" value={rows[0]!.balance} unit={unit} strong />
        </section>
      )}

      <section className="rounded border border-line bg-panel">
        {!ledger.data ? (
          <TableSkeleton rows={12} />
        ) : (
          <DataTable
            caption={`${sku} の在庫履歴`}
            rows={rows}
            columns={columns}
            getRowId={(e) => e.txn.id}
            rowHeaderId="at"
            sort={[]}
            onSortToggle={() => {}}
            height="max(420px, calc(100dvh - 380px))"
            empty={
              <EmptyState
                kind="no-data"
                title="まだ取引がありません"
                description="入庫や期首棚卸を登録すると、ここに積み上がります。"
              />
            }
          />
        )}
      </section>
      <ReverseDialog target={undo} onClose={() => setUndo(undefined)} />
    </>
  )
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-sm border border-line-hi px-1 text-[10px] font-bold leading-4 text-ink-600">
      {children}
    </span>
  )
}

function Summary({
  label,
  value,
  unit,
  sign,
  strong,
}: {
  label: string
  value: number
  unit: string
  sign?: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-label text-ink-600">{label}</span>
      <span
        className={cn(
          'num',
          strong ? 'text-[24px] leading-7 text-ink-900' : 'text-[18px] leading-6 text-ink-900',
        )}
      >
        {sign && value > 0 ? sign : ''}
        {fmtQty(value)}
      </span>
      <span className="text-[11px] text-ink-500">{unit}</span>
    </div>
  )
}
