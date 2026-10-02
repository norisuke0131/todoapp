'use client'
// 表示する列の選択と並び替え（FR-202）。ドラッグではなく上下ボタンにしてキーボードだけで操作できるようにする
import { ArrowDown, ArrowUp, Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type ColumnOption = { id: string; label: string; locked?: boolean }

export function ColumnPicker({
  options,
  visible,
  onChange,
  onReset,
}: {
  options: ColumnOption[]
  visible: string[]
  onChange: (next: string[]) => void
  onReset: () => void
}) {
  const ordered = [
    ...visible.filter((id) => options.some((o) => o.id === id)),
    ...options.map((o) => o.id).filter((id) => !visible.includes(id)),
  ]
  const label = (id: string) => options.find((o) => o.id === id)
  const move = (id: string, d: -1 | 1) => {
    const i = visible.indexOf(id)
    const j = i + d
    if (i < 0 || j < 0 || j >= visible.length) return
    const next = [...visible]
    next[i] = visible[j]!
    next[j] = id
    onChange(next)
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Columns3 aria-hidden />
          <span className="hidden sm:inline">表示する列</span>
          <span className="sr-only sm:hidden">表示する列</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <p className="border-b border-line px-3 py-2 text-label text-ink-600">
          表示する列（{visible.length}）
        </p>
        <ul className="max-h-80 overflow-y-auto py-1">
          {ordered.map((id) => {
            const o = label(id)
            if (!o) return null
            const on = visible.includes(id)
            const i = visible.indexOf(id)
            return (
              <li key={id} className="flex h-9 items-center gap-2 px-3">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-body">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={on}
                    disabled={o.locked}
                    onChange={(e) =>
                      onChange(e.target.checked ? [...visible, id] : visible.filter((x) => x !== id))
                    }
                  />
                  <span className="truncate">{o.label}</span>
                </label>
                {on && (
                  <span className="flex shrink-0">
                    <button
                      type="button"
                      aria-label={`${o.label}を左へ`}
                      disabled={i <= 0}
                      onClick={() => move(id, -1)}
                      className="grid size-7 place-items-center rounded-sm text-ink-600 hover:bg-panel-alt disabled:text-ink-400"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`${o.label}を右へ`}
                      disabled={i >= visible.length - 1}
                      onClick={() => move(id, 1)}
                      className="grid size-7 place-items-center rounded-sm text-ink-600 hover:bg-panel-alt disabled:text-ink-400"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <div className="border-t border-line px-3 py-2 text-right">
          <button
            type="button"
            onClick={onReset}
            className="text-[12px] font-bold text-primary-d hover:underline"
          >
            初期の並びに戻す
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
