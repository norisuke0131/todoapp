'use client'
// 未登録のバーコードを、その場で商品として登録する（FR-304）
import { useEffect, useState } from 'react'
import { createItem, getMasters } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const input = 'h-9 w-full rounded border border-line-hi bg-panel px-2.5 text-body'

export function QuickRegisterDialog({
  code,
  onClose,
  onDone,
}: {
  code?: string
  onClose: () => void
  onDone: (code: string) => void
}) {
  const masters = useRepo(getMasters)
  const [f, setF] = useState({ sku: '', name: '', categoryId: '', baseUnit: '個', cost: '', price: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (code) {
      setF((v) => ({
        ...v,
        sku: `SKU-${code.slice(-4)}`,
        name: '',
        categoryId: masters.data?.categories[0]?.id ?? '',
      }))
      setError('')
    }
  }, [code, masters.data])
  const isJan = code ? /^\d{8}$|^\d{13}$/.test(code) : false
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }))
  return (
    <Dialog open={Boolean(code)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogTitle>未登録のバーコードを登録</DialogTitle>
        <DialogDescription>
          <span className="num text-ink-900">{code}</span> を{isJan ? ' JAN として' : ' SKU として'}
          登録します。足りない項目は、あとで商品の編集から直せます。
        </DialogDescription>
        <form
          className="mt-4 grid grid-cols-2 gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!f.name.trim()) return setError('商品名を入力してください')
            const cost = Number(f.cost.normalize('NFKC'))
            const price = Number(f.price.normalize('NFKC'))
            if (Number.isNaN(cost) || Number.isNaN(price))
              return setError('原価と売価は半角数字で入力してください')
            setBusy(true)
            const r = await createItem({
              sku: isJan ? f.sku : code!,
              jan: isJan ? code : undefined,
              name: f.name,
              categoryId: f.categoryId,
              baseUnit: f.baseUnit,
              packUnits: [],
              cost,
              price,
              reorderPoint: 0,
              safetyStock: 0,
              orderLot: 1,
              leadTimeDays: 7,
              isLotManaged: false,
              storageCondition: 'normal',
              isActive: true,
            })
            setBusy(false)
            if (!r.ok) return setError(r.error)
            onDone(code!)
          }}
        >
          {isJan && (
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-600">SKU</span>
              <input className={input} value={f.sku} onChange={set('sku')} />
            </label>
          )}
          <label className={`flex flex-col gap-1 ${isJan ? '' : 'col-span-2'}`}>
            <span className="text-label text-ink-600">単位</span>
            <input className={input} value={f.baseUnit} onChange={set('baseUnit')} />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-label text-ink-600">商品名</span>
            <input
              className={input}
              value={f.name}
              onChange={set('name')}
              aria-describedby={error ? 'qr-err' : undefined}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-label text-ink-600">カテゴリ</span>
            <select className={input} value={f.categoryId} onChange={set('categoryId')}>
              {(masters.data?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-600">原価（円）</span>
            <input className={`${input} num`} inputMode="decimal" value={f.cost} onChange={set('cost')} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-600">売価（円）</span>
            <input className={`${input} num`} inputMode="decimal" value={f.price} onChange={set('price')} />
          </label>
          {error && (
            <p id="qr-err" role="alert" className="col-span-2 text-[12px] text-st-ink-stockout">
              {error}
            </p>
          )}
          <div className="col-span-2 mt-1 flex justify-end gap-2">
            <DialogClose asChild>
              <Button>やめる</Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={busy}>
              登録してスキャンに加える
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
