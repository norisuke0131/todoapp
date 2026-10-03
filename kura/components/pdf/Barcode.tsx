// PDF 用の Code 128 バーコード（lib/scan/code128 の幅の並びを矩形にする）
import { Rect, Svg } from '@react-pdf/renderer'
import { code128B } from '@/lib/scan/code128'

export function PdfBarcode({
  value,
  width = 120,
  height = 26,
}: {
  value: string
  width?: number
  height?: number
}) {
  const widths = code128B(value)
  const total = widths.reduce((a, b) => a + b, 0)
  const unit = width / total
  let x = 0
  const bars = widths.map((w, i) => {
    const r =
      i % 2 === 0 ? <Rect key={i} x={x * unit} y={0} width={w * unit} height={height} fill="#10161C" /> : null
    x += w
    return r
  })
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {bars}
    </Svg>
  )
}
