// 倉庫全体の水位：在庫状態の分布を1本の帯で見せる
// ★ 色は在庫状態のためだけに使う。適正は無彩色（通常状態に色を持たせない）
import { cn } from '@/lib/utils/cn'
import { fmtQty } from '@/lib/utils/format'

type Counts = { stockout: number; below_reorder: number; normal: number; excess: number }

const SEG = [
  { key: 'stockout', label: '欠品', bar: 'bg-st-stockout', ink: 'text-st-ink-stockout' },
  { key: 'below_reorder', label: '発注点以下', bar: 'bg-st-low', ink: 'text-st-ink-low' },
  { key: 'normal', label: '適正', bar: 'bg-[#c3cacf]', ink: 'text-ink-600' },
  { key: 'excess', label: '過剰', bar: 'bg-st-excess', ink: 'text-st-ink-excess' },
] as const

export function StatusStrip({ counts, total, idle }: { counts: Counts; total: number; idle?: number }) {
  const label = SEG.map((s) => `${s.label}${counts[s.key]}`).join('、')
  return (
    <div>
      <div role="img" aria-label={`在庫状態の分布：${label}`} className="flex h-3 w-full gap-[2px]">
        {SEG.map((s) =>
          counts[s.key] > 0 ? (
            <span
              key={s.key}
              className={cn('h-full transition-[flex-grow] duration-400', s.bar)}
              style={{ flexGrow: counts[s.key] }}
            />
          ) : null,
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap">
        {SEG.map((s) => (
          <div key={s.key} className="flex items-baseline gap-2">
            <dt className={cn('text-label', s.ink)}>{s.label}</dt>
            <dd className="num text-[18px] leading-6 text-ink-900">
              {fmtQty(counts[s.key])}
              <span className="ml-1 font-sans text-[11px] font-normal text-ink-500">
                {total > 0 ? `${Math.round((counts[s.key] / total) * 100)}%` : ''}
              </span>
            </dd>
          </div>
        ))}
        {idle !== undefined && (
          <div className="col-span-2 flex items-baseline gap-2 sm:ml-auto">
            <dt className="text-label text-st-ink-idle">うち滞留（90日出庫なし）</dt>
            <dd className="num text-[18px] leading-6 text-ink-900">{fmtQty(idle)}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}
