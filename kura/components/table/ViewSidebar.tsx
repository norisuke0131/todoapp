'use client'
// 保存ビュー（FR-207, FR-208）：件数バッジつきでワンクリック切替。個人／共有を区別する
import { useState } from 'react'
import { Bookmark, BookmarkPlus, Trash2, Users } from 'lucide-react'
import type { SavedView } from '@/lib/types'
import { cn } from '@/lib/utils/cn'
import { fmtQty } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

type Props = {
  views: (SavedView & { count: number; mine: boolean })[]
  allCount: number
  activeId?: string
  isDirty: boolean
  canShare: boolean
  shareReason?: string
  onSelect: (view?: SavedView) => void
  onSave: (name: string, shared: boolean) => Promise<string | undefined>
  onDelete: (id: string) => void
}

export function ViewSidebar({
  views,
  allCount,
  activeId,
  isDirty,
  canShare,
  shareReason,
  onSelect,
  onSave,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [error, setError] = useState('')
  const mine = views.filter((v) => !v.isShared)
  const team = views.filter((v) => v.isShared)
  return (
    <nav aria-label="保存ビュー" className="flex flex-col gap-4">
      <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        <Item
          label="すべての在庫"
          count={allCount}
          active={!activeId && !isDirty}
          onClick={() => onSelect(undefined)}
        />
      </ul>
      {[
        { title: '共有ビュー', list: team, icon: Users },
        { title: '自分のビュー', list: mine, icon: Bookmark },
      ].map(
        (g) =>
          g.list.length > 0 && (
            <div key={g.title}>
              <p className="mb-1 hidden items-center gap-1.5 px-2 text-label text-ink-500 lg:flex">
                <g.icon aria-hidden className="size-3" />
                {g.title}
              </p>
              <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
                {g.list.map((v) => (
                  <Item
                    key={v.id}
                    label={v.name}
                    count={v.count}
                    active={activeId === v.id}
                    onClick={() => onSelect(v)}
                    onDelete={v.mine ? () => onDelete(v.id) : undefined}
                  />
                ))}
              </ul>
            </div>
          ),
      )}
      <Button
        size="sm"
        variant="ghost"
        className="justify-start self-start lg:self-stretch"
        onClick={() => setOpen(true)}
      >
        <BookmarkPlus aria-hidden />
        いまの条件をビューに保存
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>ビューとして保存</DialogTitle>
          <DialogDescription>
            いまの絞り込み条件・表示列・並び順を、名前をつけて保存します。
          </DialogDescription>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const r = await onSave(name, shared)
              if (r) return setError(r)
              setOpen(false)
              setName('')
              setShared(false)
              setError('')
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-600">ビューの名前</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：東京 発注点以下"
                aria-describedby={error ? 'view-error' : undefined}
                className="h-9 rounded border border-line-hi px-2.5 text-body"
              />
            </label>
            <label className={cn('flex items-center gap-2 text-body', !canShare && 'text-ink-500')}>
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={shared}
                disabled={!canShare}
                onChange={(e) => setShared(e.target.checked)}
              />
              チームで共有する
              {!canShare && <span className="text-[12px]">（{shareReason}）</span>}
            </label>
            {error && (
              <p id="view-error" role="alert" className="text-[12px] text-st-ink-stockout">
                {error}
              </p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <DialogClose asChild>
                <Button>やめる</Button>
              </DialogClose>
              <Button type="submit" variant="primary">
                保存する
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </nav>
  )
}

function Item({
  label,
  count,
  active,
  onClick,
  onDelete,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  onDelete?: () => void
}) {
  return (
    <li className="group relative shrink-0 lg:shrink">
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        onClick={onClick}
        className={cn(
          'flex h-8 w-full items-center gap-2 whitespace-nowrap rounded-sm px-2 text-left text-body transition-colors duration-80',
          active
            ? 'bg-panel font-bold text-ink-900 shadow-[inset_3px_0_0_var(--primary)]'
            : 'hover:bg-panel/70 text-ink-600 hover:text-ink-900',
          'border border-line lg:border-0',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="num rounded-sm bg-panel-alt px-1.5 text-[11px] leading-5 text-ink-600">
          {fmtQty(count)}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`ビュー「${label}」を削除`}
          className="absolute right-9 top-1/2 hidden size-6 -translate-y-1/2 place-items-center rounded-sm text-ink-500 hover:bg-panel-alt hover:text-st-ink-stockout focus-visible:grid group-hover:lg:grid"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </li>
  )
}
