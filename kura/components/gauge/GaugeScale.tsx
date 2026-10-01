// 詳細サイズの水位バー用の目盛り（区間：欠品リスク／発注点まで／適正／過剰）
import { cn } from '@/lib/utils/cn'
import { gaugeMax, pct, type GaugeValues } from './scale'

export function GaugeZones({ max, className, ...g }: GaugeValues & { max?: number; className?: string }) {
  const m = max ?? gaugeMax(g)
  const zones = [
    { from: 0, to: g.safetyStock, label: '欠品', tone: 'text-st-ink-stockout' },
    { from: g.safetyStock, to: g.reorderPoint, label: '要発注', tone: 'text-st-ink-low' },
    { from: g.reorderPoint, to: g.excessLine, label: '適正', tone: 'text-ink-600' },
    { from: g.excessLine, to: m, label: '過剰', tone: 'text-st-ink-excess' },
  ].filter((z) => z.to > z.from)
  // 狭い区間はラベルを出さない（区切り線と凡例で読める）
  const wide = (z: { from: number; to: number }) => (z.to - z.from) / m >= 0.12
  return (
    <div aria-hidden className={cn('relative h-5 w-full', className)}>
      {zones.map((z) => (
        <div
          key={z.label}
          className="absolute inset-y-0 flex items-end overflow-hidden border-l border-line-hi pl-1.5"
          style={{ left: pct(z.from, m), width: pct(z.to - z.from, m) }}
        >
          {wide(z) && (
            <span
              className={cn('whitespace-nowrap text-[10px] font-bold leading-4 tracking-[0.05em]', z.tone)}
            >
              {z.label}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export function GaugeAxis({ max, className, ...g }: GaugeValues & { max?: number; className?: string }) {
  const m = max ?? gaugeMax(g)
  const marks = [0, g.safetyStock, g.reorderPoint, g.excessLine, m]
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a - b)
  return (
    <div aria-hidden className={cn('relative h-4 w-full', className)}>
      {marks.map((v, i) => (
        <span
          key={v}
          className={cn(
            'num absolute top-0 text-[11px] leading-4 text-ink-500',
            i === 0 ? 'translate-x-0' : i === marks.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
          )}
          style={{ left: pct(v, m) }}
        >
          {v}
        </span>
      ))}
    </div>
  )
}
