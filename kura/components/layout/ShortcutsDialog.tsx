'use client'
// ショートカット一覧（IX-05：? で開く）
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const KEYS: [string, string][] = [
  ['⌘K / Ctrl+K', '検索とコマンド'],
  ['/', '検索を開く'],
  ['?', 'この一覧'],
  ['↑ ↓', '表の行を移動'],
  ['Enter', '行の詳細を開く'],
  ['Space', '行を選択'],
  ['⌘A / Ctrl+A', '表の行をすべて選択'],
  ['Shift + 見出しクリック', '並べ替えの列を追加'],
]

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>キーボードショートカット</DialogTitle>
        <DialogDescription>毎日触る画面なので、マウスなしで操作できるようにしています。</DialogDescription>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5">
          {KEYS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="num whitespace-nowrap rounded-sm border border-line-hi bg-panel-alt px-1.5 py-0.5 text-[12px]">
                  {k}
                </kbd>
              </dt>
              <dd className="text-body text-ink-600">{v}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
