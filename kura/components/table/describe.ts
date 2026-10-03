// 条件チップの文言：「在庫状態：欠品・発注点以下」「有効在庫 10 以下」
import type { Filter } from '@/lib/types'
import type { FieldDef } from '@/lib/query'
import { fmtDate } from '@/lib/utils/format'

export function describeFilter<Row>(f: Filter, fields: FieldDef<Row>[]): string {
  const def = fields.find((x) => x.key === f.field)
  const label = def?.label ?? f.field
  const show = (v: unknown) => {
    const s = String(v ?? '')
    const opt = def?.options?.find((o) => o.value === s)
    if (opt) return opt.label
    if (def?.type === 'date' && s) return fmtDate(s)
    return s
  }
  switch (f.operator) {
    case 'isEmpty':
      return `${label}が空`
    case 'in':
      return `${label}：${(Array.isArray(f.value) ? f.value : [f.value]).map(show).join('・')}`
    case 'eq':
      return `${label}：${show(f.value)}`
    case 'contains':
      return `${label}に「${show(f.value)}」を含む`
    case 'gte':
      return `${label} ${show(f.value)} 以上`
    case 'lte':
      return `${label} ${show(f.value)} 以下`
    case 'between': {
      const [a, b] = Array.isArray(f.value) ? f.value : []
      return `${label} ${a ? show(a) : ''}〜${b ? show(b) : ''}`
    }
  }
}
