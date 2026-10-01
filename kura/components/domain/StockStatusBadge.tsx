// 在庫状態バッジ（5状態）。★ 色だけで伝えない：必ずテキストを併記する（A11Y-04）
// ★ 適正（通常状態）には色を持たせない。色がつくのは対応が必要な行だけ
import { cn } from '@/lib/utils/cn'

export type BadgeState = 'stockout' | 'below_reorder' | 'normal' | 'excess' | 'idle'

const STYLE: Record<BadgeState, { label: string; cls: string; mark: string }> = {
  stockout: { label: '欠品', cls: 'text-st-ink-stockout bg-st-stockout/10', mark: 'bg-st-stockout' },
  below_reorder: { label: '発注点以下', cls: 'text-st-ink-low bg-st-low/15', mark: 'bg-st-low' },
  normal: {
    label: '適正',
    cls: 'text-ink-600 bg-transparent',
    mark: 'bg-transparent ring-1 ring-inset ring-ink-400',
  },
  excess: { label: '過剰', cls: 'text-st-ink-excess bg-st-excess/10', mark: 'bg-st-excess' },
  idle: { label: '滞留', cls: 'text-st-ink-idle bg-st-idle/15', mark: 'bg-st-idle' },
}

export function StockStatusBadge({ state, className }: { state: BadgeState; className?: string }) {
  const s = STYLE[state]
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-[11px] font-bold leading-none',
        s.cls,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 shrink-0', s.mark)} />
      {s.label}
    </span>
  )
}
