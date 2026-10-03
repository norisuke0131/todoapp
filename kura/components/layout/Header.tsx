'use client'
// ヘッダー（52px 固定）：パンくずと、いま操作している人
import Link from 'next/link'
import { Menu, Search } from 'lucide-react'
import type { SessionInfo } from '@/lib/repo'
import { ROLE_LABEL } from '@/lib/repo/session'

export type Crumb = { label: string; href?: string }

export function Header({
  crumbs,
  session,
  onMenu,
  onSearch,
}: {
  crumbs: Crumb[]
  session?: SessionInfo
  onMenu: () => void
  onSearch: () => void
}) {
  return (
    <header className="sticky top-0 z-30 flex h-13 shrink-0 items-center gap-3 border-b border-line bg-panel px-4 lg:px-6">
      <button
        type="button"
        onClick={onMenu}
        className="-ml-1 grid size-9 place-items-center rounded text-ink-600 hover:bg-panel-alt lg:hidden"
        aria-label="メニューを開く"
      >
        <Menu className="size-5" />
      </button>
      <nav aria-label="パンくずリスト" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-body text-ink-600">
          {crumbs.map((c, i) => (
            <li key={c.label} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden className="text-ink-400">
                  /
                </span>
              )}
              {c.href && i < crumbs.length - 1 ? (
                <Link href={c.href} className="truncate hover:text-ink-900 hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span
                  aria-current={i === crumbs.length - 1 ? 'page' : undefined}
                  className="truncate font-bold text-ink-900"
                >
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <button
        type="button"
        onClick={onSearch}
        className="flex h-8 shrink-0 items-center gap-2 rounded border border-line-hi bg-panel-alt px-2.5 text-[12px] text-ink-500 hover:border-ink-400 hover:text-ink-900 md:w-[260px]"
      >
        <Search aria-hidden className="size-4" />
        <span className="hidden flex-1 text-left md:inline">SKU・商品名・JAN・ロット</span>
        <span className="sr-only md:hidden">検索</span>
        <kbd className="num hidden rounded-sm border border-line px-1 text-[10px] md:inline">⌘K</kbd>
      </button>
      {session && (
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden text-right sm:block">
            <span className="block text-[12px] font-bold leading-4 text-ink-900">{session.userName}</span>
            <span className="block text-[11px] leading-4 text-ink-500">
              {ROLE_LABEL[session.role]}・
              {session.allWarehouses
                ? '全拠点'
                : session.warehouses
                    .filter((w) => w.visible)
                    .map((w) => w.name)
                    .join('・')}
            </span>
          </span>
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-full bg-ink-900 text-[12px] font-bold text-white"
          >
            {session.userName.slice(0, 1)}
          </span>
        </div>
      )}
    </header>
  )
}
