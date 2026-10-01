'use client'
// デモ切替バー（4章）：プロダクトのUIとは別扱い。ダークな帯 + 小さめのタイポ + 安全テープで
// 「アプリの外側にある操作パネル」であることを示す。埋め込みモードでは出さない
import type { SessionInfo } from '@/lib/repo'
import { RoleSwitcher } from './RoleSwitcher'
import { ResetButton } from './ResetButton'
import { BackToArticle } from './BackToArticle'

export function DemoBar({ session }: { session?: SessionInfo }) {
  return (
    <div className="relative z-40 shrink-0 bg-demo-bg text-demo-ink">
      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-1.5 lg:px-6">
        <p className="flex items-center gap-2 text-[12px]">
          <span className="num rounded-sm border border-st-low px-1.5 text-[11px] font-bold uppercase leading-[18px] tracking-[0.14em] text-st-low">
            Demo
          </span>
          <span className="hidden text-demo-dim xl:inline">これはデモです。データは送信されません</span>
          <span className="sr-only xl:hidden">これはデモです。データは送信されません</span>
        </p>
        <RoleSwitcher session={session} />
        <div className="ml-auto flex items-center gap-1">
          <ResetButton />
          <BackToArticle />
        </div>
      </div>
      <div aria-hidden className="hazard-tape h-[3px]" />
    </div>
  )
}
