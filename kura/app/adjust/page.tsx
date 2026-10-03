'use client'
// SC-120 在庫調整：増減に理由コードを必ず付ける（FR-314）。期限切れ廃棄もここで登録する（FR-511）
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Camera, Minus, Plus, X } from 'lucide-react'
import {
  adjustStock,
  getMasters,
  getSession,
  listLots,
  reverseTransaction,
  suggestLocation,
} from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { lookup } from '@/lib/scan'
import { fmtDate, fmtQty } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { PageTitle } from '@/components/layout/PageTitle'
import { PermissionGate } from '@/components/demo/PermissionGate'
import { useScanSession } from '@/components/scan/useScanSession'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

const field = 'h-9 w-full rounded border border-line-hi bg-panel px-2.5 text-body'

export default function AdjustPage() {
  const params = useSearchParams()
  const toast = useToast()
  const session = useRepo(getSession)
  const masters = useRepo(getMasters)
  const lots = useRepo(() => listLots({ onlyInStock: true }))
  const { catalog } = useScanSession()
  const [code, setCode] = useState(params.get('sku') ?? 'SKU-1042')
  const [wh, setWh] = useState<string>()
  const [sign, setSign] = useState<1 | -1>(-1)
  const [qty, setQty] = useState(params.get('qty') ?? '')
  const [unit, setUnit] = useState<string>()
  const [reason, setReason] = useState(params.get('reason') ?? '')
  const [lot, setLot] = useState(params.get('lot') ?? '')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<{ name: string; url: string }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const item = useMemo(() => lookup(catalog, code), [catalog, code])
  const whs = (masters.data?.warehouses ?? []).filter((w) => w.visible)
  const whId = wh ?? params.get('wh') ?? whs[0]?.id
  const loc = useRepo(
    () =>
      item && whId
        ? suggestLocation(item.itemId, whId)
        : Promise.resolve({ ok: true as const, data: {} as { id?: string; code?: string } }),
    [item?.itemId, whId],
  )
  const itemLots = (lots.data ?? []).filter((l) => l.itemId === item?.itemId && l.warehouseId === whId)
  const reasons = (masters.data?.reasonCodes ?? []).filter((r) => r.kind === 'adjust')
  const units = item ? [{ name: item.baseUnit, qtyInBase: 1 }, ...item.packUnits] : []
  const u = unit && units.some((x) => x.name === unit) ? unit : item?.baseUnit
  const n = Number(qty.normalize('NFKC'))
  const baseQty = Number.isInteger(n) && n > 0 ? n * (units.find((x) => x.name === u)?.qtyInBase ?? 1) : 0
  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo])
  useEffect(() => {
    if (reason === 'adj-expired') setSign(-1)
  }, [reason])

  const submit = async () => {
    if (!item || !whId) return setError('商品と拠点を選んでください')
    if (!baseQty) return setError('数量は1以上の整数で入力してください')
    if (!reason) return setError('理由を選んでください。原因別に集計して、再発を防ぐために使います')
    if (item.isLotManaged && !lot)
      return setError('ロット管理の商品です。どのロットを調整するか選んでください')
    setError('')
    setBusy(true)
    const r = await adjustStock({
      itemId: item.itemId,
      warehouseId: whId,
      qty: sign * n,
      unit: u!,
      reasonCodeId: reason,
      lotId: lot || undefined,
      locationId: loc.data?.id,
      note: [note, photo ? `写真：${photo.name}` : ''].filter(Boolean).join(' / '),
    })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    const id = r.data.id
    toast.show({
      message: `${item.name} を ${sign > 0 ? '+' : '−'}${fmtQty(baseQty)}${item.baseUnit} 調整しました（${reasons.find((x) => x.id === reason)?.name}）`,
      undo: async () => {
        const back = await reverseTransaction(id, '登録直後の取り消し')
        toast.show(
          back.ok
            ? { message: '調整を取り消しました。元の調整と取消の両方が履歴に残ります' }
            : { message: back.error, tone: 'error' },
        )
      },
    })
    setQty('')
    setNote('')
    setPhoto(undefined)
  }

  return (
    <>
      <PageTitle
        title="在庫調整"
        lead="破損・紛失・期限切れ廃棄などで、帳簿の数を実物に合わせます。理由は必ず選んでください。原因別に集計して、同じことを繰り返さないために使います。"
      />
      <PermissionGate session={session.data} need="adjust.write" title="在庫調整">
        <section className="flex max-w-[720px] flex-col gap-5 rounded border border-line bg-panel p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-600">商品（SKU・JAN をスキャン）</span>
              <input
                className={`${field} num`}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
              />
              <span className="truncate text-[12px] text-ink-600">
                {item ? `${item.name}・棚 ${loc.data?.code ?? '未設定'}` : code ? '見つかりません' : ' '}
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-600">拠点</span>
              <select className={field} value={whId} onChange={(e) => setWh(e.target.value)}>
                {whs.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-label text-ink-600">
              理由 <span className="text-st-ink-stockout">（必須）</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <label
                  key={r.id}
                  className={cn(
                    'has-[:focus-visible]:ring-accent cursor-pointer rounded-sm border px-3 py-1.5 text-[13px] has-[:focus-visible]:ring-2',
                    reason === r.id
                      ? 'border-ink-900 bg-ink-900 text-white'
                      : 'border-line-hi hover:bg-panel-alt',
                  )}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.id}
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                    className="sr-only"
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-end gap-3">
            <div
              role="radiogroup"
              aria-label="増やすか減らすか"
              className="flex rounded border border-line-hi"
            >
              {(
                [
                  [-1, '減らす', Minus],
                  [1, '増やす', Plus],
                ] as const
              ).map(([s, label, Icon]) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={sign === s}
                  disabled={reason === 'adj-expired' && s > 0}
                  onClick={() => setSign(s)}
                  className={cn(
                    'flex h-10 items-center gap-1 px-3 text-[13px] font-bold disabled:opacity-40',
                    sign === s
                      ? s < 0
                        ? 'bg-st-stockout/10 text-st-ink-stockout'
                        : 'bg-st-ok/10 text-st-ink-ok'
                      : 'text-ink-600',
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-600">数量</span>
              <input
                className="num h-10 w-24 rounded border border-line-hi text-center text-[18px]"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-600">単位</span>
              <select
                className="h-10 rounded border border-line-hi bg-panel px-2 text-body"
                value={u}
                onChange={(e) => setUnit(e.target.value)}
              >
                {units.map((x) => (
                  <option key={x.name} value={x.name}>
                    {x.name}
                    {x.qtyInBase > 1 ? `（${x.qtyInBase}${item?.baseUnit}）` : ''}
                  </option>
                ))}
              </select>
            </label>
            {baseQty > 0 && u !== item?.baseUnit && (
              <p className="num mb-2.5 text-[13px] text-ink-600">
                = {fmtQty(baseQty)}
                {item?.baseUnit}
              </p>
            )}
          </div>

          {item?.isLotManaged && (
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-600">ロット</span>
              <select className={`${field} num`} value={lot} onChange={(e) => setLot(e.target.value)}>
                <option value="">選ぶ</option>
                {itemLots.map((l) => (
                  <option key={l.lotId} value={l.lotId}>
                    {l.lotNo}・期限 {l.expiryDate ? fmtDate(l.expiryDate) : 'なし'}・在庫 {fmtQty(l.onHand)}
                    {l.expiryState === 'expired' ? '（期限切れ）' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-600">メモ（任意）</span>
            <input
              className={field}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：棚から落下、箱の角がつぶれた"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <label className="has-[:focus-visible]:ring-accent inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-line-hi px-3 text-[13px] has-[:focus-visible]:ring-2">
              <Camera aria-hidden className="size-4" />
              証跡の写真（任意）
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setPhoto({ name: f.name, url: URL.createObjectURL(f) })
                }}
              />
            </label>
            {photo && (
              <span className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="添付した証跡写真" className="size-12 rounded object-cover" />
                <button
                  aria-label="写真を外す"
                  onClick={() => setPhoto(undefined)}
                  className="rounded p-1 text-ink-600 hover:bg-panel-alt"
                >
                  <X className="size-4" />
                </button>
              </span>
            )}
            <span className="text-[12px] text-ink-600">
              デモでは写真はこの端末の中だけで扱い、ファイル名を記録します
            </span>
          </div>

          {error && (
            <p role="alert" className="text-[13px] text-st-ink-stockout">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            {!session.data?.allWarehouses && (
              <span className="text-[12px] text-ink-600">担当拠点の在庫だけ調整できます</span>
            )}
            <Button variant="primary" disabled={busy} onClick={submit}>
              調整を登録
            </Button>
          </div>
        </section>
      </PermissionGate>
    </>
  )
}
