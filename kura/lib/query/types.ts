// 一覧の絞り込み・並べ替え・表示列（FR-202〜FR-207）
import type { Filter, FilterOperator } from '@/lib/types'

export type { Filter, FilterOperator }
export type SortSpec = { field: string; dir: 'asc' | 'desc' }

export type FieldType = 'text' | 'number' | 'date' | 'enum' | 'tags'

/** 一覧の1項目の定義。accessor は行から値を取り出す純粋関数 */
export type FieldDef<Row> = {
  key: string
  label: string
  type: FieldType
  accessor: (row: Row) => unknown
  /** enum / tags の選択肢 */
  options?: { value: string; label: string }[]
  /** 権限によって存在しない列（原価など）。行に値がなければ列ごと出さない */
  optional?: boolean
}

export type QueryState = {
  q: string
  filters: Filter[]
  sort: SortSpec[]
  columns?: string[]
  viewId?: string
}

export const EMPTY_QUERY: QueryState = { q: '', filters: [], sort: [] }

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  eq: '等しい',
  contains: '含む',
  gte: '以上',
  lte: '以下',
  between: '期間',
  in: 'いずれか',
  isEmpty: '空である',
}
