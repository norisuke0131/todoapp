// 水位バーのホバー／フォーカスで4つの在庫数を出す
// ★ 一覧の全行に置くので、ポップアップの部品は使わず CSS だけで出す（スクロールを重くしない / NFR-06）
// 読み上げは水位バー自身の aria-label が担うため、この吹き出しは視覚用
import type { ReactNode } from 'react'
import { fmtQty } from '@/lib/utils/format'
import type { GaugeValues } from './scale'

export function GaugeTooltip({
  children,
  values,
  unit = '',
}: {
  children: ReactNode
  values: GaugeValues
  unit?: string
}) {
  const rows: [string, number][] = [
    ['実在庫', values.onHand],
    ['引当済', values.allocated],
    ['有効在庫', values.onHand - values.allocated],
    ['入荷予定', values.incoming],
    ['発注点', values.reorderPoint],
  ]
  return (
    <span tabIndex={0} className="group/tip relative inline-flex items-center py-1.5 outline-offset-4">
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink-900 px-2.5 py-1.5 text-[12px] leading-5 text-white shadow-pop group-hover/tip:block group-focus-visible/tip:block"
      >
        <span className="grid grid-cols-[auto_auto] gap-x-4">
          {rows.map(([k, v]) => (
            <span key={k} className="contents">
              <span className="text-white/75">{k}</span>
              <span className="num text-right">
                {fmtQty(v)}
                <span className="ml-0.5 text-[10px] font-normal text-white/75">{unit}</span>
              </span>
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}
