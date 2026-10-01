// 期限バッジ：「期限切れ」「あと3日」。閾値外は日付だけを無彩色で
import { cn } from '@/lib/utils/cn'
import { fmtDate } from '@/lib/utils/format'

export function ExpiryBadge({
  expiryDate,
  daysLeft,
  alertDays,
}: {
  expiryDate: string
  daysLeft: number
  alertDays: number
}) {
  if (daysLeft < 0)
    return (
      <Pill className="bg-exp-expired/10 text-st-ink-stockout" mark="bg-exp-expired">
        期限切れ
      </Pill>
    )
  if (daysLeft <= alertDays)
    return (
      <Pill className="bg-exp-near/15 text-st-ink-low" mark="bg-exp-near">
        {daysLeft === 0 ? '本日まで' : `あと${daysLeft}日`}
      </Pill>
    )
  return <span className="num text-[12px] text-ink-600">{fmtDate(expiryDate)}</span>
}

function Pill({ children, className, mark }: { children: string; className: string; mark: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-[11px] font-bold leading-none',
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5', mark)} />
      {children}
    </span>
  )
}
