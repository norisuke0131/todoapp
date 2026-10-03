'use client'
// SC-111 移動の入荷処理：到着を確かめ、数の差があれば記録する。ここで初めて到着先の在庫に入る
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PackageCheck } from 'lucide-react'
import { getMasters, listItems, listTransfers, receiveTransfer } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { fmtDate, fmtQty } from '@/lib/utils/format'
import { PageTitle } from '@/components/layout/PageTitle'
import { SkeletonBlock } from '@/components/domain/Skeleton'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

export default function TransferReceivePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const transfers = useRepo(listTransfers)
  const items = useRepo(listItems)
  const masters = useRepo(getMasters)
  const t = transfers.data?.find((x) => x.id === id)
  const [got, setGot] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (t) setGot(Object.fromEntries(t.lines.map((l) => [l.itemId, String(l.qtyBase - l.receivedQtyBase)])))
  }, [t])
  const wh = (w: string) => masters.data?.warehouses.find((x) => x.id === w)?.name ?? ''
  const item = (i: string) => items.data?.find((x) => x.id === i)
  if (!t)
    return transfers.data ? (
      <p className="text-body text-ink-600">移動が見つかりません。</p>
    ) : (
      <SkeletonBlock className="h-60 w-full rounded" />
    )
  return (
    <>
      <PageTitle
        title={`${t.code} の入荷処理`}
        lead={`${wh(t.fromWarehouseId)} → ${wh(t.toWarehouseId)}・出荷 ${fmtDate(t.shippedAt)}。届いた数を確かめてください。違っていれば、その数で入荷し、差を記録します。`}
      />
      {t.status !== 'in_transit' ? (
        <p className="rounded border border-line bg-panel px-5 py-4 text-body">この移動は入荷済みです。</p>
      ) : (
        <section className="max-w-[720px] rounded border border-line bg-panel">
          <ul className="divide-y divide-line">
            {t.lines.map((l) => {
              const i = item(l.itemId)
              const v = Number((got[l.itemId] ?? '').normalize('NFKC'))
              const diff = v - (l.qtyBase - l.receivedQtyBase)
              return (
                <li key={l.itemId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="num text-[13px] text-ink-600">{i?.sku}</p>
                    <p className="truncate text-body">{i?.name}</p>
                  </div>
                  <span className="num text-[13px] text-ink-600">出荷 {fmtQty(l.qtyBase)}</span>
                  <label className="flex items-center gap-2">
                    <span className="text-label text-ink-600">届いた数</span>
                    <input
                      inputMode="numeric"
                      value={got[l.itemId] ?? ''}
                      onChange={(e) => setGot((g) => ({ ...g, [l.itemId]: e.target.value }))}
                      className="num h-10 w-20 rounded border border-line-hi text-center text-[18px]"
                    />
                  </label>
                  {Number.isFinite(diff) && diff !== 0 && (
                    <span className="w-full text-right text-[12px] font-bold text-st-ink-low">
                      {diff < 0
                        ? `${fmtQty(-diff)} 足りません（差として記録します）`
                        : `${fmtQty(diff)} 多く届いています`}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex justify-end border-t border-line px-5 py-3">
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                const r = await receiveTransfer(
                  t.id,
                  Object.fromEntries(
                    Object.entries(got).map(([k, v]) => [k, Number(v.normalize('NFKC')) || 0]),
                  ),
                )
                setBusy(false)
                if (!r.ok) return toast.show({ message: r.error, tone: 'error' })
                toast.show({
                  message: `${t.code} を入荷しました。${wh(t.toWarehouseId)}の在庫に入りました${r.data.differences.length ? `（差 ${r.data.differences.length} 件を記録）` : ''}`,
                })
                router.push('/transfer')
              }}
            >
              <PackageCheck aria-hidden />
              入荷を確定
            </Button>
          </div>
        </section>
      )}
    </>
  )
}
