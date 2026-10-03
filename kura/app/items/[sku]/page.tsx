'use client'
// SC-011 商品詳細：4数値ブロック + フル幅水位バー + 拠点別・ロット別内訳 + 補充設定・回転
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, History, Pencil } from 'lucide-react'
import { getItemLedger, getItemMetrics, getMasters, getSession, getStockDetail } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { nowIso } from '@/lib/utils/clock'
import { fmtDate, fmtDateTime, fmtQty, fmtSigned, fmtYen } from '@/lib/utils/format'
import { TXN_LABEL } from '@/lib/utils/labels'
import { cn } from '@/lib/utils/cn'
import { FourNumbers } from '@/components/gauge/FourNumbers'
import { GaugePanel } from '@/components/gauge/GaugePanel'
import { StockGauge } from '@/components/gauge/StockGauge'
import { GaugeTooltip } from '@/components/gauge/GaugeTooltip'
import { StockStatusBadge } from '@/components/domain/StockStatusBadge'
import { ExpiryBadge } from '@/components/domain/ExpiryBadge'
import { SkeletonBlock } from '@/components/domain/Skeleton'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export default function ItemDetailPage() {
  const { sku } = useParams<{ sku: string }>()
  const params = useSearchParams()
  const router = useRouter()
  const wh = params.get('wh') ?? undefined
  const detail = useRepo(() => getStockDetail(sku), [sku])
  const session = useRepo(getSession)
  const masters = useRepo(getMasters)
  const metrics = useRepo(() => getItemMetrics(sku, wh), [sku, wh])
  const ledger = useRepo(() => getItemLedger(sku, { warehouseId: wh }), [sku, wh])

  if (detail.error) {
    return (
      <div className="mx-auto max-w-[520px] rounded border border-line bg-panel p-6">
        <h1 className="text-section">{detail.error}</h1>
        <p className="mt-1.5 text-body text-ink-600">
          担当拠点で扱っていない商品か、SKU が変わった可能性があります。
        </p>
        <Button asChild variant="primary" className="mt-5">
          <Link href="/stock">在庫一覧へ戻る</Link>
        </Button>
      </div>
    )
  }
  const d = detail.data
  if (!d) return <SkeletonBlock className="h-[480px] w-full rounded" />

  const snap = (wh && d.byWarehouse.find((w) => w.warehouseId === wh)) || d.total
  const scopeName = wh
    ? d.byWarehouse.find((w) => w.warehouseId === wh)?.warehouseName
    : session.data?.allWarehouses
      ? '全拠点の合計'
      : d.byWarehouse[0]?.warehouseName
  const item = d.item
  const cat = masters.data?.categories.find((c) => c.id === item.categoryId)
  const supplier = masters.data?.suppliers.find((s) => s.id === item.defaultSupplierId)
  const lots = d.byLot.filter((l) => !wh || l.warehouseId === wh)
  const now = nowIso()
  const canEdit = session.data?.permissions['master.write']
  const gauge = {
    onHand: snap.onHand,
    allocated: snap.allocated,
    incoming: snap.incoming,
    reorderPoint: snap.reorderPoint,
    safetyStock: snap.safetyStock,
    excessLine: d.excessLine,
  }
  const pack = item.packUnits.map((p) => `1${p.name}＝${p.qtyInBase}${item.baseUnit}`).join('・')

  return (
    <>
      <Link
        href="/stock"
        className="mb-3 inline-flex items-center gap-1 text-[12px] font-bold text-primary-d hover:underline"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        在庫一覧
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="num text-[13px] text-ink-600">{item.sku}</p>
          <h1 className="text-page-title">{item.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-600">
            <span>{d.categoryName}</span>
            {item.jan && <span className="num text-[12px]">JAN {item.jan}</span>}
            <span>
              単位：{item.baseUnit}
              {pack && `（${pack}）`}
            </span>
            {item.isLotManaged && <span>ロット・期限管理</span>}
            {item.abcClass && <span className="num">ABC：{item.abcClass}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href={`/items/${item.sku}/history${wh ? `?wh=${wh}` : ''}`}>
              <History aria-hidden />
              在庫履歴（元帳）
            </Link>
          </Button>
          {canEdit?.allowed ? (
            <Button asChild size="sm">
              <Link href={`/items/${item.sku}/edit`}>
                <Pencil aria-hidden />
                編集
              </Link>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button size="sm" disabled aria-describedby="deny-edit">
                    <Pencil aria-hidden />
                    編集
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent id="deny-edit">{canEdit?.reason}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {(session.data?.allWarehouses || d.byWarehouse.length > 1) && d.byWarehouse.length > 0 && (
        <div role="tablist" aria-label="表示する拠点" className="mb-3 flex gap-1">
          {[
            { id: undefined, name: '全拠点の合計' },
            ...d.byWarehouse.map((w) => ({ id: w.warehouseId, name: w.warehouseName })),
          ].map((t) => (
            <button
              key={t.id ?? 'all'}
              role="tab"
              aria-selected={wh === t.id}
              onClick={() =>
                router.replace(`/items/${item.sku}${t.id ? `?wh=${t.id}` : ''}`, { scroll: false })
              }
              className={cn(
                'h-8 rounded-sm px-3 text-[12px] font-bold',
                wh === t.id ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-panel',
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      <section aria-labelledby="levels" className="mb-5 rounded border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 id="levels" className="text-section">
            在庫の水位<span className="ml-2 text-[12px] font-normal text-ink-500">{scopeName}</span>
          </h2>
          <StockStatusBadge state={snap.status} />
        </div>
        <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-center lg:gap-10">
          <FourNumbers
            onHand={snap.onHand}
            allocated={snap.allocated}
            incoming={snap.incoming}
            inTransit={snap.inTransit}
            unit={item.baseUnit}
          />
          <GaugePanel {...gauge} unit={item.baseUnit} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {session.data?.allWarehouses && d.byWarehouse.length > 0 && (
            <Card title="拠点別の内訳">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-body">
                  <caption className="sr-only">拠点別の在庫</caption>
                  <thead>
                    <tr className="border-b border-line-hi text-label text-ink-600">
                      <th scope="col" className="h-9 px-4 text-left">
                        拠点
                      </th>
                      {['実在庫', '引当済', '有効在庫', '入荷予定'].map((h) => (
                        <th key={h} scope="col" className="px-3 text-right">
                          {h}
                        </th>
                      ))}
                      <th scope="col" className="px-3 text-left">
                        水位
                      </th>
                      <th scope="col" className="px-3 text-left">
                        状態
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.byWarehouse.map((w) => (
                      <tr key={w.warehouseId} className="h-[38px] border-b border-line last:border-0">
                        <th scope="row" className="px-4 text-left font-normal">
                          {w.warehouseName}
                        </th>
                        <td className="num px-3 text-right text-qty text-ink-600">{fmtQty(w.onHand)}</td>
                        <td className="num px-3 text-right text-qty text-ink-600">{fmtQty(w.allocated)}</td>
                        <td className="num px-3 text-right text-qty text-ink-900">{fmtQty(w.available)}</td>
                        <td className="num px-3 text-right text-qty text-ink-600">
                          {w.incoming > 0 ? `+${fmtQty(w.incoming)}` : 0}
                        </td>
                        <td className="px-3">
                          <GaugeTooltip
                            values={{
                              ...gauge,
                              onHand: w.onHand,
                              allocated: w.allocated,
                              incoming: w.incoming,
                            }}
                            unit={item.baseUnit}
                          >
                            <StockGauge
                              {...gauge}
                              onHand={w.onHand}
                              allocated={w.allocated}
                              incoming={w.incoming}
                              unit={item.baseUnit}
                            />
                          </GaugeTooltip>
                        </td>
                        <td className="px-3">
                          <StockStatusBadge state={w.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {item.isLotManaged && (
            <Card
              title="ロット別の内訳"
              note="期限の近い順。出庫は期限の近いロットから（FEFO）推奨されます。"
            >
              {lots.length === 0 ? (
                <p className="px-5 py-6 text-body text-ink-600">在庫のあるロットはありません。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-body">
                    <caption className="sr-only">ロット別の在庫</caption>
                    <thead>
                      <tr className="border-b border-line-hi text-label text-ink-600">
                        <th scope="col" className="h-9 px-4 text-left">
                          ロット番号
                        </th>
                        <th scope="col" className="px-3 text-left">
                          拠点
                        </th>
                        <th scope="col" className="px-3 text-left">
                          入荷日
                        </th>
                        <th scope="col" className="px-3 text-left">
                          期限
                        </th>
                        <th scope="col" className="px-3 text-right">
                          実在庫
                        </th>
                        <th scope="col" className="px-4 text-right">
                          有効在庫
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lots.map((l) => {
                        const days = l.expiryDate
                          ? Math.floor((Date.parse(l.expiryDate) - Date.parse(now.slice(0, 10))) / 86_400_000)
                          : undefined
                        return (
                          <tr
                            key={`${l.lotId}-${l.warehouseId}`}
                            className="h-[38px] border-b border-line last:border-0"
                          >
                            <th scope="row" className="num px-4 text-left text-[13px] font-semibold">
                              {l.lotNo}
                            </th>
                            <td className="px-3 text-ink-600">
                              {masters.data?.warehouses.find((w) => w.id === l.warehouseId)?.name}
                            </td>
                            <td className="num px-3 text-[13px] text-ink-600">{fmtDate(l.receivedAt)}</td>
                            <td className="px-3">
                              {l.expiryDate && days !== undefined ? (
                                <span className="flex items-center gap-2">
                                  <span className="num text-[13px] text-ink-600">
                                    {fmtDate(l.expiryDate)}
                                  </span>
                                  {days <= (cat?.expiryAlertDays ?? 30) && (
                                    <ExpiryBadge
                                      expiryDate={l.expiryDate}
                                      daysLeft={days}
                                      alertDays={cat?.expiryAlertDays ?? 30}
                                    />
                                  )}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="num px-3 text-right text-qty text-ink-600">{fmtQty(l.onHand)}</td>
                            <td className="num px-4 text-right text-qty text-ink-900">
                              {fmtQty(l.available)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          <Card
            title="最近の取引"
            note="現在庫は、この取引の積み上げです。"
            action={
              <Link
                href={`/items/${item.sku}/history${wh ? `?wh=${wh}` : ''}`}
                className="text-[12px] font-bold text-primary-d hover:underline"
              >
                すべて見る
              </Link>
            }
          >
            <ul className="divide-y divide-line">
              {(ledger.data ?? [])
                .slice(-6)
                .reverse()
                .map((e) => (
                  <li key={e.txn.id} className="flex items-center gap-3 px-5 py-2.5 text-body">
                    <span className="num w-[76px] shrink-0 text-[12px] text-ink-500 sm:w-[86px]">
                      {fmtDateTime(e.txn.occurredAt)}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate sm:w-[88px] sm:flex-none',
                        e.isReversed && 'text-ink-500 line-through',
                      )}
                    >
                      {TXN_LABEL[e.txn.type]}
                    </span>
                    <span
                      className={cn(
                        'num w-14 shrink-0 text-right text-qty',
                        e.txn.qtyBase < 0 ? 'text-ink-900' : 'text-st-ink-normal',
                        e.isReversed && 'text-ink-500 line-through',
                      )}
                    >
                      {fmtSigned(e.txn.qtyBase)}
                    </span>
                    <span aria-hidden className="text-ink-400">
                      →
                    </span>
                    <span className="num w-14 shrink-0 text-qty text-ink-900">{fmtQty(e.balance)}</span>
                    <span className="hidden min-w-0 truncate text-[12px] text-ink-500 sm:inline">
                      {e.userName}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card title="補充の設定">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4">
              <Fact label="発注点" value={fmtQty(item.reorderPoint)} unit={item.baseUnit} />
              <Fact label="安全在庫" value={fmtQty(item.safetyStock)} unit={item.baseUnit} />
              <Fact label="発注ロット" value={fmtQty(item.orderLot)} unit={item.baseUnit} />
              <Fact label="リードタイム" value={String(item.leadTimeDays)} unit="日" />
              <div className="col-span-2">
                <dt className="text-label text-ink-600">仕入先</dt>
                <dd className="mt-0.5 text-body">{supplier?.name ?? '未設定'}</dd>
              </div>
            </dl>
            {metrics.data && (
              <p className="border-t border-line px-5 py-3 text-[12px] leading-5 text-ink-600">
                直近{metrics.data.periodDays}日の平均出庫は{' '}
                <span className="num text-[13px] text-ink-900">{metrics.data.avgDailyShipped}</span>/日。
                リードタイム×平均出庫＋安全在庫から、推奨の発注点は{' '}
                <span className="num text-[13px] text-ink-900">
                  {fmtQty(metrics.data.suggestedReorderPoint)}
                </span>
                {metrics.data.suggestedReorderPoint !== item.reorderPoint && (
                  <>（いまより {fmtSigned(metrics.data.suggestedReorderPoint - item.reorderPoint)}）</>
                )}
                です。
              </p>
            )}
          </Card>
          <Card title="回転と滞留">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4">
              {metrics.data?.turnover !== undefined && (
                <Fact
                  label={`回転率（${metrics.data.periodDays}日）`}
                  value={metrics.data.turnover.toFixed(2)}
                  unit="回"
                />
              )}
              <Fact label="最終出庫日" value={snap.lastShippedAt ? fmtDate(snap.lastShippedAt) : '—'} />
              <Fact
                label="出庫なし"
                value={snap.idleDays !== undefined ? String(snap.idleDays) : '—'}
                unit="日"
              />
            </dl>
          </Card>
          {snap.stockValue !== undefined && (
            <Card title="金額">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4">
                <Fact label="原価（移動平均）" value={fmtYen(Math.round(snap.unitCost ?? 0))} />
                <Fact label="売価" value={fmtYen(item.price)} />
                <Fact label="在庫金額" value={fmtYen(snap.stockValue)} />
                {item.cost !== undefined && item.price > 0 && (
                  <Fact
                    label="粗利率"
                    value={`${Math.round(((item.price - item.cost) / item.price) * 100)}`}
                    unit="%"
                  />
                )}
              </dl>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function Card({
  title,
  note,
  action,
  children,
}: {
  title: string
  note?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded border border-line bg-panel">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-section">{title}</h2>
          {note && <p className="mt-0.5 text-[12px] text-ink-600">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Fact({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <dt className="text-label text-ink-600">{label}</dt>
      <dd className="mt-0.5">
        <span className="num text-[18px] leading-6 text-ink-900">{value}</span>
        {unit && <span className="ml-0.5 text-[11px] text-ink-500">{unit}</span>}
      </dd>
    </div>
  )
}
