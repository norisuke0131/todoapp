// ★ 在庫水位バー（8章 主要コンポーネント・最重要）
//
// 目盛の地の上に、左から「有効在庫（塗り）→ 引当済（斜線）→ 入荷予定（淡色）」を積む。
// 引当済は実在庫の一部なので、塗りの右端を斜線にする（＝棚にはあるが売れない部分）。
// 発注点にアンバー、安全在庫に赤の縦線。数値は必ず別途テキストでも表示する（A11Y-05）
import { cn } from '@/lib/utils/cn'
import { gaugeLabel, gaugeMax, pct, type GaugeValues } from './scale'

type Props = GaugeValues & {
  size?: 'inline' | 'detail'
  /** 一覧で複数のバーの目盛りをそろえたいときに指定 */
  max?: number
  unit?: string
  className?: string
}

export function StockGauge({ size = 'inline', max, unit = '', className, ...g }: Props) {
  const m = max ?? gaugeMax(g)
  const onHand = Math.max(0, g.onHand)
  const available = Math.max(0, Math.min(onHand, g.onHand - g.allocated))
  const allocatedVisible = onHand - available
  const incoming = Math.max(0, g.incoming)
  const detail = size === 'detail'

  return (
    <div
      role="img"
      aria-label={gaugeLabel(g, unit)}
      className={cn('relative shrink-0', detail ? 'h-[14px] w-full' : 'h-[6px] w-[120px]', className)}
    >
      <div className="absolute inset-0 bg-gauge-track" />
      {/* 有効在庫（塗り） */}
      <div
        className="absolute inset-y-0 left-0 bg-gauge-onhand transition-[width] duration-400 ease-out"
        style={{ width: pct(available, m) }}
      />
      {/* 引当済（斜線）：実在庫のうち、売れない部分 */}
      <div
        className={cn(
          'absolute inset-y-0 transition-[left,width] duration-400 ease-out',
          detail ? 'hatch-allocated-lg' : 'hatch-allocated',
        )}
        style={{ left: pct(available, m), width: pct(allocatedVisible, m) }}
      />
      {/* 入荷予定（淡色）：実在庫の先に積む */}
      <div
        className="absolute inset-y-0 bg-gauge-incoming transition-[left,width] duration-400 ease-out"
        style={{ left: pct(onHand, m), width: pct(incoming, m) }}
      />
      {/* 目盛りを超えている印 */}
      {g.onHand + incoming > m && (
        <span
          aria-hidden
          className={cn(
            'absolute right-0 top-1/2 -translate-y-1/2 translate-x-full border-y-transparent border-l-ink-600',
            detail ? 'border-y-[7px] border-l-[7px]' : 'border-y-[4px] border-l-[5px]',
          )}
        />
      )}
      {/* 安全在庫ライン（赤）・発注点ライン（アンバー） */}
      <Tick at={pct(g.safetyStock, m)} className="bg-gauge-safety" detail={detail} />
      <Tick at={pct(g.reorderPoint, m)} className="bg-gauge-reorder" detail={detail} />
    </div>
  )
}

function Tick({ at, className, detail }: { at: string; className: string; detail: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'absolute w-[2px] -translate-x-1/2',
        detail ? '-inset-y-[5px]' : '-inset-y-[3px]',
        className,
      )}
      style={{ left: at }}
    />
  )
}
