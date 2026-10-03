'use client'
// SC-102 出庫（ピッキング）：出荷指示を選び、棚番の巡回順に回る（FR-307）。次に行く棚を強調し、スキャンで数を積む
// ロット管理品は FEFO（期限の近い順）を推奨し、外すときは理由を求める（FR-308）
// 有効在庫を超える出庫は止めずに確認を求める（FR-309）
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CheckCircle2, MapPin, Printer, Truck } from 'lucide-react'
import { getPickingList, listShippingOrders, ship, type PickingLine, type ShipWarning } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { lookup } from '@/lib/scan'
import { fmtDate, fmtQty } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { PageTitle } from '@/components/layout/PageTitle'
import { ScanInput } from '@/components/scan/ScanInput'
import { CameraScanner } from '@/components/scan/CameraScanner'
import { useScanSession } from '@/components/scan/useScanSession'
import { ExpiryBadge } from '@/components/domain/ExpiryBadge'
import { SkeletonBlock } from '@/components/domain/Skeleton'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { nowIso } from '@/lib/utils/clock'

const FEFO_REASONS = [
  'お客様からロットの指定がある',
  '期限の近いロットが取り出せない位置にある',
  '期限の近いロットに破損・汚れがある',
]

export default function ShipPage() {
  const toast = useToast()
  const orders = useRepo(() => listShippingOrders())
  const [soId, setSoId] = useState<string>()
  const picking = useRepo(
    () => (soId ? getPickingList(soId) : Promise.resolve({ ok: true as const, data: undefined })),
    [soId],
  )
  const scan = useScanSession()
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [lotChoice, setLotChoice] = useState<Record<string, string>>({})
  const [fefoReason, setFefoReason] = useState<Record<string, string>>({})
  const [askFefo, setAskFefo] = useState<{ itemId: string; recommendedLotId: string }>()
  const [askOver, setAskOver] = useState<ShipWarning[]>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const list = picking.data
  const lines = useMemo(() => list?.lines ?? [], [list])
  const next = lines.find((l) => (picked[l.itemId] ?? 0) < l.qty)
  const done = lines.length > 0 && !next

  const select = (id: string) => {
    setSoId(id)
    setPicked({})
    setLotChoice({})
    setFefoReason({})
    setMessage('')
  }

  const onScan = (raw: string) => {
    const hit = lookup(scan.catalog, raw.replace(/^\d+[*xX×]/, ''))
    const mult = Number(raw.match(/^(\d+)[*xX×]/)?.[1] ?? 1)
    const line = hit && lines.find((l) => l.itemId === hit.itemId)
    if (!line)
      return setMessage(hit ? `${hit.name} はこの出荷指示にありません` : `登録のないバーコードです：${raw}`)
    const n = Math.min(line.qty * 3, (picked[line.itemId] ?? 0) + mult)
    setPicked((p) => ({ ...p, [line.itemId]: n }))
    setMessage(
      n >= line.qty
        ? `${line.name}、${n}${line.baseUnit}。この棚は完了です`
        : `${line.name}、${n} / ${line.qty}${line.baseUnit}`,
    )
  }

  const submit = async (opts: { confirm?: boolean; reasons?: Record<string, string> } = {}) => {
    if (!list) return
    const reasons = { ...fefoReason, ...opts.reasons }
    setBusy(true)
    const r = await ship({
      warehouseId: list.order.warehouseId,
      shippingOrderId: list.order.id,
      device: 'scanner',
      confirmOverAvailable: opts.confirm,
      lines: lines
        .filter((l) => (picked[l.itemId] ?? 0) > 0)
        .map((l) => ({
          itemId: l.itemId,
          qty: picked[l.itemId]!,
          unit: l.baseUnit,
          locationId: l.locationId,
          lotId: lotChoice[l.itemId] || undefined,
          fefoReason: reasons[l.itemId],
        })),
    })
    setBusy(false)
    if (!r.ok) return toast.show({ message: r.error, tone: 'error' })
    if (r.data.status === 'needs_fefo_reason')
      return setAskFefo({ itemId: r.data.itemId, recommendedLotId: r.data.recommendedLotId })
    if (r.data.status === 'needs_confirmation') return setAskOver(r.data.warnings)
    setAskOver(undefined)
    toast.show({ message: `${list.order.code} を出庫しました（${r.data.txns.length} 件の取引）` })
    select('')
    setSoId(undefined)
  }

  const nameOf = (itemId: string) => lines.find((l) => l.itemId === itemId)?.name ?? itemId

  return (
    <>
      <PageTitle
        title="出庫（ピッキング）"
        lead="棚番の巡回順に並んでいます。いちばん上の「次に行く棚」から回ってください。"
      />
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <section aria-labelledby="so-h" className="rounded border border-line bg-panel">
            <h2 id="so-h" className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-section">
              <Truck aria-hidden className="size-4 text-ink-500" />
              出荷指示
            </h2>
            {!orders.data ? (
              <SkeletonBlock className="m-4 h-40" />
            ) : orders.data.length === 0 ? (
              <p className="px-4 py-6 text-body text-ink-600">未出荷の出荷指示はありません。</p>
            ) : (
              <ul className="max-h-[480px] overflow-y-auto">
                {orders.data.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      aria-pressed={o.id === soId}
                      onClick={() => select(o.id)}
                      className={cn(
                        'flex w-full flex-col items-start gap-0.5 border-b border-line px-4 py-2.5 text-left last:border-0',
                        o.id === soId
                          ? 'bg-primary-50 shadow-[inset_3px_0_0_var(--primary)]'
                          : 'hover:bg-panel-alt',
                      )}
                    >
                      <span className="flex w-full items-center gap-2 text-body font-bold">
                        <span className="num">{o.code}</span>
                        <span className="min-w-0 truncate font-normal">{o.customerName}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-600">
                        {o.warehouseName}・{o.lineCount}品目・{fmtQty(o.totalQty)}点・期日{' '}
                        {o.shipBy ? fmtDate(o.shipBy) : '—'}
                        {o.isOverdue && (
                          <span className="bg-st-stockout/10 rounded-sm px-1 text-[11px] font-bold text-st-ink-stockout">
                            期日超過
                          </span>
                        )}
                        {o.status === 'picking' && (
                          <span className="rounded-sm border border-line-hi px-1 text-[11px] font-bold">
                            ピッキング中
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section aria-label="ピッキング" className="flex min-w-0 flex-col gap-4">
          {!soId ? (
            <div className="rounded border border-dashed border-line-hi bg-panel px-6 py-14 text-center text-body text-ink-600">
              左の一覧から出荷指示を選ぶと、棚番の巡回順のリストが出ます。
            </div>
          ) : !list ? (
            <SkeletonBlock className="h-[360px] w-full rounded" />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3 rounded border border-line bg-panel p-4">
                <ScanInput
                  onScan={onScan}
                  label={
                    next
                      ? `次は ${next.locationCode ?? '棚番未設定'} の ${next.sku}`
                      : 'すべての棚を回りました'
                  }
                  className="min-w-[260px] flex-1"
                />
                <Button asChild size="sm">
                  <Link href={`/ship/${list.order.id}/print`}>
                    <Printer aria-hidden />
                    リストを印刷
                  </Link>
                </Button>
              </div>
              <CameraScanner onScan={onScan} />
              <ol aria-label="ピッキングリスト（巡回順）" className="flex flex-col gap-2">
                {lines.map((l) => (
                  <PickRow
                    key={l.itemId}
                    line={l}
                    picked={picked[l.itemId] ?? 0}
                    isNext={next?.itemId === l.itemId}
                    lot={lotChoice[l.itemId]}
                    onPicked={(n) => setPicked((p) => ({ ...p, [l.itemId]: Math.max(0, n) }))}
                    onLot={(lot) => setLotChoice((c) => ({ ...c, [l.itemId]: lot }))}
                  />
                ))}
              </ol>
              <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded bg-ink-900 px-4 py-3 text-white shadow-pop">
                <p className="flex items-center gap-2 text-body">
                  {done && <CheckCircle2 aria-hidden className="size-4 text-[#7fd1a8]" />}
                  <span className="num text-[18px]">
                    {lines.filter((l) => (picked[l.itemId] ?? 0) >= l.qty).length}
                  </span>{' '}
                  / {lines.length} 棚
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setPicked(Object.fromEntries(lines.map((l) => [l.itemId, l.qty])))}
                  >
                    指示数どおりに入れる
                  </Button>
                  <Button
                    variant="primary"
                    disabled={busy || !lines.some((l) => (picked[l.itemId] ?? 0) > 0)}
                    onClick={() => submit()}
                  >
                    {busy ? '登録しています…' : done ? '出庫を確定' : '取れた分だけ出庫'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <Dialog open={Boolean(askOver)} onOpenChange={(o) => !o && setAskOver(undefined)}>
        <DialogContent>
          <DialogTitle>有効在庫を超える出庫です</DialogTitle>
          <DialogDescription>
            続行すると在庫がマイナスになります。記録は残るので、あとで棚卸か在庫調整で辻褄を合わせられます。
          </DialogDescription>
          <ul className="mt-3 flex flex-col gap-1 text-body">
            {askOver?.map((w) => (
              <li key={w.itemId} className="flex justify-between gap-3">
                <span className="truncate">{nameOf(w.itemId)}</span>
                <span className="num shrink-0 text-st-ink-stockout">
                  使える {fmtQty(w.available)} ／ 出庫 {fmtQty(w.requested)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button>やめる</Button>
            </DialogClose>
            <Button variant="danger" disabled={busy} onClick={() => submit({ confirm: true })}>
              続行して出庫する
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FefoReasonDialog
        ask={askFefo}
        recommendedLotNo={
          askFefo
            ? lines
                .find((l) => l.itemId === askFefo.itemId)
                ?.lots.find((x) => x.lotId === askFefo.recommendedLotId)?.lotNo
            : undefined
        }
        itemName={askFefo ? nameOf(askFefo.itemId) : ''}
        onClose={() => setAskFefo(undefined)}
        onSubmit={(reason) => {
          if (!askFefo) return
          setFefoReason((r) => ({ ...r, [askFefo.itemId]: reason }))
          setAskFefo(undefined)
          void submit({ confirm: Boolean(askOver), reasons: { [askFefo.itemId]: reason } })
        }}
      />
    </>
  )
}

function PickRow({
  line: l,
  picked,
  isNext,
  lot,
  onPicked,
  onLot,
}: {
  line: PickingLine
  picked: number
  isNext: boolean
  lot?: string
  onPicked: (n: number) => void
  onLot: (lot: string) => void
}) {
  const complete = picked >= l.qty
  const today = nowIso().slice(0, 10)
  return (
    <li
      className={cn(
        'rounded border bg-panel px-4 py-3',
        isNext ? 'border-primary shadow-[inset_4px_0_0_var(--primary)]' : 'border-line',
        complete && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex w-[112px] shrink-0 items-center gap-2">
          <MapPin aria-hidden className={cn('size-4', isNext ? 'text-primary' : 'text-ink-400')} />
          <span className="num text-[24px] leading-7 text-ink-900">{l.locationCode ?? '—'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="num text-[13px] text-ink-600">
            {l.sku}
            {isNext && (
              <span className="ml-2 rounded-sm bg-primary px-1.5 py-0.5 font-sans text-[11px] font-bold text-white">
                次に行く棚
              </span>
            )}
            {complete && (
              <span className="ml-2 font-sans text-[11px] font-bold text-st-ink-normal">完了</span>
            )}
          </p>
          <p className="truncate text-body">{l.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="num text-[13px] text-ink-600">指示 {fmtQty(l.qty)}</span>
          <label className="sr-only" htmlFor={`pick-${l.itemId}`}>
            {l.name}の実数
          </label>
          <input
            id={`pick-${l.itemId}`}
            inputMode="numeric"
            value={picked}
            onChange={(e) => {
              const n = Number(e.target.value.normalize('NFKC'))
              if (Number.isInteger(n)) onPicked(n)
            }}
            onKeyDown={(e) => {
              // テンキーで完結（IX-04）：Enter で次の行の実数へ
              if (e.key !== 'Enter') return
              e.preventDefault()
              const inputs = [...document.querySelectorAll<HTMLInputElement>('input[id^="pick-"]')]
              inputs[inputs.indexOf(e.currentTarget) + 1]?.focus()
            }}
            className={cn(
              'num h-10 w-20 rounded border text-center text-[20px]',
              complete ? 'border-st-normal' : picked > 0 ? 'border-st-low' : 'border-line-hi',
            )}
          />
          <span className="text-[11px] text-ink-500">{l.baseUnit}</span>
        </div>
      </div>
      {l.available < l.qty && (
        <p className="mt-1.5 text-[12px] font-bold text-st-ink-low">
          この受注で使える数は {fmtQty(l.available)} です。足りない分は出庫時に確認を求めます
        </p>
      )}
      {l.isLotManaged && l.lots.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-ink-600">ロット</span>
          <select
            value={lot ?? ''}
            onChange={(e) => onLot(e.target.value)}
            className="h-8 rounded border border-line-hi bg-panel px-1.5 text-[12px]"
          >
            <option value="">期限の近い順に自動で割り当てる（推奨）</option>
            {l.lots.map((x) => (
              <option key={x.lotId} value={x.lotId}>
                {x.lotNo}・期限 {x.expiryDate ?? 'なし'}・在庫 {x.onHand}
                {x.recommended > 0 ? `・推奨 ${x.recommended}` : ''}
              </option>
            ))}
          </select>
          {l.lots
            .filter((x) => x.recommended > 0 && x.expiryDate)
            .slice(0, 1)
            .map((x) => (
              <ExpiryBadge
                key={x.lotId}
                expiryDate={x.expiryDate!}
                daysLeft={Math.floor((Date.parse(x.expiryDate!) - Date.parse(today)) / 86_400_000)}
                alertDays={30}
              />
            ))}
        </div>
      )}
    </li>
  )
}

function FefoReasonDialog({
  ask,
  itemName,
  recommendedLotNo,
  onClose,
  onSubmit,
}: {
  ask?: { itemId: string }
  itemName: string
  recommendedLotNo?: string
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const [reason, setReason] = useState(FEFO_REASONS[0]!)
  const [other, setOther] = useState('')
  return (
    <Dialog open={Boolean(ask)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>期限の近いロットを飛ばす理由</DialogTitle>
        <DialogDescription>
          {itemName} は、期限の近いロット {recommendedLotNo ?? ''}{' '}
          から出すのが推奨です。別のロットを選んだ理由を記録します（期限切れの廃棄を減らすために使います）。
        </DialogDescription>
        <fieldset className="mt-4 flex flex-col gap-2">
          <legend className="sr-only">理由</legend>
          {[...FEFO_REASONS, 'その他'].map((r) => (
            <label key={r} className="flex items-center gap-2 text-body">
              <input
                type="radio"
                name="fefo"
                className="accent-[var(--primary)]"
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              {r}
            </label>
          ))}
          {reason === 'その他' && (
            <input
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="理由を入力"
              className="h-9 rounded border border-line-hi px-2.5 text-body"
            />
          )}
        </fieldset>
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button>ロットを選び直す</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={reason === 'その他' && !other.trim()}
            onClick={() => onSubmit(reason === 'その他' ? other.trim() : reason)}
          >
            理由を記録して出庫
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
