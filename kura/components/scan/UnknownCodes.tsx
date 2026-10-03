'use client'
// 未登録のバーコード（FR-304）：その場で商品を登録するか、保留にするかを選ぶ
import { AlertTriangle } from 'lucide-react'
import type { UnknownCode } from '@/lib/scan'
import { Button } from '@/components/ui/button'

export function UnknownCodes({
  codes,
  canRegister,
  registerReason,
  onRegister,
  onHold,
  onDrop,
}: {
  codes: UnknownCode[]
  canRegister: boolean
  registerReason?: string
  onRegister: (code: string) => void
  onHold: (code: string) => void
  onDrop: (code: string) => void
}) {
  if (codes.length === 0) return null
  return (
    <section aria-label="未登録のバーコード" className="border-st-low/60 bg-st-low/5 rounded border">
      <p className="border-st-low/30 flex items-center gap-2 border-b px-4 py-2 text-label text-st-ink-low">
        <AlertTriangle aria-hidden className="size-3.5" />
        未登録のバーコード {codes.length} 件
      </p>
      <ul className="divide-st-low/20 divide-y">
        {codes.map((u) => (
          <li key={u.code} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <span className="num text-[15px] text-ink-900">{u.code}</span>
            <span className="text-[12px] text-ink-600">
              {u.count} 回{u.held && '・保留中'}
            </span>
            <span className="ml-auto flex gap-1.5">
              <Button
                size="sm"
                onClick={() => onRegister(u.code)}
                disabled={!canRegister}
                title={!canRegister ? registerReason : undefined}
              >
                その場で登録
              </Button>
              {!u.held ? (
                <Button size="sm" variant="ghost" onClick={() => onHold(u.code)}>
                  保留にする
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => onDrop(u.code)}>
                  一覧から外す
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
