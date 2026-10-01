// ★ 4つの在庫数ブロック（8章）
// 実在庫 − 引当済 = 有効在庫 ／ 入荷予定。有効在庫だけを大きく見せる
import { cn } from '@/lib/utils/cn'
import { fmtQty } from '@/lib/utils/format'

type Props = {
  onHand: number
  allocated: number
  incoming: number
  inTransit?: number
  unit?: string
  className?: string
}

export function FourNumbers({ onHand, allocated, incoming, inTransit = 0, unit = '', className }: Props) {
  const available = onHand - allocated
  return (
    <div className={cn('flex flex-wrap items-end gap-x-3 gap-y-3', className)}>
      <div className="flex items-end gap-x-3">
        <Figure label="実在庫" value={onHand} unit={unit} />
        <Op>−</Op>
        <Figure label="引当済" value={allocated} unit={unit} hatch />
        <Op>=</Op>
        <Figure label="有効在庫" value={available} unit={unit} big negative={available < 0} />
      </div>
      <div className="flex items-end gap-x-3 border-l border-line pl-3 sm:ml-1">
        <Figure
          label="入荷予定"
          value={incoming}
          unit={unit}
          sign
          note={inTransit > 0 ? `うち移動中 ${fmtQty(inTransit)}` : undefined}
        />
      </div>
    </div>
  )
}

function Op({ children }: { children: string }) {
  return (
    <span aria-hidden className="num pb-[3px] text-[18px] leading-6 text-ink-400">
      {children}
    </span>
  )
}

function Figure({
  label,
  value,
  unit,
  big,
  hatch,
  sign,
  negative,
  note,
}: {
  label: string
  value: number
  unit: string
  big?: boolean
  hatch?: boolean
  sign?: boolean
  negative?: boolean
  note?: string
}) {
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-1.5 text-label text-ink-600">
        {hatch && <span aria-hidden className="hatch-allocated-lg inline-block size-2.5" />}
        {label}
      </span>
      <span
        className={cn(
          'num whitespace-nowrap text-ink-900',
          big ? 'text-qty-lg' : 'text-[20px] leading-7',
          negative && 'text-st-ink-stockout',
        )}
      >
        {sign && value > 0 ? '+' : ''}
        {fmtQty(value)}
        <span className="ml-0.5 font-sans text-[11px] font-normal text-ink-500">{unit}</span>
      </span>
      {note && <span className="text-[11px] leading-4 text-ink-500">{note}</span>}
    </div>
  )
}
