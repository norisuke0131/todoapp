// 在庫一覧（SC-010）の項目定義。絞り込み・並べ替え・CSV出力が同じ定義を使う
import type { StockRow } from '@/lib/repo/stock'
import type { FieldDef } from './types'

export type StockState = 'stockout' | 'below_reorder' | 'normal' | 'excess' | 'idle' | 'expiring'

export const STOCK_STATE_LABEL: Record<StockState, string> = {
  stockout: '欠品',
  below_reorder: '発注点以下',
  normal: '適正',
  excess: '過剰',
  idle: '滞留',
  expiring: '期限間近',
}

/** 在庫状態のタグ（FR-204）。状態に加え、滞留・期限間近を重ねて持つ */
export function stockStates(row: StockRow, idleDays: number): StockState[] {
  const s = row.snapshot
  const tags: StockState[] = [s.status]
  if (s.onHand > 0 && (s.idleDays ?? 0) >= idleDays) tags.push('idle')
  if ((s.expiringQty ?? 0) > 0) tags.push('expiring')
  return tags
}

export function stockFields(opts: {
  idleDays: number
  categories: { id: string; name: string }[]
  warehouses: { id: string; name: string }[]
}): FieldDef<StockRow>[] {
  const n = (
    key: string,
    label: string,
    get: (r: StockRow) => number | undefined,
    optional = false,
  ): FieldDef<StockRow> => ({
    key,
    label,
    type: 'number',
    accessor: get,
    optional,
  })
  return [
    { key: 'sku', label: 'SKU', type: 'text', accessor: (r) => r.item.sku },
    { key: 'name', label: '商品名', type: 'text', accessor: (r) => r.item.name },
    { key: 'jan', label: 'JAN', type: 'text', accessor: (r) => r.item.jan },
    {
      key: 'category',
      label: 'カテゴリ',
      type: 'enum',
      accessor: (r) => r.item.categoryId,
      options: opts.categories.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      key: 'warehouse',
      label: '拠点',
      type: 'enum',
      accessor: (r) => r.warehouseId,
      options: opts.warehouses.map((w) => ({ value: w.id, label: w.name })),
      optional: true,
    },
    {
      key: 'state',
      label: '在庫状態',
      type: 'tags',
      accessor: (r) => stockStates(r, opts.idleDays),
      options: (Object.keys(STOCK_STATE_LABEL) as StockState[]).map((v) => ({
        value: v,
        label: STOCK_STATE_LABEL[v],
      })),
    },
    n('onHand', '実在庫', (r) => r.snapshot.onHand),
    n('allocated', '引当済', (r) => r.snapshot.allocated),
    n('available', '有効在庫', (r) => r.snapshot.available),
    n('incoming', '入荷予定', (r) => r.snapshot.incoming),
    n('inTransit', 'うち移動中', (r) => r.snapshot.inTransit),
    n('reorderPoint', '発注点', (r) => r.snapshot.reorderPoint),
    n('safetyStock', '安全在庫', (r) => r.snapshot.safetyStock),
    {
      key: 'abcClass',
      label: 'ABC',
      type: 'enum',
      accessor: (r) => r.item.abcClass,
      options: ['A', 'B', 'C'].map((v) => ({ value: v, label: v })),
    },
    n('unitCost', '原価', (r) => r.snapshot.unitCost, true),
    n('stockValue', '在庫金額', (r) => r.snapshot.stockValue, true),
    n('idleDays', '最終出庫からの日数', (r) => r.snapshot.idleDays),
    { key: 'lastShippedAt', label: '最終出庫日', type: 'date', accessor: (r) => r.snapshot.lastShippedAt },
    {
      key: 'nearestExpiryDate',
      label: '最短の期限',
      type: 'date',
      accessor: (r) => r.snapshot.nearestExpiryDate,
    },
    n('expiringQty', '期限間近の数量', (r) => r.snapshot.expiringQty),
  ]
}
