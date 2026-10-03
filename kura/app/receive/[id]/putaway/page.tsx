'use client'
// SC-101 入庫の棚入れ：棚番を指定する。同じ商品が置いてある棚を推奨する（FR-306）
// 棚に入れるのも「棚間移動」の取引として記録される
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { getPutawayLines, listWarehouseLocations, putaway } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { fmtQty } from '@/lib/utils/format'
import { PageTitle } from '@/components/layout/PageTitle'
import { SkeletonBlock } from '@/components/domain/Skeleton'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

export default function PutawayPage() {
  const params = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const ids = useMemo(() => (params.get('txns') ?? '').split(',').filter(Boolean), [params])
  const lines = useRepo(() => getPutawayLines(ids), [ids.join(',')])
  const wh = lines.data?.[0]?.warehouseId
  const locs = useRepo(
    () => (wh ? listWarehouseLocations(wh) : Promise.resolve({ ok: true as const, data: [] })),
    [wh],
  )
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!lines.data) return
    setChoice((c) =>
      Object.fromEntries(lines.data!.map((l) => [l.txnId, c[l.txnId] ?? l.suggestedLocationId ?? ''])),
    )
  }, [lines.data])

  const missing = (lines.data ?? []).filter((l) => !choice[l.txnId])

  return (
    <>
      <PageTitle
        title="棚入れ"
        lead="入庫した商品を、どの棚に置くかを決めます。同じ商品がすでに置いてある棚を候補にしています。"
      />
      {!lines.data ? (
        <SkeletonBlock className="h-[300px] w-full rounded" />
      ) : lines.data.length === 0 ? (
        <div className="rounded border border-line bg-panel p-6">
          <p className="text-body text-ink-600">棚入れする入庫が見つかりません。</p>
          <Button asChild variant="primary" className="mt-4">
            <Link href="/receive">入庫へ戻る</Link>
          </Button>
        </div>
      ) : (
        <section className="rounded border border-line bg-panel">
          <ul className="divide-y divide-line">
            {lines.data.map((l) => (
              <li key={l.txnId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="num text-[13px] text-ink-600">
                    {l.sku}
                    {l.lotNo && <span className="ml-2">ロット {l.lotNo}</span>}
                  </p>
                  <p className="truncate text-body">{l.name}</p>
                </div>
                <span className="num text-qty">
                  {fmtQty(l.qty)}
                  <span className="ml-0.5 font-sans text-[10px] font-normal text-ink-500">{l.unit}</span>
                </span>
                <label className="flex items-center gap-2">
                  <span className="text-label text-ink-600">棚番</span>
                  <select
                    value={choice[l.txnId] ?? ''}
                    onChange={(e) => setChoice((c) => ({ ...c, [l.txnId]: e.target.value }))}
                    className="num h-10 w-32 rounded border border-line-hi bg-panel px-2 text-[16px]"
                  >
                    <option value="">選ぶ</option>
                    {(locs.data ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code}
                        {o.id === l.suggestedLocationId ? '（推奨）' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <p className="text-[12px] text-ink-600">
              {missing.length
                ? `棚番が決まっていない行が ${missing.length} 件あります`
                : 'すべての行に棚番が決まっています'}
            </p>
            <div className="flex gap-2">
              <Button onClick={() => router.push('/receive')}>あとで棚入れする</Button>
              <Button
                variant="primary"
                disabled={busy || missing.length > 0}
                onClick={async () => {
                  setBusy(true)
                  const r = await putaway(
                    lines.data!.map((l) => ({ txnId: l.txnId, locationId: choice[l.txnId]! })),
                  )
                  setBusy(false)
                  if (!r.ok) return toast.show({ message: r.error, tone: 'error' })
                  toast.show({
                    message: r.data ? `${r.data} 件を棚に入れました` : '推奨どおりの棚に入っています',
                  })
                  router.push('/receive')
                }}
              >
                <CheckCircle2 aria-hidden />
                棚入れを確定
              </Button>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
