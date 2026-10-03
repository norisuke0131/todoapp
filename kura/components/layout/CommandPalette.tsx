'use client'
// コマンドパレット（FR-212）と横断検索（FR-211）：⌘K / Ctrl+K / / で開く
// SKU・商品名・JAN・ロット番号を検索し、画面の移動や操作の起動もここからできる
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Boxes, FileUp, Layers, PackagePlus, Search } from 'lucide-react'
import { search, type SearchHit, type SessionInfo } from '@/lib/repo'
import { fmtDate } from '@/lib/utils/format'
import { NAV } from './nav'

export function CommandPalette({
  open,
  onOpenChange,
  session,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  session?: SessionInfo
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  useEffect(() => {
    let alive = true
    void search(q).then((r) => alive && setHits(r.ok ? r.data : []))
    return () => {
      alive = false
    }
  }, [q])

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }
  const pages = NAV.flatMap((g) => g.items).filter(
    (i) => i.ready && (!i.requires || session?.permissions[i.requires].allowed),
  )
  const canMaster = session?.permissions['master.write'].allowed

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bg-ink-900/40 fixed inset-0 z-50 data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded border border-line bg-panel shadow-pop"
        >
          <DialogPrimitive.Title className="sr-only">検索とコマンド</DialogPrimitive.Title>
          <Command shouldFilter={false} label="検索とコマンド" className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search aria-hidden className="size-4 text-ink-500" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="SKU・商品名・JAN・ロット番号、または画面の名前"
                className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-500"
              />
              <kbd className="num rounded-sm border border-line px-1.5 text-[11px] text-ink-500">Esc</kbd>
            </div>
            <Command.List className="max-h-[56vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-body text-ink-600">
                「{q}」に一致する商品・ロットはありません
              </Command.Empty>
              {hits.length > 0 && (
                <Command.Group heading="商品・ロット" className={GROUP}>
                  {hits.map((h) => (
                    <Command.Item
                      key={`${h.kind}-${h.sku}-${h.kind === 'lot' ? h.lotNo : ''}`}
                      value={`${h.kind}-${h.sku}-${h.kind === 'lot' ? h.lotNo : ''}`}
                      onSelect={() => go(`/items/${h.sku}`)}
                      className={ITEM}
                    >
                      {h.kind === 'lot' ? (
                        <Layers aria-hidden className="size-4 text-ink-500" />
                      ) : (
                        <Boxes aria-hidden className="size-4 text-ink-500" />
                      )}
                      <span className="num w-[76px] shrink-0 text-[13px] text-ink-600">{h.sku}</span>
                      <span className="min-w-0 flex-1 truncate">{h.name}</span>
                      <span className="shrink-0 text-[11px] text-ink-500">
                        {h.kind === 'lot'
                          ? `ロット ${h.lotNo}${h.expiryDate ? `・期限 ${fmtDate(h.expiryDate)}` : ''}`
                          : h.matched === 'jan'
                            ? `JAN ${h.jan}`
                            : ''}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {!q && (
                <>
                  <Command.Group heading="操作" className={GROUP}>
                    {canMaster && (
                      <>
                        <Command.Item value="new-item" onSelect={() => go('/items/new')} className={ITEM}>
                          <PackagePlus aria-hidden className="size-4 text-ink-500" />
                          商品を登録する
                        </Command.Item>
                        <Command.Item value="import" onSelect={() => go('/import')} className={ITEM}>
                          <FileUp aria-hidden className="size-4 text-ink-500" />
                          CSV を取り込む
                        </Command.Item>
                      </>
                    )}
                    <Command.Item
                      value="reorder"
                      onSelect={() => go('/stock?f=state.in.stockout~below_reorder&s=available.asc')}
                      className={ITEM}
                    >
                      <Boxes aria-hidden className="size-4 text-ink-500" />
                      発注点を下回っている在庫を見る
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="画面へ移動" className={GROUP}>
                    {pages.map((p) => (
                      <Command.Item
                        key={p.href}
                        value={`page-${p.href}`}
                        onSelect={() => go(p.href)}
                        className={ITEM}
                      >
                        <p.icon aria-hidden className="size-4 text-ink-500" />
                        {p.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

const GROUP =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:text-ink-500'
const ITEM =
  'flex h-10 cursor-pointer items-center gap-3 rounded-sm px-2 text-body text-ink-900 data-[selected=true]:bg-primary-50'
