'use client'
// 一括操作バー：行を選ぶとテーブル下部から 200ms でせり上がる（8章）
// 選択件数は aria-live で読み上げる（A11Y-11）
import type { ReactNode } from 'react'

export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number
  onClear: () => void
  children: ReactNode
}) {
  return (
    <div aria-live="polite" className="pointer-events-none sticky bottom-0 z-20 h-0">
      {count > 0 && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-3 mx-auto flex w-fit max-w-[calc(100%-24px)] flex-wrap items-center gap-2 rounded bg-ink-900 px-3 py-2 text-white shadow-pop motion-safe:animate-[rise-in_200ms_ease-out]">
          <span className="px-1 text-body font-bold">
            <span className="num">{count}</span> 件を選択中
          </span>
          <span aria-hidden className="h-5 w-px bg-white/20" />
          {children}
          <button
            type="button"
            onClick={onClear}
            className="h-8 rounded-sm px-2.5 text-[12px] font-bold text-white/80 hover:bg-white/10 hover:text-white"
          >
            選択を解除
          </button>
        </div>
      )}
    </div>
  )
}

export function BulkButton({
  children,
  onClick,
  disabled,
  reason,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  reason?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? reason : undefined}
      className="h-8 rounded-sm px-2.5 text-[12px] font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/45"
    >
      {children}
      {disabled && reason && <span className="sr-only">（{reason}）</span>}
    </button>
  )
}
