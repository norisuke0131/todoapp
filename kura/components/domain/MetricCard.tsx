// メトリクスカード：ラベル／主数値／前期比。★ 装飾グラフを載せない
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { fmtQty, fmtYen } from '@/lib/utils/format'

type Tone = 'stockout' | 'low' | 'neutral'

const TONE: Record<Tone, string> = {
  stockout: 'before:bg-st-stockout',
  low: 'before:bg-st-low',
  neutral: 'before:bg-transparent',
}

type Props = {
  label: string
  value: number
  unit?: string
  money?: boolean
  /** 対応が必要なときだけ左端に色の帯を出す（値が 0 なら出さない） */
  tone?: Tone
  delta?: { value: number; label: string }
  hint?: string
  href?: string
}

export function MetricCard({ label, value, unit, money, tone = 'neutral', delta, hint, href }: Props) {
  const active = value > 0 ? tone : 'neutral'
  const text = money ? fmtYen(value) : fmtQty(value)
  const body = (
    <>
      <span className="text-label text-ink-600">{label}</span>
      <span className="mt-2 flex items-baseline gap-1">
        <span
          className={cn(
            'num text-ink-900',
            text.length > 9 ? 'text-[22px] leading-8 sm:text-qty-lg' : 'text-qty-lg',
          )}
        >
          {text}
        </span>
        {unit && <span className="text-[12px] text-ink-500">{unit}</span>}
      </span>
      {(delta || hint) && (
        <span className="mt-1 text-[12px] leading-5 text-ink-500">
          {delta && (
            <span className="num mr-1.5 text-ink-600">
              {delta.value > 0 ? '+' : delta.value < 0 ? '−' : '±'}
              {fmtQty(Math.abs(delta.value))}
            </span>
          )}
          {delta?.label ?? hint}
        </span>
      )}
    </>
  )
  const cls = cn(
    'relative flex min-w-0 flex-col rounded border border-line bg-panel px-4 py-3.5',
    "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
    TONE[active],
  )
  return href ? (
    <Link href={href} className={cn(cls, 'transition-colors duration-80 hover:border-line-hi')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
