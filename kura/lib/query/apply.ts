// 絞り込みと並べ替え（純粋関数）。620行×数条件で数ms
import type { Filter } from '@/lib/types'
import type { FieldDef, SortSpec } from './types'

/** 全角半角・大文字小文字の違いを無視して比べる */
export function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase()
}

const isEmptyValue = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function compareAny(a: unknown, b: unknown): number {
  const na = toNumber(a)
  const nb = toNumber(b)
  if (na !== undefined && nb !== undefined) return na - nb
  return String(a).localeCompare(String(b), 'ja')
}

export function matchFilter(value: unknown, f: Filter): boolean {
  switch (f.operator) {
    case 'isEmpty':
      return isEmptyValue(value)
    case 'eq':
      return Array.isArray(value) ? value.includes(f.value) : compareAny(value, f.value) === 0
    case 'contains':
      return !isEmptyValue(value) && normalize(String(value)).includes(normalize(String(f.value ?? '')))
    case 'gte':
      return !isEmptyValue(value) && compareAny(value, f.value) >= 0
    case 'lte':
      return !isEmptyValue(value) && compareAny(value, f.value) <= 0
    case 'between': {
      if (isEmptyValue(value) || !Array.isArray(f.value)) return false
      const [from, to] = f.value as unknown[]
      return (
        (isEmptyValue(from) || compareAny(value, from) >= 0) &&
        (isEmptyValue(to) || compareAny(value, to) <= 0)
      )
    }
    case 'in': {
      const set = Array.isArray(f.value) ? f.value : [f.value]
      if (set.length === 0) return true
      return Array.isArray(value) ? value.some((v) => set.includes(v)) : set.includes(value)
    }
  }
}

export function applyFilters<Row>(rows: Row[], filters: Filter[], fields: FieldDef<Row>[], q = ''): Row[] {
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const active = filters.filter((f) => byKey.has(f.field))
  const needle = normalize(q.trim())
  const textFields = fields.filter((f) => f.type === 'text')
  if (active.length === 0 && !needle) return rows
  return rows.filter((row) => {
    if (needle && !textFields.some((f) => normalize(String(f.accessor(row) ?? '')).includes(needle)))
      return false
    return active.every((f) => matchFilter(byKey.get(f.field)!.accessor(row), f))
  })
}

/** 複数列の安定ソート。空の値は向きにかかわらず最後 */
export function applySort<Row>(rows: Row[], sort: SortSpec[], fields: FieldDef<Row>[]): Row[] {
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const specs = sort.filter((s) => byKey.has(s.field))
  if (specs.length === 0) return rows
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      for (const s of specs) {
        const acc = byKey.get(s.field)!.accessor
        const va = acc(a.row)
        const vb = acc(b.row)
        const ea = isEmptyValue(va)
        const eb = isEmptyValue(vb)
        if (ea !== eb) return ea ? 1 : -1
        if (ea) continue
        const c = compareAny(va, vb)
        if (c !== 0) return s.dir === 'asc' ? c : -c
      }
      return a.i - b.i
    })
    .map((x) => x.row)
}

/** 見出しクリックでの並び替え。Shift なら複数列に追加する */
export function toggleSort(sort: SortSpec[], field: string, multi: boolean): SortSpec[] {
  const cur = sort.find((s) => s.field === field)
  const next: SortSpec | undefined = !cur
    ? { field, dir: 'asc' }
    : cur.dir === 'asc'
      ? { field, dir: 'desc' }
      : undefined
  if (!multi) return next ? [next] : []
  const rest = sort.filter((s) => s.field !== field)
  return next ? (cur ? sort.map((s) => (s.field === field ? next : s)) : [...rest, next]) : rest
}
