'use client'
// アプリシェル：デモ切替バー + 左サイドバー + ヘッダー（52px）+ メイン
// 埋め込みモード（?embed=1）では、バー・ナビ・ヘッダーを出さない（EMB-05）
import { useState, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { getSession, getUiPrefs, setUiPrefs } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { DemoBar } from '@/components/demo/DemoBar'
import { Sidebar } from './Sidebar'
import { Header, type Crumb } from './Header'
import { findNav } from './nav'

const EXTRA_CRUMBS: Record<string, string> = { '/dev/components': 'コンポーネントカタログ' }

export function AppShell({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const pathname = usePathname()
  const session = useRepo(getSession)
  const prefs = useRepo(getUiPrefs)
  const [drawer, setDrawer] = useState(false)

  if (params.get('embed') === '1') return <>{children}</>

  const collapsed = prefs.data?.sidebarCollapsed ?? false
  const here = findNav(pathname)?.label ?? EXTRA_CRUMBS[pathname]
  const crumbs: Crumb[] = [
    { label: 'KURA', href: '/' },
    ...(here && pathname !== '/' ? [{ label: here }] : [{ label: 'ダッシュボード' }]),
  ]

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2"
      >
        本文へ移動
      </a>
      <DemoBar session={session.data} />
      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-dvh shrink-0 border-r border-line lg:block">
          <Sidebar
            session={session.data}
            collapsed={collapsed}
            onToggle={() => void setUiPrefs({ sidebarCollapsed: !collapsed })}
          />
        </aside>
        <DialogPrimitive.Root open={drawer} onOpenChange={setDrawer}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="bg-ink-900/40 fixed inset-0 z-50 lg:hidden" />
            <DialogPrimitive.Content
              className="fixed inset-y-0 left-0 z-50 border-r border-line shadow-pop lg:hidden"
              aria-describedby={undefined}
            >
              <DialogPrimitive.Title className="sr-only">メインメニュー</DialogPrimitive.Title>
              <Sidebar session={session.data} collapsed={false} mobile onNavigate={() => setDrawer(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <div className="flex min-w-0 flex-1 flex-col">
          <Header crumbs={crumbs} session={session.data} onMenu={() => setDrawer(true)} />
          <main id="main" className="min-w-0 flex-1 px-4 py-5 lg:px-6 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
