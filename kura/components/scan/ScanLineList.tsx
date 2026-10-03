'use client'
// スキャン行の一覧（8章）：スキャンごとに行が積み上がり、直前の行をハイライト、各行は取り消せる
import { Minus, Plus, X } from 'lucide-react'
import type { ScanLine } from '@/lib/scan'
import { fmtQty } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

type Props = {
  lines: ScanLine[]
  lastSeq: number
  onQty: (itemId: string, qty: number) => void
  onRemove: (itemId: string) => void
  /** 行ごとの追加入力（ロット番号など） */
  extra?: (line: ScanLine) => React.ReactNode
  /** 行ごとの注記（予定数との差など） */
  note?: (line: ScanLine) => React.ReactNode
  empty?: string
}

export function ScanLineList({
  lines,
  lastSeq,
  onQty,
  onRemove,
  extra,
  note,
  empty = 'まだスキャンしていません',
}: Props) {
  if (lines.length === 0) return <p className="px-4 py-8 text-center text-body text-ink-600">{empty}</p>
  return (
    <ul aria-label="スキャンした商品" className="divide-y divide-line">
      {lines.map((l) => {
        const latest = l.lastSeq === lastSeq
        return (
          <li
            key={l.itemId}
            className={cn(
              'flex flex-col gap-2 px-4 py-3 transition-colors duration-80 motion-safe:animate-[slide-in_120ms_ease-out]',
              latest && 'bg-primary-50 shadow-[inset_3px_0_0_var(--primary)]',
            )}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="num text-[13px] text-ink-600">{l.sku}</p>
                <p className="truncate text-body">{l.name}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`${l.name}を1つ減らす`}
                  onClick={() => onQty(l.itemId, l.qty - 1)}
                  className="grid size-9 place-items-center rounded border border-line-hi text-ink-600 hover:bg-panel-alt"
                >
                  <Minus className="size-4" />
                </button>
                <label className="sr-only" htmlFor={`qty-${l.itemId}`}>
                  {l.name}の数量
                </label>
                <input
                  id={`qty-${l.itemId}`}
                  inputMode="numeric"
                  value={l.qty}
                  onChange={(e) => {
                    const n = Number(e.target.value.normalize('NFKC'))
                    if (Number.isInteger(n) && n >= 0) onQty(l.itemId, n)
                  }}
                  className="num h-9 w-16 rounded border border-line-hi text-center text-[18px]"
                />
                <button
                  type="button"
                  aria-label={`${l.name}を1つ増やす`}
                  onClick={() => onQty(l.itemId, l.qty + 1)}
                  className="grid size-9 place-items-center rounded border border-line-hi text-ink-600 hover:bg-panel-alt"
                >
                  <Plus className="size-4" />
                </button>
                <span className="w-6 text-[11px] text-ink-500">{l.baseUnit}</span>
                <button
                  type="button"
                  aria-label={`${l.name}の行を取り消す`}
                  onClick={() => onRemove(l.itemId)}
                  className="grid size-9 place-items-center rounded text-ink-500 hover:bg-panel-alt hover:text-st-ink-stockout"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            {note?.(l)}
            {extra?.(l)}
            {l.scans > 1 && <p className="sr-only">{fmtQty(l.scans)}回スキャン</p>}
          </li>
        )
      })}
    </ul>
  )
}
