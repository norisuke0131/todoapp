'use client'
// 在庫一覧の一括操作：選んだ行の在庫を、同じ拠点の別の棚へまとめて移す（棚番の一括変更）
import { useEffect, useState } from 'react'
import { listWarehouseLocations } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export function BulkLocationDialog({
  open,
  count,
  warehouseId,
  warehouseName,
  onClose,
  onSubmit,
}: {
  open: boolean
  count: number
  warehouseId?: string
  warehouseName: string
  onClose: () => void
  onSubmit: (locationId: string) => Promise<string | void>
}) {
  const locs = useRepo(
    () =>
      warehouseId ? listWarehouseLocations(warehouseId) : Promise.resolve({ ok: true as const, data: [] }),
    [warehouseId],
  )
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setTo('')
      setError('')
    }
  }, [open])
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>棚番をまとめて変更</DialogTitle>
        <DialogDescription>
          {warehouseName}の {count}{' '}
          品目を、選んだ棚へ移します。在庫は「棚間移動」の取引として記録されるので、履歴から追えます。
        </DialogDescription>
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-label text-ink-600">移動先の棚</span>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="num h-9 rounded border border-line-hi bg-panel px-2.5 text-body"
          >
            <option value="">選ぶ</option>
            {(locs.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
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
            disabled={busy || !to}
            onClick={async () => {
              setBusy(true)
              const e = await onSubmit(to)
              setBusy(false)
              if (e) setError(e)
            }}
          >
            棚を移す
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
