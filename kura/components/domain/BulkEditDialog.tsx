'use client'
// 一括操作の確認（FR-210）：対象件数と操作内容を、実行前に必ず見せる
import { useEffect, useState } from 'react'
import type { Category } from '@/lib/types'
import type { BulkPatch } from '@/lib/repo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export type BulkKind = 'category' | 'reorderPoint'

export function BulkEditDialog({
  kind,
  count,
  categories,
  onClose,
  onSubmit,
}: {
  kind?: BulkKind
  count: number
  categories: Category[]
  onClose: () => void
  onSubmit: (p: BulkPatch) => Promise<string | undefined>
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setValue(kind === 'category' ? (categories[0]?.id ?? '') : '')
    setError('')
  }, [kind, categories])

  const label = kind === 'category' ? 'カテゴリ' : '発注点'
  const preview = kind === 'category' ? categories.find((c) => c.id === value)?.name : value

  return (
    <Dialog open={Boolean(kind)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>
          {count} 件の{label}を変更
        </DialogTitle>
        <DialogDescription>
          選んだ {count} 件の商品の{label}を、まとめて書き換えます。実行後 5 秒間は元に戻せます。
        </DialogDescription>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            let patch: BulkPatch
            if (kind === 'category') patch = { categoryId: value }
            else {
              const n = Number(value.normalize('NFKC'))
              if (!Number.isInteger(n) || n < 0) return setError('発注点は0以上の整数で入力してください')
              patch = { reorderPoint: n }
            }
            setBusy(true)
            const r = await onSubmit(patch)
            setBusy(false)
            if (r) setError(r)
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-600">新しい{label}</span>
            {kind === 'category' ? (
              <select
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 rounded border border-line-hi px-2 text-body"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={value}
                inputMode="numeric"
                onChange={(e) => setValue(e.target.value)}
                aria-describedby={error ? 'bulk-error' : undefined}
                className="num h-9 rounded border border-line-hi px-2.5 text-qty"
                placeholder="例：60"
              />
            )}
          </label>
          {error && (
            <p id="bulk-error" role="alert" className="text-[12px] text-st-ink-stockout">
              {error}
            </p>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <DialogClose asChild>
              <Button>やめる</Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={busy || !value}>
              {busy ? '変更しています…' : `${count} 件を「${preview || '…'}」にする`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
