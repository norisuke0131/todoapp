'use client'
// SC-121 取消（逆仕訳）：元の取引は消さず、符号を反転した取引を追加する（FR-315, INV-03）
import { useEffect, useRef, useState } from 'react'
import { Undo2 } from 'lucide-react'
import type { TxnType } from '@/lib/types'
import { reverseTransaction } from '@/lib/repo'
import { fmtDateTime, fmtSigned } from '@/lib/utils/format'
import { TXN_LABEL } from '@/lib/utils/labels'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

export type ReverseTarget = {
  id: string
  type: TxnType
  qtyBase: number
  unit: string
  itemLabel: string
  occurredAt: string
  userName: string
}

/** 取消できる取引か（取消の取引・取消済・棚卸差異は不可） */
export const canReverse = (t: { type: TxnType; reversesTxnId?: string }, isReversed: boolean) =>
  !t.reversesTxnId && !isReversed && t.type !== 'stocktake'

export function ReverseDialog({ target, onClose }: { target?: ReverseTarget; onClose: () => void }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // 行のボタンから開くので Trigger が無い。閉じたら開く前の要素へフォーカスを戻す（A11Y-09）
  const opener = useRef<HTMLElement | null>(null)
  const openerRow = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (target) {
      opener.current = document.activeElement as HTMLElement | null
      openerRow.current = opener.current?.closest<HTMLElement>('tr, li') ?? null
      setNote('')
      setError('')
    }
  }, [target])
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-[480px]"
        onCloseAutoFocus={(e) => {
          // 取り消すとボタンが消えるので、そのときは行へ戻す
          const el = opener.current?.isConnected
            ? opener.current
            : openerRow.current?.isConnected
              ? openerRow.current
              : null
          if (el) {
            e.preventDefault()
            if (el === openerRow.current && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
            el.focus()
          }
        }}
      >
        <DialogTitle>この取引を取り消しますか</DialogTitle>
        <DialogDescription>
          元の取引は消さずに残し、数量の符号を逆にした「取消」の取引を追加します。どちらも履歴に残るので、いつ・誰が・何を取り消したか後から追えます。
        </DialogDescription>
        {target && (
          <dl className="mt-4 grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-1.5 rounded bg-panel-alt px-4 py-3 text-[13px]">
            <dt className="text-ink-600">元の取引</dt>
            <dd className="truncate">
              {TXN_LABEL[target.type]}・{target.itemLabel}
            </dd>
            <dd className="num text-right text-qty">{fmtSigned(target.qtyBase)}</dd>
            <dt className="text-ink-600">取消</dt>
            <dd className="text-ink-600">
              {fmtDateTime(target.occurredAt)}・{target.userName}の登録を打ち消す
            </dd>
            <dd className="num text-right text-qty text-st-ink-stockout">{fmtSigned(-target.qtyBase)}</dd>
          </dl>
        )}
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-label text-ink-600">取り消す理由（任意）</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-9 rounded border border-line-hi bg-panel px-2.5 text-body"
            placeholder="例：数量の打ち間違い"
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-st-ink-stockout">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button>やめる</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              if (!target) return
              setBusy(true)
              const r = await reverseTransaction(target.id, note)
              setBusy(false)
              if (!r.ok) return setError(r.error)
              toast.show({
                message: `${TXN_LABEL[target.type]}（${fmtSigned(target.qtyBase)}${target.unit}）を取り消しました。元の取引には「取消済」の印が付きます`,
              })
              onClose()
            }}
          >
            <Undo2 aria-hidden />
            取り消す
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
