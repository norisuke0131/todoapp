import { describe, expect, it } from 'vitest'
import { applyFilters, applySort, toggleSort } from './apply'
import { fromSearchParams, toSearchParams } from './url'
import type { FieldDef, QueryState } from './types'

type Row = { sku: string; name: string; qty: number; date?: string; tags: string[] }
const rows: Row[] = [
  {
    sku: 'SKU-1042',
    name: 'ステンレスボトル 500ml マット黒',
    qty: 120,
    date: '2026-10-20',
    tags: ['normal'],
  },
  { sku: 'SKU-2011', name: '替えキャップ 黒（500ml用）', qty: 12, tags: ['below_reorder'] },
  {
    sku: 'SKU-4001',
    name: 'デュラム小麦パスタ 1.6mm 500g',
    qty: 0,
    date: '2026-09-30',
    tags: ['stockout', 'expiring'],
  },
  { sku: 'SKU-3005', name: 'ひのきまな板 中', qty: 300, tags: ['excess', 'idle'] },
]
const fields: FieldDef<Row>[] = [
  { key: 'sku', label: 'SKU', type: 'text', accessor: (r) => r.sku },
  { key: 'name', label: '商品名', type: 'text', accessor: (r) => r.name },
  { key: 'qty', label: '数量', type: 'number', accessor: (r) => r.qty },
  { key: 'date', label: '期限', type: 'date', accessor: (r) => r.date },
  { key: 'state', label: '状態', type: 'tags', accessor: (r) => r.tags },
]
const skus = (r: Row[]) => r.map((x) => x.sku)

describe('絞り込み（FR-203, FR-204）', () => {
  it('等しい／含む／以上／以下／期間／空である／いずれか', () => {
    expect(skus(applyFilters(rows, [{ field: 'qty', operator: 'eq', value: '12' }], fields))).toEqual([
      'SKU-2011',
    ])
    expect(
      skus(applyFilters(rows, [{ field: 'name', operator: 'contains', value: '500ML' }], fields)),
    ).toEqual(['SKU-1042', 'SKU-2011'])
    expect(skus(applyFilters(rows, [{ field: 'qty', operator: 'gte', value: 120 }], fields))).toEqual([
      'SKU-1042',
      'SKU-3005',
    ])
    expect(skus(applyFilters(rows, [{ field: 'qty', operator: 'lte', value: 12 }], fields))).toEqual([
      'SKU-2011',
      'SKU-4001',
    ])
    expect(
      skus(
        applyFilters(
          rows,
          [{ field: 'date', operator: 'between', value: ['2026-10-01', '2026-10-31'] }],
          fields,
        ),
      ),
    ).toEqual(['SKU-1042'])
    expect(skus(applyFilters(rows, [{ field: 'date', operator: 'isEmpty', value: null }], fields))).toEqual([
      'SKU-2011',
      'SKU-3005',
    ])
  })

  it('★ 在庫状態はタグのいずれかに一致すれば残す（滞留・期限間近は状態と重なる）', () => {
    expect(
      skus(applyFilters(rows, [{ field: 'state', operator: 'in', value: ['stockout', 'idle'] }], fields)),
    ).toEqual(['SKU-4001', 'SKU-3005'])
    expect(
      skus(applyFilters(rows, [{ field: 'state', operator: 'in', value: ['expiring'] }], fields)),
    ).toEqual(['SKU-4001'])
  })

  it('複数条件は AND。キーワードは全角半角・大小を無視して文字列の項目を横断する', () => {
    const r = applyFilters(rows, [{ field: 'qty', operator: 'gte', value: 1 }], fields, 'ｓｋｕ-20')
    expect(skus(r)).toEqual(['SKU-2011'])
    expect(skus(applyFilters(rows, [], fields, 'ボトル'))).toEqual(['SKU-1042'])
  })

  it('知らない項目の条件は無視する（壊れた URL で一覧が空にならない）', () => {
    expect(applyFilters(rows, [{ field: 'nope', operator: 'eq', value: 1 }], fields)).toHaveLength(4)
  })
})

describe('並べ替え', () => {
  it('複数列・安定・空の値は最後', () => {
    expect(skus(applySort(rows, [{ field: 'date', dir: 'asc' }], fields))).toEqual([
      'SKU-4001',
      'SKU-1042',
      'SKU-2011',
      'SKU-3005',
    ])
    expect(skus(applySort(rows, [{ field: 'date', dir: 'desc' }], fields))).toEqual([
      'SKU-1042',
      'SKU-4001',
      'SKU-2011',
      'SKU-3005',
    ])
    expect(skus(applySort(rows, [{ field: 'qty', dir: 'desc' }], fields))).toEqual([
      'SKU-3005',
      'SKU-1042',
      'SKU-2011',
      'SKU-4001',
    ])
  })

  it('見出しクリック：昇順→降順→解除。Shift で列を追加', () => {
    let s = toggleSort([], 'qty', false)
    expect(s).toEqual([{ field: 'qty', dir: 'asc' }])
    s = toggleSort(s, 'qty', false)
    expect(s).toEqual([{ field: 'qty', dir: 'desc' }])
    s = toggleSort(s, 'sku', true)
    expect(s).toEqual([
      { field: 'qty', dir: 'desc' },
      { field: 'sku', dir: 'asc' },
    ])
    s = toggleSort(s, 'qty', true)
    expect(s).toEqual([{ field: 'sku', dir: 'asc' }])
  })

  it('620行×条件3つの絞り込み＋並べ替えが 100ms 以下（NFR-05）', () => {
    const big = Array.from({ length: 620 }, (_, i) => ({
      ...rows[i % 4]!,
      sku: `SKU-${i}`,
      qty: (i * 37) % 500,
    }))
    const t0 = performance.now()
    for (let k = 0; k < 10; k++) {
      applySort(
        applyFilters(
          big,
          [
            { field: 'qty', operator: 'gte', value: 10 },
            { field: 'state', operator: 'in', value: ['normal', 'excess'] },
          ],
          fields,
          'ボトル',
        ),
        [{ field: 'qty', dir: 'desc' }],
        fields,
      )
    }
    expect((performance.now() - t0) / 10).toBeLessThan(100)
  })
})

describe('URL への保存（FR-205）', () => {
  it('書き出して読み戻すと同じ条件になる', () => {
    const state: QueryState = {
      q: 'ボトル 黒',
      viewId: 'view-reorder',
      filters: [
        { field: 'state', operator: 'in', value: ['stockout', 'below_reorder'] },
        { field: 'qty', operator: 'lte', value: '10' },
        {
          field: 'date',
          operator: 'between',
          value: ['2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.999Z'],
        },
        { field: 'date', operator: 'isEmpty', value: null },
      ],
      sort: [
        { field: 'qty', dir: 'asc' },
        { field: 'sku', dir: 'desc' },
      ],
      columns: ['sku', 'name', 'qty'],
    }
    const url = toSearchParams(state).toString()
    expect(fromSearchParams(new URLSearchParams(url))).toEqual(state)
  })

  it('壊れた条件は捨てる', () => {
    const s = fromSearchParams(new URLSearchParams('f=qty.bogus.1&f=..&s=qty.sideways'))
    expect(s.filters).toEqual([])
    expect(s.sort).toEqual([])
  })
})
