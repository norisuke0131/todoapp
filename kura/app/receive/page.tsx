'use client'
// SC-100 入庫（検品）：発注書を選び、連続スキャンで数を積み上げ、予定数との差・ロット・期限を確かめて確定（FR-301〜FR-306）
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ClipboardList } from 'lucide-react'
import { getSession, listOpenPurchaseOrders, receive, type OpenPurchaseOrder } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { unitFactor } from '@/lib/inventory/unit'
import { nowIso } from '@/lib/utils/clock'
import { fmtDate, fmtQty, fmtSigned } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { PageTitle } from '@/components/layout/PageTitle'
import { ScanInput } from '@/components/scan/ScanInput'
import { ScanLineList } from '@/components/scan/ScanLineList'
import { UnknownCodes } from '@/components/scan/UnknownCodes'
import { CameraScanner } from '@/components/scan/CameraScanner'
import { QuickRegisterDialog } from '@/components/scan/QuickRegisterDialog'
import { useScanSession } from '@/components/scan/useScanSession'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

type LineMeta = { unit?: string; lotNo?: string; expiryDate?: string }

export default function ReceivePage() {
  const router = useRouter()
  const toast = useToast()
  const session = useRepo(getSession)
  const pos = useRepo(listOpenPurchaseOrders)
  const scan = useScanSession()
  const [poId, setPoId] = useState<string>()
  const [wh, setWh] = useState<string>()
  const [meta, setMeta] = useState<Record<string, LineMeta>>({})
  const [registering, setRegistering] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const s = session.data
  const warehouseId = wh ?? (s?.allWarehouses ? 'wh-tokyo' : s?.warehouses.find((w) => w.visible)?.id)
  const visiblePos = (pos.data ?? []).filter((p) => p.warehouseId === warehouseId)
  const po: OpenPurchaseOrder | undefined = visiblePos.find((p) => p.id === poId)
  const poLine = (itemId: string) => po?.lines.find((l) => l.itemId === itemId)

  const unitOf = (itemId: string) => meta[itemId]?.unit
  const baseQty = (itemId: string, qty: number) => {
    const line = scan.state.lines.find((l) => l.itemId === itemId)
    const u = unitOf(itemId)
    return line && u ? qty * (unitFactor(line, u) ?? 1) : qty
  }
  const setLineMeta = (itemId: string, patch: LineMeta) =>
    setMeta((m) => ({ ...m, [itemId]: { ...m[itemId], ...patch } }))

  // 予定数をまとめて入れる（スキャナのない読者でも試せるように）
  const fillFromPo = (lines = po?.lines ?? []) => {
    for (const l of lines) {
      if (l.remaining <= 0) continue
      const pack = l.packUnits[0]
      const useCase = pack && l.remaining % pack.qtyInBase === 0
      scan.onScan(`${useCase ? l.remaining / pack.qtyInBase : l.remaining}*${l.sku}`)
      if (useCase) setLineMeta(l.itemId, { unit: pack.name })
      if (l.isLotManaged) setLineMeta(l.itemId, defaultLot(l.shelfLifeDays))
    }
  }

  const missingLot = scan.state.lines.filter(
    (l) => l.isLotManaged && (!meta[l.itemId]?.lotNo || !meta[l.itemId]?.expiryDate),
  )
  const notInPo = po ? scan.state.lines.filter((l) => !poLine(l.itemId)) : []

  const submit = async () => {
    if (!warehouseId) return
    if (missingLot.length)
      return setError(`${missingLot.map((l) => l.name).join('、')} はロット番号と期限の入力が必要です`)
    setBusy(true)
    setError('')
    const r = await receive({
      warehouseId,
      purchaseOrderId: po?.id,
      device: 'scanner',
      lines: scan.state.lines.map((l) => ({
        itemId: l.itemId,
        qty: l.qty,
        unit: unitOf(l.itemId) ?? l.baseUnit,
        lotNo: meta[l.itemId]?.lotNo,
        expiryDate: meta[l.itemId]?.expiryDate,
        locationId: poLine(l.itemId)?.suggestedLocationId,
      })),
    })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    const diff = r.data.differences.length
    toast.show({
      message: `${scan.state.lines.length} 品目を入庫しました${diff ? `（予定数と違う品目 ${diff} 件を記録）` : ''}。続けて棚入れをします`,
    })
    scan.reset()
    setMeta({})
    router.push(`/receive/batch/putaway?txns=${r.data.txns.map((t) => t.id).join(',')}`)
  }

  return (
    <>
      <PageTitle
        title="入庫（検品）"
        lead="届いた商品をスキャンすると、同じ商品は数が積み上がります。予定数との差は、そのまま記録として残ります。"
      />
      <p aria-live="polite" className="sr-only">
        {scan.message}
      </p>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-3">
          {s?.allWarehouses && (
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-600">入荷する拠点</span>
              <select
                value={warehouseId}
                onChange={(e) => {
                  setWh(e.target.value)
                  setPoId(undefined)
                }}
                className="h-9 rounded border border-line-hi bg-panel px-2 text-body"
              >
                {s.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <section aria-labelledby="po-h" className="rounded border border-line bg-panel">
            <h2 id="po-h" className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-section">
              <ClipboardList aria-hidden className="size-4 text-ink-500" />
              入荷予定の発注書
            </h2>
            <ul className="max-h-[420px] overflow-y-auto">
              <li>
                <PoButton
                  active={!po}
                  onClick={() => setPoId(undefined)}
                  title="発注書なしで入庫"
                  sub="返品・サンプルなど"
                />
              </li>
              {visiblePos.map((p) => (
                <li key={p.id}>
                  <PoButton
                    active={p.id === poId}
                    onClick={() => setPoId(p.id)}
                    title={`${p.code}　${p.supplierName}`}
                    sub={`${p.lines.length}品目・予定日 ${p.expectedAt ? fmtDate(p.expectedAt) : '未定'}`}
                    late={p.isDelayed}
                    partial={p.status === 'partial'}
                  />
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <section aria-label="スキャン" className="flex min-w-0 flex-col gap-4">
          <div className="rounded border border-line bg-panel p-4">
            <ScanInput onScan={scan.onScan} label={po ? `${po.code} の商品をスキャン` : '商品をスキャン'} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CameraScanner onScan={scan.onScan} />
              {po && (
                <Button size="sm" onClick={() => fillFromPo()}>
                  予定数をすべて入れる
                </Button>
              )}
              <span className="text-[12px] text-ink-500">
                キー入力でも試せます（例：SKU-1042 と打って Enter）
              </span>
            </div>
          </div>

          <UnknownCodes
            codes={scan.state.unknown}
            canRegister={Boolean(s?.permissions['master.write'].allowed)}
            registerReason={s?.permissions['master.write'].reason}
            onRegister={setRegistering}
            onHold={scan.hold}
            onDrop={scan.drop}
          />

          {po && (
            <section
              aria-label="予定のうち、まだスキャンしていない商品"
              className="rounded border border-line bg-panel"
            >
              <h3 className="border-b border-line px-4 py-2.5 text-label text-ink-600">
                予定のうち、まだスキャンしていない商品
              </h3>
              <ul className="divide-y divide-line">
                {po.lines
                  .filter((l) => l.remaining > 0 && !scan.state.lines.some((x) => x.itemId === l.itemId))
                  .map((l) => (
                    <li key={l.itemId} className="flex items-center gap-3 px-4 py-2">
                      <span className="num w-[76px] shrink-0 text-[13px] text-ink-600">{l.sku}</span>
                      <span className="min-w-0 flex-1 truncate text-body">{l.name}</span>
                      <span className="num text-qty text-ink-600">
                        予定 {fmtQty(l.remaining)}
                        <span className="ml-0.5 font-sans text-[10px] font-normal">{l.baseUnit}</span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => fillFromPo([l])}>
                        予定数を入れる
                      </Button>
                    </li>
                  ))}
                {po.lines.every(
                  (l) => l.remaining <= 0 || scan.state.lines.some((x) => x.itemId === l.itemId),
                ) && (
                  <li className="flex items-center gap-2 px-4 py-3 text-body text-st-ink-normal">
                    <CheckCircle2 aria-hidden className="size-4" />
                    予定の商品はすべてスキャンしました
                  </li>
                )}
              </ul>
            </section>
          )}

          <section aria-label="スキャンした商品" className="rounded border border-line bg-panel">
            <h3 className="border-b border-line px-4 py-2.5 text-label text-ink-600">
              スキャンした商品（{scan.state.lines.length}品目）
            </h3>
            <ScanLineList
              lines={scan.state.lines}
              lastSeq={scan.state.seq}
              onQty={scan.setQty}
              onRemove={scan.remove}
              empty="スキャンするか、予定数を入れると、ここに積み上がります"
              note={(l) => {
                const pl = poLine(l.itemId)
                if (!po) return null
                if (!pl)
                  return (
                    <p className="text-[12px] font-bold text-st-ink-low">
                      この発注書にない商品です。入庫はできますが、確認してください
                    </p>
                  )
                const got = baseQty(l.itemId, l.qty)
                const d = got - pl.remaining
                return (
                  <p className={cn('num text-[12px]', d === 0 ? 'text-st-ink-normal' : 'text-st-ink-low')}>
                    予定 {fmtQty(pl.remaining)}
                    {l.baseUnit} ／ 実数 {fmtQty(got)}
                    {l.baseUnit}
                    {d === 0
                      ? '・一致'
                      : d < 0
                        ? `・${fmtQty(-d)} 少ない（部分入荷として記録）`
                        : `・${fmtSigned(d)} 多い`}
                    {pl.suggestedLocationCode && (
                      <span className="ml-2 text-ink-500">棚入れ先の候補 {pl.suggestedLocationCode}</span>
                    )}
                  </p>
                )
              }}
              extra={(l) => (
                <div className="flex flex-wrap items-end gap-3">
                  {l.packUnits.length > 0 && (
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-ink-600">単位</span>
                      <select
                        value={unitOf(l.itemId) ?? l.baseUnit}
                        onChange={(e) => setLineMeta(l.itemId, { unit: e.target.value })}
                        className="h-8 rounded border border-line-hi bg-panel px-1.5 text-[12px]"
                      >
                        <option value={l.baseUnit}>{l.baseUnit}</option>
                        {l.packUnits.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name}（{p.qtyInBase}
                            {l.baseUnit}）
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {l.isLotManaged && (
                    <>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-ink-600">ロット番号（必須）</span>
                        <input
                          value={meta[l.itemId]?.lotNo ?? ''}
                          onChange={(e) => setLineMeta(l.itemId, { lotNo: e.target.value })}
                          className={cn(
                            'num h-8 w-36 rounded border bg-panel px-2 text-[13px]',
                            !meta[l.itemId]?.lotNo ? 'border-st-low' : 'border-line-hi',
                          )}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-ink-600">期限（必須）</span>
                        <input
                          type="date"
                          value={meta[l.itemId]?.expiryDate ?? ''}
                          onChange={(e) => setLineMeta(l.itemId, { expiryDate: e.target.value })}
                          className={cn(
                            'h-8 rounded border bg-panel px-2 text-[13px]',
                            !meta[l.itemId]?.expiryDate ? 'border-st-low' : 'border-line-hi',
                          )}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
            />
          </section>

          {scan.state.lines.length > 0 && (
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded bg-ink-900 px-4 py-3 text-white shadow-pop">
              <p className="text-body">
                <span className="num text-[18px]">{scan.state.lines.length}</span> 品目・
                <span className="num text-[18px]">
                  {fmtQty(scan.state.lines.reduce((a, l) => a + baseQty(l.itemId, l.qty), 0))}
                </span>{' '}
                点
                {notInPo.length > 0 && (
                  <span className="ml-2 text-[12px] text-st-low">発注にない商品 {notInPo.length} 件</span>
                )}
              </p>
              {error && (
                <p role="alert" className="w-full text-[12px] text-[#ffb4ab] sm:order-last">
                  {error}
                </p>
              )}
              <Button variant="primary" disabled={busy} onClick={submit}>
                {busy ? '登録しています…' : '入庫を確定して棚入れへ'}
              </Button>
            </div>
          )}
        </section>
      </div>

      <QuickRegisterDialog
        code={registering}
        onClose={() => setRegistering(undefined)}
        onDone={(code) => {
          setRegistering(undefined)
          scan.drop(code)
          // 照合表が更新されてから積む
          setTimeout(() => scan.onScan(code), 50)
          toast.show({ message: `${code} を商品として登録しました` })
        }}
      />
    </>
  )
}

function defaultLot(shelfLifeDays = 180): LineMeta {
  const now = nowIso()
  const d = now.slice(2, 10).replace(/-/g, '')
  return {
    lotNo: `L${d}-01`,
    expiryDate: new Date(Date.parse(now) + shelfLifeDays * 86_400_000).toISOString().slice(0, 10),
  }
}

function PoButton({
  active,
  onClick,
  title,
  sub,
  late,
  partial,
}: {
  active: boolean
  onClick: () => void
  title: string
  sub: string
  late?: boolean
  partial?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-start gap-0.5 border-b border-line px-4 py-2.5 text-left transition-colors duration-80 last:border-0',
        active ? 'bg-primary-50 shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-panel-alt',
      )}
    >
      <span className="text-body font-bold">{title}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-600">
        {sub}
        {late && (
          <span className="bg-st-low/15 rounded-sm px-1 text-[11px] font-bold text-st-ink-low">遅延</span>
        )}
        {partial && (
          <span className="rounded-sm border border-line-hi px-1 text-[11px] font-bold text-ink-600">
            一部入荷済
          </span>
        )}
      </span>
    </button>
  )
}
