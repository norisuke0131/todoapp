'use client'
// 左サイドバー（232px、折りたたみ 56px）
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SessionInfo } from '@/lib/repo'
import { NAV, type NavItem } from './nav'
import { Logo } from './Logo'

type Props = {
  session?: SessionInfo
  collapsed: boolean
  onToggle?: () => void
  onNavigate?: () => void
  mobile?: boolean
}

export function Sidebar({ session, collapsed, onToggle, onNavigate, mobile }: Props) {
  const pathname = usePathname()
  const visible = (i: NavItem) => !i.requires || session?.permissions[i.requires].allowed
  return (
    <nav
      aria-label="メインメニュー"
      className={cn('flex h-full flex-col bg-bg', mobile ? 'w-[272px]' : collapsed ? 'w-14' : 'w-58')}
    >
      <div
        className={cn(
          'flex h-13 shrink-0 items-center border-b border-line',
          collapsed && !mobile ? 'justify-center' : 'px-4',
        )}
      >
        <Link href="/" onClick={onNavigate} aria-label="KURA ダッシュボードへ">
          <Logo compact={collapsed && !mobile} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        {NAV.map((g) => {
          const items = g.items.filter(visible)
          if (items.length === 0) return null
          return (
            <div key={g.label} className="mb-3">
              {(!collapsed || mobile) && <p className="px-4 pb-1 pt-2 text-label text-ink-500">{g.label}</p>}
              <ul>
                {items.map((i) => (
                  <li key={i.href}>
                    <NavLink
                      item={i}
                      active={pathname === i.href}
                      collapsed={collapsed && !mobile}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      {!mobile && onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="flex h-11 shrink-0 items-center gap-2 border-t border-line px-4 text-[12px] text-ink-600 hover:text-ink-900"
          aria-label={collapsed ? 'メニューを広げる' : 'メニューを折りたたむ'}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && 'メニューを折りたたむ'}
        </button>
      )}
    </nav>
  )
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const inner = (
    <>
      <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && !item.ready && (
        <span className="num ml-auto text-[10px] text-ink-500">P{item.phase}</span>
      )}
    </>
  )
  const base = cn(
    'relative flex h-9 items-center gap-3 text-body transition-colors duration-80',
    collapsed ? 'justify-center' : 'px-4',
  )
  const link = item.ready ? (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        base,
        active
          ? "bg-panel font-bold text-ink-900 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:bg-primary before:content-['']"
          : 'hover:bg-panel/70 text-ink-600 hover:text-ink-900',
      )}
    >
      {inner}
    </Link>
  ) : (
    <span aria-disabled="true" className={cn(base, 'cursor-not-allowed text-ink-500')}>
      {inner}
      <span className="sr-only">（Phase {item.phase} で実装予定）</span>
    </span>
  )
  if (!collapsed && item.ready) return link
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.ready ? item.label : `${item.label}（Phase ${item.phase} で実装予定）`}
      </TooltipContent>
    </Tooltip>
  )
}
