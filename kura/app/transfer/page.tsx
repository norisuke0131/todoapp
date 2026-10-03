'use client'
// SC-110 在庫移動：拠点間（出荷で減り「移動中」へ → 入荷処理で到着先に入る）と、棚間（その場で付け替え）
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, Truck } from 'lucide-react'
import {
  createTransfer,
  getSession,
  listTransfers,
  listWarehouseLocations,
  moveBetweenLocations,
  suggestLocation,
} from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { lookup } from '@/lib/scan'
import { fmtDate, fmtQty } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { PageTitle } from '@/components/layout/PageTitle'
import { useScanSession } from '@/components/scan/useScanSession'
import { ScanInput } from '@/components/scan/ScanInput'
import { ScanLineList } from '@/components/scan/ScanLineList'
import { SkeletonBlock } from '@/components/domain/Skeleton'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

const field = 'h-9 w-full rounded border border-line-hi bg-panel px-2.5 text-body'

export default function TransferPage() {
  const [tab, setTab] = useState<'warehouse' | 'location'>('warehouse')
  return (
    <>
      <PageTitle
        title="在庫移動"
        lead="拠点間の移動は、出荷した時点で出荷元から減り「移動中」になります。到着先で入荷処理をするまで、どちらの棚にもありません。"
      />
      <div role="tablist" aria-label="移動の種類" className="mb-4 flex gap-1">
        {(
          [
            ['warehouse', '拠点間の移動'],
            ['location', '棚間の移動'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'h-8 rounded-sm px-3 text-[12px] font-bold',
              tab === k ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-panel',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'warehouse' ? <WarehouseTransfer /> : <LocationMove />}
    </>
  )
}

function WarehouseTransfer() {
  const toast = useToast()
  const session = useRepo(getSession)
  const transfers = useRepo(listTransfers)
  const scan = useScanSession()
  const whs = session.data?.warehouses ?? []
  const own = whs.filter((w) => w.visible)
  const [from, setFrom] = useState<string>()
  const fromId = from ?? own[0]?.id
  const toId = whs.find((w) => w.id !== fromId)?.id
  const [busy, setBusy] = useState(false)
  const name = (id?: string) => whs.find((w) => w.id === id)?.name ?? ''
  const inTransit = (transfers.data ?? []).filter((t) => t.status === 'in_transit')

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section
        aria-labelledby="tr-new"
        className="flex min-w-0 flex-col gap-4 rounded border border-line bg-panel p-5"
      >
        <h2 id="tr-new" className="text-section">
          移動を起票する
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-600">出荷元</span>
            <select className={field} value={fromId} onChange={(e) => setFrom(e.target.value)}>
              {own.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <ArrowRight aria-hidden className="mb-2.5 size-4 text-ink-500" />
          <p className="flex h-9 items-center rounded bg-panel-alt px-3 text-body">到着先：{name(toId)}</p>
          {!session.data?.allWarehouses && (
            <p className="mb-2 text-[12px] text-ink-600">現場担当は、担当拠点から出す移動だけ起票できます</p>
          )}
        </div>
        <ScanInput onScan={scan.onScan} label="移す商品をスキャン" sticky={false} />
        <ScanLineList
          lines={scan.state.lines}
          lastSeq={scan.state.seq}
          onQty={scan.setQty}
          onRemove={scan.remove}
          empty="移す商品をスキャンするか、SKU を打って Enter"
        />
        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={busy || scan.state.lines.length === 0 || !fromId || !toId}
            onClick={async () => {
              setBusy(true)
              const r = await createTransfer({
                fromWarehouseId: fromId!,
                toWarehouseId: toId!,
                lines: scan.state.lines.map((l) => ({ itemId: l.itemId, qtyBase: l.qty })),
              })
              setBusy(false)
              if (!r.ok) return toast.show({ message: r.error, tone: 'error' })
              toast.show({
                message: `${r.data.code} を出荷しました。${name(fromId)}から減り、移動中になりました`,
              })
              scan.reset()
            }}
          >
            <Truck aria-hidden />
            出荷して「移動中」にする
          </Button>
        </div>
      </section>

      <section aria-labelledby="tr-transit" className="min-w-0 rounded border border-line bg-panel">
        <h2 id="tr-transit" className="border-b border-line px-5 py-3 text-section">
          移動中の在庫
          <span className="num ml-2 text-[13px] font-normal text-ink-500">{inTransit.length}</span>
        </h2>
        {!transfers.data ? (
          <SkeletonBlock className="m-5 h-40" />
        ) : inTransit.length === 0 ? (
          <p className="px-5 py-6 text-body text-ink-600">移動中の在庫はありません。</p>
        ) : (
          <ul className="divide-y divide-line">
            {inTransit.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="num text-[13px]">{t.code}</p>
                  <p className="text-[12px] text-ink-600">
                    {name(t.fromWarehouseId)} → {name(t.toWarehouseId)}・{t.lines.length}品目・
                    {fmtQty(t.lines.reduce((a, l) => a + l.qtyBase, 0))}点・出荷 {fmtDate(t.shippedAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    'num rounded-sm px-1.5 text-[12px] font-bold',
                    (t.daysInTransit ?? 0) >= 3 ? 'bg-st-low/15 text-st-ink-low' : 'text-ink-600',
                  )}
                >
                  {t.daysInTransit} 日目
                </span>
                <Button asChild size="sm">
                  <Link href={`/transfer/${t.id}/receive`}>入荷処理</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function LocationMove() {
  const toast = useToast()
  const session = useRepo(getSession)
  const scan = useScanSession()
  const [code, setCode] = useState('SKU-1042')
  const [wh, setWh] = useState<string>()
  const whId = wh ?? session.data?.warehouses.find((w) => w.visible)?.id
  const item = useMemo(() => lookup(scan.catalog, code), [scan.catalog, code])
  const locs = useRepo(
    () => (whId ? listWarehouseLocations(whId) : Promise.resolve({ ok: true as const, data: [] })),
    [whId],
  )
  const current = useRepo(
    () =>
      item && whId
        ? suggestLocation(item.itemId, whId)
        : Promise.resolve({ ok: true as const, data: {} as { id?: string; code?: string } }),
    [item?.itemId, whId],
  )
  const [to, setTo] = useState('')
  const [qty, setQty] = useState('')
  const [error, setError] = useState('')
  return (
    <section className="flex max-w-[640px] flex-col gap-4 rounded border border-line bg-panel p-5">
      <h2 className="text-section">棚間の移動</h2>
      <p className="text-[12px] text-ink-600">
        同じ拠点の中で棚を変えます。移動中の状態は持たず、その場で付け替わります（棚Aから −、棚Bへ +）。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-600">商品（SKU・JAN）</span>
          <input className={`${field} num`} value={code} onChange={(e) => setCode(e.target.value)} />
          <span className="text-[12px] text-ink-600">{item?.name ?? (code ? '見つかりません' : ' ')}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-600">拠点</span>
          <select className={field} value={whId} onChange={(e) => setWh(e.target.value)}>
            {(session.data?.warehouses ?? [])
              .filter((w) => w.visible)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-label text-ink-600">いまの棚</span>
          <p className="num flex h-9 items-center rounded bg-panel-alt px-3 text-[16px]">
            {current.data?.code ?? '未設定'}
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-600">移動先の棚</span>
          <select className={`${field} num`} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">選ぶ</option>
            {(locs.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-600">数量</span>
          <input
            className={`${field} num text-qty`}
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-st-ink-stockout">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        className="self-end"
        onClick={async () => {
          const n = Number(qty.normalize('NFKC'))
          if (!item || !whId) return setError('商品と拠点を選んでください')
          if (!current.data?.id)
            return setError('この商品は棚番が決まっていません。入庫の棚入れで決めてください')
          if (!to) return setError('移動先の棚を選んでください')
          if (!Number.isInteger(n) || n <= 0) return setError('数量は1以上の整数で入力してください')
          setError('')
          const r = await moveBetweenLocations({
            itemId: item.itemId,
            warehouseId: whId,
            fromLocationId: current.data.id,
            toLocationId: to,
            qtyBase: n,
          })
          if (!r.ok) return setError(r.error)
          toast.show({ message: `${item.name} を ${n}${item.baseUnit} 移しました` })
          setQty('')
        }}
      >
        棚を移す
      </Button>
    </section>
  )
}
