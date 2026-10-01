// 詳細サイズの水位計：区間 → バー → 目盛り → 凡例
import { StockGauge } from './StockGauge'
import { GaugeAxis, GaugeZones } from './GaugeScale'
import { gaugeMax, type GaugeValues } from './scale'

export function GaugePanel({ unit = '', ...g }: GaugeValues & { unit?: string }) {
  const max = gaugeMax(g)
  return (
    <div>
      <GaugeZones {...g} max={max} />
      <StockGauge {...g} size="detail" max={max} unit={unit} className="mt-1.5" />
      <GaugeAxis {...g} max={max} className="mt-2" />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-600">
        <Legend swatch={<span className="block size-3 bg-gauge-onhand" />}>有効在庫</Legend>
        <Legend swatch={<span className="hatch-allocated-lg block size-3" />}>
          引当済（棚にあるが売れない）
        </Legend>
        <Legend swatch={<span className="block size-3 bg-gauge-incoming" />}>入荷予定</Legend>
        <Legend swatch={<span className="block h-3 w-[2px] bg-gauge-reorder" />}>発注点</Legend>
        <Legend swatch={<span className="block h-3 w-[2px] bg-gauge-safety" />}>安全在庫</Legend>
      </ul>
    </div>
  )
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className="grid size-3 place-items-center">
        {swatch}
      </span>
      {children}
    </li>
  )
}
