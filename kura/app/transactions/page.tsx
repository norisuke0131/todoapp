'use client'
// SC-130 トランザクション一覧：全取引を種別・拠点・期間・担当者で絞り込み、CSV に書き出す
import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { TxnType } from '@/lib/types'
import { getMasters, getSession, listTransactionRows, type TxnRow } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { downloadCsv, toCsv } from '@/lib/csv/export'
import { fmtDateTime, fmtSigned } from '@/lib/utils/format'
import { DEVICE_LABEL, REF_LABEL, TXN_LABEL } from '@/lib/utils/labels'
import { cn } from '@/lib/utils/cn'
import { PageTitle } from '@/components/layout/PageTitle'
import { DataTable, type Column } from '@/components/table/DataTable'
import { TableSkeleton } from '@/components/domain/Skeleton'
import { EmptyState } from '@/components/domain/EmptyState'
import { ReverseDialog, canReverse, type ReverseTarget } from '@/components/domain/ReverseDialog'
import { Button } from '@/components/ui/button'

const TYPES = Object.keys(TXN_LABEL) as TxnType[]
const sel = 'h-8 rounded border border-line-hi bg-panel px-2 text-body'
const jst = (d: string, end: boolean) =>
  new Date(`${d}T${end ? '23:59:59.999' : '00:00:00'}+09:00`).toISOString()

