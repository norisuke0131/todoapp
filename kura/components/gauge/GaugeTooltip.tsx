'use client'
// 水位バーのホバー／フォーカスで4つの在庫数を出す
import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex items-center py-1.5 outline-offset-4">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-white/75">{k}</dt>
              <dd className="num text-right">
                {fmtQty(v)}
                <span className="ml-0.5 text-[10px] font-normal text-white/75">{unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  )
}
