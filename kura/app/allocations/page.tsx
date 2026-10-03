'use client'
// SC-104 引当：受注に対して在庫を確保する。★ 実在庫は変わらず、有効在庫だけが減る（FR-310）
import { useMemo, useState } from 'react'
import { Link2, Unlink } from 'lucide-react'
import {
  createAllocation,
  getSession,
  getStockDetail,
  listAllocationRows,
  listShippingOrders,
  releaseAllocation,
} from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { lookup } from '@/lib/scan'
import { fmtDate, fmtQty } from '@/lib/utils/format'
import { PageTitle } from '@/components/layout/PageTitle'
import { useScanSession } from '@/components/scan/useScanSession'
import { FourNumbers } from '@/components/gauge/FourNumbers'
import { SkeletonBlock } from '@/components/domain/Skeleton'
import { EmptyState } from '@/components/domain/EmptyState'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'

const field = 'h-9 w-full rounded border border-line-hi bg-panel px-2.5 text-body'

export default function AllocationsPage() {
  const toast = useToast()
  const session = useRepo(getSession)
  const rows = useRepo(() => listAllocationRows())
  const orders = useRepo(() => listShippingOrders())
  const scan = useScanSession()
  const [code, setCode] = useState('SKU-1042')
  const [wh, setWh] = useState('wh-tokyo')
  const [soId, setSoId] = useState('')
  const [qty, setQty] = useState('10')
  const [error, setError] = useState('')
  const item = useMemo(() => lookup(scan.catalog, code), [scan.catalog, code])
  const detail = useRepo(
    () => (item ? getStockDetail(item.sku) : Promise.resolve({ ok: true as const, data: undefined })),
    [item?.sku],
  )
  const snap = detail.data?.byWarehouse.find((w) => w.warehouseId === wh)
  const can = session.data?.permissions['allocation.write']
  const n = Number(qty.normalize('NFKC'))

  const submit = async () => {
    if (!item) return setError('SKU か JAN を正しく入力してください')
    if (!Number.isInteger(n) || n <= 0) return setError('引当数は1以上の整数で入力してください')
    setError('')
    const r = await createAllocation({
      itemId: item.itemId,
      warehouseId: wh,
      qtyBase: n,
      shippingOrderId: soId || undefined,
    })
    if (!r.ok) return setError(r.error)
    toast.show({
      message:
        r.data.warning ??
        `${item.name} を ${n}${item.baseUnit} 引き当てました。実在庫はそのまま、有効在庫だけが減ります`,
      tone: r.data.warning ? 'error' : 'info',
      undo: async () => {
        await releaseAllocation(r.data.allocation.id)
      },
    })
  }

  return (
    <>
      <PageTitle
        title="引当"
        lead="受注の分を「この在庫は売り先が決まっている」と確保します。棚の数（実在庫）は変わらず、これから売れる数（有効在庫）だけが減ります。"
      />
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section
          aria-labelledby="new-h"
          className="flex flex-col gap-4 rounded border border-line bg-panel p-5"
        >
          <h2 id="new-h" className="text-section">
            引当を作る
          </h2>
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-600">商品（SKU・JAN）</span>
            <input className={`${field} num`} value={code} onChange={(e) => setCode(e.target.value)} />
            <span className="text-[12px] text-ink-600">
              {item ? item.name : code ? '見つかりません' : ' '}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-600">拠点</span>
              <select className={field} value={wh} onChange={(e) => setWh(e.target.value)}>
                {(session.data?.warehouses ?? [])
                  .filter((w) => w.visible)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-600">引当数</span>
              <input
                className={`${field} num text-qty`}
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-600">受注（出荷指示）</span>
            <select className={field} value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">受注に紐づけない</option>
              {(orders.data ?? [])
                .filter((o) => o.warehouseId === wh)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code}　{o.customerName}
                  </option>
                ))}
            </select>
          </label>
          {snap && item && (
            <div className="rounded bg-panel-alt px-4 py-3">
              <p className="mb-2 text-label text-ink-600">いまの在庫（{snap.warehouseName}）</p>
              <FourNumbers
                onHand={snap.onHand}
                allocated={snap.allocated}
                incoming={snap.incoming}
                unit={item.baseUnit}
              />
              {Number.isInteger(n) && n > 0 && (
                <p className="mt-2 text-[12px] text-ink-600">
                  引き当てると：実在庫 <span className="num text-ink-900">{fmtQty(snap.onHand)}</span>{' '}
                  のまま、有効在庫{' '}
                  <span className="num text-ink-900">
                    {fmtQty(snap.available)} → {fmtQty(snap.available - n)}
                  </span>
                  {snap.available - n < 0 && (
                    <span className="ml-1 font-bold text-st-ink-stockout">
                      （マイナスになります。登録はできます）
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-[12px] text-st-ink-stockout">
              {error}
            </p>
          )}
          {can?.allowed ? (
            <Button variant="primary" onClick={submit}>
              <Link2 aria-hidden />
              引き当てる
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant="primary" disabled className="w-full" aria-describedby="deny-alloc">
                    <Link2 aria-hidden />
                    引き当てる
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent id="deny-alloc">{can?.reason}</TooltipContent>
            </Tooltip>
          )}
        </section>

        <section aria-labelledby="list-h" className="min-w-0 rounded border border-line bg-panel">
          <h2 id="list-h" className="border-b border-line px-5 py-3 text-section">
            有効な引当
            <span className="num ml-2 text-[13px] font-normal text-ink-500">{rows.data?.length ?? ''}</span>
          </h2>
          {!rows.data ? (
            <SkeletonBlock className="m-5 h-60" />
          ) : rows.data.length === 0 ? (
            <EmptyState
              kind="no-data"
              title="有効な引当はありません"
              description="受注が入ったら、ここで在庫を確保します。"
            />
          ) : (
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full min-w-[720px] text-body">
                <caption className="sr-only">有効な引当の一覧</caption>
                <thead className="sticky top-0 bg-panel-alt">
                  <tr className="border-b border-line-hi text-label text-ink-600">
                    <th scope="col" className="h-9 px-4 text-left">
                      受注
                    </th>
                    <th scope="col" className="px-3 text-left">
                      商品
                    </th>
                    <th scope="col" className="px-3 text-left">
                      拠点
                    </th>
                    <th scope="col" className="px-3 text-right">
                      引当
                    </th>
                    <th scope="col" className="px-3 text-right">
                      実在庫
                    </th>
                    <th scope="col" className="px-3 text-right">
                      有効在庫
                    </th>
                    <th scope="col" className="px-4 text-right">
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.data.map((a) => (
                    <tr key={a.id} className="h-[42px] border-b border-line last:border-0">
                      <td className="px-4">
                        <span className="num block text-[13px]">{a.orderCode}</span>
                        <span className="block text-[11px] text-ink-500">
                          {a.customerName}　{fmtDate(a.createdAt)}
                        </span>
                      </td>
                      <th scope="row" className="max-w-[260px] truncate px-3 text-left font-normal">
                        <span className="num mr-2 text-[12px] text-ink-600">{a.sku}</span>
                        {a.name}
                      </th>
                      <td className="px-3 text-ink-600">{a.warehouseName}</td>
                      <td className="num px-3 text-right text-qty">{fmtQty(a.qty)}</td>
                      <td className="num px-3 text-right text-qty text-ink-600">{fmtQty(a.onHand)}</td>
                      <td
                        className={`num px-3 text-right text-qty ${a.available < 0 ? 'text-st-ink-stockout' : ''}`}
                      >
                        {fmtQty(a.available)}
                      </td>
                      <td className="px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!can?.allowed}
                          title={!can?.allowed ? can?.reason : undefined}
                          onClick={async () => {
                            const r = await releaseAllocation(a.id)
                            toast.show(
                              r.ok
                                ? {
                                    message: `${a.name} の引当 ${a.qty}${a.unit} を解除しました。有効在庫が戻ります`,
                                  }
                                : { message: r.error, tone: 'error' },
                            )
                          }}
                        >
                          <Unlink aria-hidden />
                          解除
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
