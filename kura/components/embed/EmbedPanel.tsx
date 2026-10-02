'use client'
// SC-900 記事に埋め込む在庫水位パネル（FR-715）
// ★ 見せるのは「4つの在庫数が別々に動くこと」だけ。カメラは呼ばず（EMB-04）、アプリ内の遷移もしない（EMB-05）
import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { embedAct, getEmbedState, resetDemo, type EmbedAction, type EmbedState } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { fmtQty } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { FourNumbers } from '@/components/gauge/FourNumbers'
import { GaugePanel } from '@/components/gauge/GaugePanel'
import { StockStatusBadge } from '@/components/domain/StockStatusBadge'
import { Logo } from '@/components/layout/Logo'
import { SkeletonBlock } from '@/components/domain/Skeleton'

const ACTIONS: { id: EmbedAction; label: string; hint: string }[] = [
  { id: 'receive', label: '入庫 +10', hint: '棚に10本入る' },
  { id: 'ship', label: '出庫 −10', hint: '棚から10本出す' },
  { id: 'allocate', label: '引当 +10', hint: '注文分の10本を確保' },
]

type Change = { action: EmbedAction; before: EmbedState; after: EmbedState }

function explain({ action, before: b, after: a }: Change): string {
  const n = (v: number) => fmtQty(v)
  if (action === 'allocate')
    return `実在庫は ${n(a.onHand)} のまま。有効在庫だけが ${n(b.available)} → ${n(a.available)} に減りました。棚にはあるのに、もう売れない在庫です。`
  if (action === 'ship')
    return `実在庫が ${n(b.onHand)} → ${n(a.onHand)} に減り、有効在庫も ${n(b.available)} → ${n(a.available)} に。引当済の ${n(a.allocated)} は変わりません。`
  return `実在庫が ${n(b.onHand)} → ${n(a.onHand)} に、有効在庫も ${n(b.available)} → ${n(a.available)} に増えました。入荷予定の ${n(a.incoming)} はそのままです。`
}

export function EmbedPanel() {
  const state = useRepo(getEmbedState)
  const [change, setChange] = useState<Change>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const s = state.data

  const act = async (action: EmbedAction) => {
    if (!s) return
    setBusy(true)
    const r = await embedAct(action)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError('')
    setChange({ action, before: s, after: r.data })
  }

  const diff = change && {
    onHand: change.after.onHand - change.before.onHand,
    allocated: change.after.allocated - change.before.allocated,
    available: change.after.available - change.before.available,
    incoming: change.after.incoming - change.before.incoming,
  }

  return (
    <main className="min-h-dvh bg-panel p-4 sm:p-5">
      <div className="mx-auto flex max-w-[760px] flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-600">
              <span className="num text-[13px] text-ink-900">{s?.sku ?? 'SKU-1042'}</span>
              <span>{s?.warehouseName ?? '東京倉庫'}</span>
              {s && <StockStatusBadge state={s.status} />}
            </p>
            <h1 className="mt-0.5 text-section">{s?.name ?? ' '}</h1>
          </div>
          <a
            href="/"
            target="_blank"
            rel="noopener"
            className="flex h-8 shrink-0 items-center gap-1 rounded bg-ink-900 px-3 text-[12px] font-bold text-white hover:bg-ink-600"
          >
            全画面で試す
            <ArrowUpRight aria-hidden className="size-3.5" />
            <span className="sr-only">（新しいタブで開きます）</span>
          </a>
        </header>

        {s ? (
          <>
            <FourNumbers
              onHand={s.onHand}
              allocated={s.allocated}
              incoming={s.incoming}
              unit={s.unit}
              changed={diff}
            />
            <GaugePanel
              onHand={s.onHand}
              allocated={s.allocated}
              incoming={s.incoming}
              reorderPoint={s.reorderPoint}
              safetyStock={s.safetyStock}
              excessLine={s.excessLine}
              unit={s.unit}
            />
          </>
        ) : (
          <SkeletonBlock className="h-[176px] w-full" />
        )}

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div role="group" aria-label="在庫を動かす" className="grid grid-cols-3 gap-2">
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={!s || busy}
                onClick={() => act(a.id)}
                className={cn(
                  'flex h-14 flex-col items-center justify-center rounded border text-center transition-colors duration-80 disabled:opacity-60',
                  a.id === 'allocate'
                    ? 'border-primary bg-primary text-white hover:bg-primary-d'
                    : 'border-line-hi bg-panel text-ink-900 hover:border-ink-400',
                )}
              >
                <span className="num text-[16px] leading-5">{a.label}</span>
                <span
                  className={cn(
                    'text-[11px] leading-4',
                    a.id === 'allocate' ? 'text-white/85' : 'text-ink-600',
                  )}
                >
                  {a.hint}
                </span>
              </button>
            ))}
          </div>
          <p
            aria-live="polite"
            className={cn('min-h-10 text-body leading-5', error ? 'text-st-ink-stockout' : 'text-ink-900')}
          >
            {error ||
              (change
                ? explain(change)
                : 'ボタンを押すと、4つの数字のうち「動くものだけ」が動きます。まずは「引当 +10」を押してみてください。')}
          </p>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11px] text-ink-500">
          <span className="flex items-center gap-2">
            <Logo compact />
            デモです。入力した内容は外部に送信されません。
          </span>
          <button
            type="button"
            onClick={async () => {
              await resetDemo()
              setChange(undefined)
              setError('')
            }}
            className="font-bold text-primary-d hover:underline"
          >
            最初の数字に戻す
          </button>
        </footer>
      </div>
    </main>
  )
}
