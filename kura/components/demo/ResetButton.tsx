'use client'
// 「デモをリセット」（FR-709）。確認ダイアログつき
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { resetDemo } from '@/lib/repo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function ResetButton() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-[12px] font-bold text-demo-dim hover:bg-white/5 hover:text-demo-ink"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          <span className="hidden md:inline">デモをリセット</span>
          <span className="sr-only md:hidden">デモをリセット</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>デモを初期状態に戻しますか？</DialogTitle>
        <DialogDescription>
          このブラウザで行った入出庫・引当・棚卸・発注・設定の変更がすべて消え、最初のデータに戻ります。元に戻すことはできません。
        </DialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">やめる</Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await resetDemo()
              setBusy(false)
              setOpen(false)
            }}
          >
            {busy ? 'リセットしています…' : 'リセットする'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
