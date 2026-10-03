'use client'
// 在庫状態での絞り込み（FR-204）：欠品／発注点以下／適正／過剰／滞留／期限間近
// 件数つきのトグル。押すと「在庫状態」の条件に足し引きする
import { cn } from '@/lib/utils/cn'
import { STOCK_STATE_LABEL, type StockState } from '@/lib/query/stock-fields'
import { fmtQty } from '@/lib/utils/format'

const DOT: Record<StockState, string> = {
  stockout: 'bg-st-stockout',
  below_reorder: 'bg-st-low',
  normal: 'ring-1 ring-inset ring-ink-400',
  excess: 'bg-st-excess',
  idle: 'bg-st-idle',
  expiring: 'bg-exp-near',
}

export function StateFilter({
  selected,
  counts,
  onChange,
}: {
  selected: StockState[]
  counts: Record<StockState, number>
  onChange: (next: StockState[]) => void
}) {
  return (
    <div role="group" aria-label="在庫状態で絞り込む" className="flex flex-wrap gap-1.5">
      {(Object.keys(STOCK_STATE_LABEL) as StockState[]).map((s) => {
        const on = selected.includes(s)
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== s) : [...selected, s])}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-sm border px-2.5 text-[12px] font-bold transition-colors duration-80',
              on
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-line-hi bg-panel text-ink-600 hover:border-ink-400 hover:text-ink-900',
            )}
          >
            <span aria-hidden className={cn('size-1.5', DOT[s])} />
            {STOCK_STATE_LABEL[s]}
            <span className={cn('num text-[12px]', on ? 'text-white/80' : 'text-ink-500')}>
              {fmtQty(counts[s] ?? 0)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
