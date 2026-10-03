'use client'
// スマホ幅の在庫一覧：1件を1枚のカードにし、4つの在庫数と水位バーを必ず見せる（仮想スクロール）
import Link from 'next/link'
import { useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { StockRow } from '@/lib/repo/stock'
import { fmtQty } from '@/lib/utils/format'
import { StockGauge } from '@/components/gauge/StockGauge'
import { StockStatusBadge } from '@/components/domain/StockStatusBadge'

const H = 104

export function StockCardList({
  rows,
  height,
  empty,
  warehouseName,
}: {
  rows: StockRow[]
  height: string
  empty: ReactNode
  warehouseName: (id?: string) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => ref.current,
    estimateSize: () => H,
    overscan: 8,
  })
  if (rows.length === 0) return <>{empty}</>
  return (
    <div ref={ref} className="overflow-auto overscroll-contain" style={{ height }}>
      <ul aria-label="在庫一覧" className="relative" style={{ height: v.getTotalSize() }}>
        {v.getVirtualItems().map((vi) => {
          const r = rows[vi.index]!
          const s = r.snapshot
          return (
            <li
              key={`${r.item.sku}|${r.warehouseId ?? ''}`}
              className="absolute inset-x-0"
              style={{ top: vi.start, height: H }}
            >
              <Link
                href={`/items/${r.item.sku}${r.warehouseId ? `?wh=${r.warehouseId}` : ''}`}
                className="flex h-full flex-col justify-center gap-1.5 border-b border-line px-4 active:bg-primary-50"
              >
                <span className="flex items-center gap-2">
                  <span className="num shrink-0 text-[13px] text-primary-d">{r.item.sku}</span>
                  <span className="min-w-0 flex-1 truncate text-body">{r.item.name}</span>
                  <StockStatusBadge state={s.status} />
                </span>
                <span className="flex items-baseline gap-1.5 text-[11px] text-ink-500">
                  実<span className="num text-qty text-ink-600">{fmtQty(s.onHand)}</span>
                  <span aria-hidden>−</span>引
                  <span className="num text-qty text-ink-600">{fmtQty(s.allocated)}</span>
                  <span aria-hidden>=</span>有効
                  <span className="num text-[17px] leading-5 text-ink-900">{fmtQty(s.available)}</span>
                  <span className="ml-auto">
                    入荷
                    <span className="num ml-1 text-qty text-ink-600">
                      {s.incoming > 0 ? `+${fmtQty(s.incoming)}` : '0'}
                    </span>
                  </span>
                  {r.warehouseId && <span className="ml-1">{warehouseName(r.warehouseId)}</span>}
                </span>
                <StockGauge
                  onHand={s.onHand}
                  allocated={s.allocated}
                  incoming={s.incoming}
                  reorderPoint={s.reorderPoint}
                  safetyStock={s.safetyStock}
                  excessLine={r.excessLine}
                  unit={r.item.baseUnit}
                  className="w-full"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
