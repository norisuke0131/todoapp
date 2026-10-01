// サイドバーの構成。ready=false の画面は後続フェーズで実装する（押せない状態で見せる）
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BarChart3,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  Gauge,
  History,
  Layers,
  Link2,
  PackageCheck,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
} from 'lucide-react'
import type { Permission } from '@/lib/repo'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  ready: boolean
  phase?: number
  /** この権限がないロールには出さない（4章：管理者に切替で設定が出現する） */
  requires?: Permission
}
export type NavGroup = { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    label: '在庫',
    items: [
      { href: '/', label: 'ダッシュボード', icon: Gauge, ready: true },
      { href: '/stock', label: '在庫一覧', icon: Boxes, ready: false, phase: 1 },
      { href: '/lots', label: 'ロット', icon: Layers, ready: false, phase: 4 },
      { href: '/expiry', label: '期限アラート', icon: CalendarClock, ready: false, phase: 4 },
    ],
  },
  {
    label: '入出庫',
    items: [
      { href: '/receive', label: '入庫（検品）', icon: ArrowDownToLine, ready: false, phase: 2 },
      { href: '/ship', label: '出庫（ピッキング）', icon: ArrowUpFromLine, ready: false, phase: 2 },
      { href: '/allocations', label: '引当', icon: Link2, ready: false, phase: 2 },
      { href: '/transfer', label: '在庫移動', icon: ArrowLeftRight, ready: false, phase: 2 },
      { href: '/adjust', label: '在庫調整', icon: SlidersHorizontal, ready: false, phase: 2 },
      { href: '/transactions', label: '取引履歴', icon: History, ready: false, phase: 2 },
    ],
  },
  {
    label: '棚卸・発注',
    items: [
      { href: '/stocktakes', label: '棚卸', icon: ClipboardCheck, ready: false, phase: 3 },
      { href: '/replenishment', label: '推奨発注', icon: ShoppingCart, ready: false, phase: 4 },
      { href: '/purchase-orders', label: '発注・入荷予定', icon: PackageCheck, ready: false, phase: 4 },
    ],
  },
  {
    label: '分析・設定',
    items: [
      {
        href: '/reports/turnover',
        label: '分析',
        icon: BarChart3,
        ready: false,
        phase: 4,
        requires: 'analytics.view',
      },
      {
        href: '/settings',
        label: '設定・操作ログ',
        icon: Settings,
        ready: false,
        phase: 4,
        requires: 'admin.access',
      },
    ],
  },
]

export function findNav(pathname: string): NavItem | undefined {
  return NAV.flatMap((g) => g.items).find((i) => i.href === pathname)
}