export default function TransactionsPage() {
  const all = useRepo(() => listTransactionRows())
  const masters = useRepo(getMasters)
  const session = useRepo(getSession)
  const [types, setTypes] = useState<Set<TxnType>>(new Set())
  const [wh, setWh] = useState('')
  const [user, setUser] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [undo, setUndo] = useState<ReverseTarget>()
  const query = useDeferredValue(q.normalize('NFKC').trim().toLowerCase())

  const rows = useMemo(() => {
    const f = from ? jst(from, false) : ''
    const t = to ? jst(to, true) : ''
    return (all.data ?? []).filter(
      (r) =>
        (types.size === 0 || types.has(r.type)) &&
        (!wh || r.warehouseId === wh) &&
        (!user || r.userId === user) &&
        (!f || r.occurredAt >= f) &&
        (!t || r.occurredAt <= t) &&
        (!query || r.sku.toLowerCase().includes(query) || r.itemName.toLowerCase().includes(query)),
    )
  }, [all.data, types, wh, user, from, to, query])

  const canUndo = session.data?.permissions['txn.reverse'].allowed
  const filtered = types.size > 0 || wh || user || from || to || query

  const columns: Column<TxnRow>[] = [
    {
      id: 'at',
      header: '日時',
      width: 112,
      cell: (r) => <span className="num text-[13px] text-ink-600">{fmtDateTime(r.occurredAt)}</span>,
    },
    {
      id: 'type',
      header: '種別',
      width: 150,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <span className={cn(r.isReversed && 'text-ink-500 line-through')}>{TXN_LABEL[r.type]}</span>
          {r.isReversed && <Tag>取消済</Tag>}
          {r.reversesTxnId && <Tag>取消</Tag>}
        </span>
      ),
    },
    {
      id: 'item',
      header: '商品',
      width: 260,
      minWidth: 160,
      cell: (r) => (
        <Link
          href={`/items/${r.sku}/history`}
          className="flex min-w-0 items-baseline gap-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="num shrink-0 text-[13px] text-ink-600">{r.sku}</span>
          <span className="truncate">{r.itemName}</span>
        </Link>
      ),
    },
    {
      id: 'qty',
      header: '数量',
      width: 92,
      align: 'right',
      cell: (r) => (
        <span
          className={cn(
            'num text-qty',
            r.qtyBase > 0 ? 'text-st-ink-normal' : 'text-ink-900',
            r.isReversed && 'text-ink-500 line-through',
          )}
        >
          {fmtSigned(r.qtyBase)}
          <span className="ml-0.5 font-sans text-[10px] font-normal text-ink-500">{r.baseUnit}</span>
        </span>
      ),
    },
    {
      id: 'wh',
      header: '拠点',
      width: 92,
      cell: (r) => <span className="text-ink-600">{r.warehouseName || '—'}</span>,
    },
    {
      id: 'user',
      header: '担当',
      width: 120,
      cell: (r) => (
        <span className="text-ink-600">
          {r.userName}
          <span className="ml-1.5 text-[11px] text-ink-500">{DEVICE_LABEL[r.device]}</span>
        </span>
      ),
    },
    {
      id: 'ref',
      header: '参照・理由',
      width: 240,
      minWidth: 120,
      cell: (r) => {
        const parts = [
          r.refType ? REF_LABEL[r.refType] : '',
          r.reasonName,
          r.lotNo ? `ロット ${r.lotNo}` : '',
          r.note,
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
            width: 76,
            cell: (r: TxnRow) =>
              canReverse(r, r.isReversed) ? (
                <button
                  onClick={(ev) => {
                    ev.stopPropagation()
                    setUndo({
                      id: r.id,
                      type: r.type,
                      qtyBase: r.qtyBase,
                      unit: r.baseUnit,
                      itemLabel: `${r.sku} ${r.itemName}`,
                      occurredAt: r.occurredAt,
                      userName: r.userName,
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

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: '日時', value: (r) => fmtDateTime(r.occurredAt) },
      { label: '種別', value: (r) => TXN_LABEL[r.type] },
      { label: '取消', value: (r) => (r.isReversed ? '取消済' : r.reversesTxnId ? '取消' : '') },
      { label: 'SKU', value: (r) => r.sku },
      { label: '商品名', value: (r) => r.itemName },
      { label: '数量', value: (r) => r.qtyBase },
      { label: '単位', value: (r) => r.baseUnit },
      { label: '入力数量', value: (r) => r.inputQty },
      { label: '入力単位', value: (r) => r.inputUnit },
      { label: '拠点', value: (r) => r.warehouseName },
      { label: 'ロット', value: (r) => r.lotNo },
      { label: '担当', value: (r) => r.userName },
      { label: '端末', value: (r) => DEVICE_LABEL[r.device] },
      { label: '参照', value: (r) => (r.refType ? REF_LABEL[r.refType] : '') },
      { label: '理由', value: (r) => r.reasonName },
      { label: 'メモ', value: (r) => r.note },
    ])
    downloadCsv(`kura-transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <>
      <PageTitle
        title="取引履歴"
        lead="在庫を動かした取引のすべてです。取引は消さず、書き換えもしません。間違いは「取消」の取引を足して打ち消すので、何が起きたかが全部残ります。"
        actions={
          <Button onClick={exportCsv} disabled={!rows.length}>
            <Download aria-hidden />
            CSV（{rows.length.toLocaleString('ja-JP')}件）
          </Button>
        }
      />
      <section
        aria-label="絞り込み"
        className="mb-3 flex flex-col gap-3 rounded border border-line bg-panel px-4 py-3"
      >
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="種別">
          {TYPES.map((t) => {
            const on = types.has(t)
            return (
              <button
                key={t}
                aria-pressed={on}
                onClick={() =>
                  setTypes((s) => {
                    const n = new Set(s)
                    if (on) n.delete(t)
                    else n.add(t)
                    return n
                  })
                }
                className={cn(
                  'h-7 rounded-sm border px-2.5 text-[12px] font-bold',
                  on
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-line-hi text-ink-600 hover:bg-panel-alt',
                )}
              >
                {TXN_LABEL[t]}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-600">
          <label className="flex items-center gap-1.5">
            商品
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="SKU・商品名"
              className={`${sel} w-40`}
            />
          </label>
          <label className="flex items-center gap-1.5">
            拠点
            <select value={wh} onChange={(e) => setWh(e.target.value)} className={sel}>
              <option value="">すべて</option>
              {(masters.data?.warehouses ?? [])
                .filter((w) => w.visible)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            担当
            <select value={user} onChange={(e) => setUser(e.target.value)} className={sel}>
              <option value="">すべて</option>
              {(masters.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <span className="flex items-center gap-1.5">
            <label htmlFor="tx-from">期間</label>
            <input
              id="tx-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${sel} num`}
              aria-label="期間の開始日"
            />
            〜
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`${sel} num`}
              aria-label="期間の終了日"
            />
          </span>
          {filtered && (
            <button
              onClick={() => {
                setTypes(new Set())
                setWh('')
                setUser('')
                setFrom('')
                setTo('')
                setQ('')
              }}
              className="font-bold text-primary-d hover:underline"
            >
              条件をクリア
            </button>
          )}
        </div>
      </section>
      <MobileList rows={rows} canUndo={Boolean(canUndo)} onUndo={setUndo} />
      <section className="hidden rounded border border-line bg-panel md:block">
        {!all.data ? (
          <TableSkeleton rows={12} />
        ) : (
          <DataTable
            caption="取引履歴"
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id}
            rowHeaderId="at"
            sort={[]}
            onSortToggle={() => {}}
            height="max(420px, calc(100dvh - 330px))"
            empty={
              <EmptyState
                kind={filtered ? 'no-match' : 'no-data'}
                title={filtered ? '条件に合う取引がありません' : 'まだ取引がありません'}
                description={
                  filtered
                    ? '条件を減らすか、期間を広げてください。'
                    : '入庫や出庫を登録すると、ここに積み上がります。'
                }
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

/** スマホ幅では表の代わりにカードで。全件は重いので 50 件ずつ足していく */
function MobileList({
  rows,
  canUndo,
  onUndo,
}: {
  rows: TxnRow[]
  canUndo: boolean
  onUndo: (t: ReverseTarget) => void
}) {
  const [limit, setLimit] = useState(50)
  return (
    <section aria-label="取引の一覧" className="md:hidden">
      <ul className="divide-y divide-line rounded border border-line bg-panel">
        {rows.slice(0, limit).map((r) => (
          <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[13px] font-bold">
                <span className={cn(r.isReversed && 'text-ink-500 line-through')}>{TXN_LABEL[r.type]}</span>
                {r.isReversed && <Tag>取消済</Tag>}
                {r.reversesTxnId && <Tag>取消</Tag>}
              </span>
              <span
                className={cn(
                  'num text-qty',
                  r.qtyBase > 0 ? 'text-st-ink-normal' : 'text-ink-900',
                  r.isReversed && 'text-ink-500 line-through',
                )}
              >
                {fmtSigned(r.qtyBase)}
                <span className="ml-0.5 font-sans text-[10px] font-normal text-ink-500">{r.baseUnit}</span>
              </span>
            </div>
            <Link href={`/items/${r.sku}/history`} className="truncate text-body hover:underline">
              <span className="num mr-2 text-[13px] text-ink-600">{r.sku}</span>
              {r.itemName}
            </Link>
            <div className="flex items-center justify-between gap-3 text-[12px] text-ink-600">
              <span className="num">
                {fmtDateTime(r.occurredAt)}・{r.warehouseName}・{r.userName}
              </span>
              {canUndo && canReverse(r, r.isReversed) && (
                <button
                  onClick={() =>
                    onUndo({
                      id: r.id,
                      type: r.type,
                      qtyBase: r.qtyBase,
                      unit: r.baseUnit,
                      itemLabel: `${r.sku} ${r.itemName}`,
                      occurredAt: r.occurredAt,
                      userName: r.userName,
                    })
                  }
                  className="-my-2 min-h-[44px] shrink-0 px-2 font-bold text-primary-d"
                >
                  取り消す
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {rows.length > limit && (
        <Button className="mt-3 w-full" onClick={() => setLimit((n) => n + 50)}>
          さらに表示（残り {(rows.length - limit).toLocaleString('ja-JP')} 件）
        </Button>
      )}
    </section>
  )
}
