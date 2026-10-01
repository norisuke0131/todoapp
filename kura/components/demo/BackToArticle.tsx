// 元記事へ戻る・資料ダウンロード（FR-713）
import { ArrowUpRight, FileDown } from 'lucide-react'
import { LINKS } from '@/lib/utils/links'

export function BackToArticle() {
  return (
    <>
      <a
        href={LINKS.document}
        target="_blank"
        rel="noopener"
        className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-[12px] font-bold text-demo-dim hover:bg-white/5 hover:text-demo-ink"
      >
        <FileDown aria-hidden className="size-3.5" />
        <span className="hidden md:inline">資料ダウンロード</span>
        <span className="sr-only md:hidden">資料ダウンロード（新しいタブ）</span>
      </a>
      <a
        href={LINKS.article}
        className="flex h-7 items-center gap-1 rounded-sm bg-demo-ink px-2.5 text-[12px] font-bold text-demo-bg hover:bg-white"
      >
        <span className="hidden sm:inline">元記事へ戻る</span>
        <span className="sm:hidden">記事へ</span>
        <ArrowUpRight aria-hidden className="size-3.5" />
      </a>
    </>
  )
}
