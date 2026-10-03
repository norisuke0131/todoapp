// 絞り込み条件を URL クエリに書き出し・読み戻す（FR-205）
// 例：?q=ボトル&f=status.in.stockout~below_reorder&f=available.lte.10&s=available.asc~sku.desc&cols=sku~name
import type { Filter, FilterOperator } from '@/lib/types'
import type { QueryState, SortSpec } from './types'

const OPS: FilterOperator[] = ['eq', 'contains', 'gte', 'lte', 'between', 'in', 'isEmpty']
const SEP = '~'

function encodeValue(f: Filter): string {
  if (f.operator === 'isEmpty') return ''
  if (Array.isArray(f.value)) return f.value.map((v) => String(v ?? '')).join(SEP)
  return String(f.value ?? '')
}

function decodeValue(op: FilterOperator, raw: string): unknown {
  if (op === 'isEmpty') return null
  if (op === 'in' || op === 'between') return raw.split(SEP)
  return raw
}

export function toSearchParams(state: QueryState): URLSearchParams {
  const p = new URLSearchParams()
  if (state.viewId) p.set('view', state.viewId)
  if (state.q) p.set('q', state.q)
  for (const f of state.filters) p.append('f', `${f.field}.${f.operator}.${encodeValue(f)}`)
  if (state.sort.length) p.set('s', state.sort.map((s) => `${s.field}.${s.dir}`).join(SEP))
  if (state.columns?.length) p.set('cols', state.columns.join(SEP))
  return p
}

export function fromSearchParams(p: URLSearchParams): QueryState {
  const filters: Filter[] = []
  for (const raw of p.getAll('f')) {
    const [field, op, ...rest] = raw.split('.')
    if (!field || !op || !OPS.includes(op as FilterOperator)) continue // 壊れた条件は捨てる
    filters.push({
      field,
      operator: op as FilterOperator,
      value: decodeValue(op as FilterOperator, rest.join('.')),
    })
  }
  const sort: SortSpec[] = (p.get('s') ?? '')
    .split(SEP)
    .filter(Boolean)
    .flatMap((x) => {
      const [field, dir] = x.split('.')
      return field && (dir === 'asc' || dir === 'desc') ? [{ field, dir }] : []
    })
  const cols = p.get('cols')
  return {
    q: p.get('q') ?? '',
    filters,
    sort,
    columns: cols ? cols.split(SEP).filter(Boolean) : undefined,
    viewId: p.get('view') ?? undefined,
  }
}
