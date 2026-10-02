import type { Metadata, Viewport } from 'next'
import { Suspense, type ReactNode } from 'react'
import { Noto_Sans_JP, Roboto_Condensed } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/toast'
import './globals.css'

const sans = Noto_Sans_JP({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  preload: false,
})
const num = Roboto_Condensed({
  weight: ['600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-num',
})

export const metadata: Metadata = {
  title: { default: 'KURA｜入出庫の履歴から在庫を組み立てる在庫管理デモ', template: '%s｜KURA 在庫管理デモ' },
  description:
    '実在庫・引当済・有効在庫・入荷予定の「4つの在庫数」を水位バーで読む、在庫管理システムのデモ。登録不要で、入出庫・棚卸・発注・ロット期限を体験できます。データは送信されません。',
}

export const viewport: Viewport = { themeColor: '#151b21', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${sans.variable} ${num.variable}`}>
      <body>
        <TooltipProvider delayDuration={200}>
          <ToastProvider>
            <Suspense>
              <AppShell>{children}</AppShell>
            </Suspense>
          </ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  )
}
