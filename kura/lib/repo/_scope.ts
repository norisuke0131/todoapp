// ★ データスコープ（見える行）と項目スコープ（見える列）をここに集約する（SCP-01, FR-707）
//
// 実案件では、この関数群がサーバー側の権限制御・RLS（行レベルセキュリティ）に置き換わる。
// コンポーネントは role を見て分岐しない（SCP-02）。can() と、ここで整形済みのデータだけを使う。
// 原価・在庫金額・粗利は、権限がなければ「キーごと」取り除いて返す（SCP-03, FR-708）。

import type {
  Item,
  PurchaseOrder,
  Role,
  StockSnapshot,
  Stocktake,
  Transaction,
  User,
  Warehouse,
} from '@/lib/types'

// ---------------------------------------------------------------------------
// 権限（4章の権限マトリクス）
// ---------------------------------------------------------------------------

export type Permission =
  | 'stock.viewAllWarehouses' // 在庫照会（全拠点）
  | 'cost.view' // 原価・在庫金額の閲覧
  | 'txn.inout' // 入庫・出庫・棚間移動
  | 'allocation.write' // 引当の作成・解除
  | 'transfer.create' // 拠点間移動の起票（staff は自拠点発のみ）
  | 'adjust.write' // 在庫調整
  | 'txn.reverse' // 取消（逆仕訳）
  | 'stocktake.count' // 棚卸のカウント入力
  | 'stocktake.start' // 棚卸の開始
  | 'stocktake.approve' // 棚卸の承認
  | 'po.write' // 発注の登録・発注書出力
  | 'master.write' // 商品・発注点マスタの編集
  | 'view.share' // 共有ビューの作成
  | 'analytics.view' // 分析（金額を含む）
  | 'admin.access' // ユーザー権限・拠点設定・操作ログ

const MATRIX: Record<Permission, Role[]> = {
  'stock.viewAllWarehouses': ['keeper', 'admin'],
  'cost.view': ['keeper', 'admin'],
  'txn.inout': ['staff', 'keeper', 'admin'],
  'allocation.write': ['keeper', 'admin'],
  'transfer.create': ['staff', 'keeper', 'admin'],
  'adjust.write': ['keeper', 'admin'],
  'txn.reverse': ['keeper', 'admin'],
  'stocktake.count': ['staff', 'keeper', 'admin'],
  'stocktake.start': ['keeper', 'admin'],
  'stocktake.approve': ['keeper', 'admin'],
  'po.write': ['keeper', 'admin'],
  'master.write': ['keeper', 'admin'],
  'view.share': ['keeper', 'admin'],
  'analytics.view': ['keeper', 'admin'],
  'admin.access': ['admin'],
}

/** 権限がないときにボタンのツールチップへ出す理由（FR-712） */
export const DENY_REASON: Record<Permission, string> = {
  'stock.viewAllWarehouses': '全拠点の在庫は在庫管理者以上が閲覧できます',
  'cost.view': '原価と在庫金額は在庫管理者以上が閲覧できます',
  'txn.inout': '入出庫を登録する権限がありません',
  'allocation.write': '引当は在庫管理者以上が作成・解除できます',
  'transfer.create': '担当拠点から出す移動のみ起票できます',
  'adjust.write': '在庫調整は在庫管理者以上が行えます',
  'txn.reverse': '取消は在庫管理者以上が行えます',
  'stocktake.count': 'カウントを入力する権限がありません',
  'stocktake.start': '棚卸の開始は在庫管理者以上が行えます',
  'stocktake.approve': '棚卸の承認は在庫管理者以上が行えます',
  'po.write': '発注は在庫管理者以上が登録できます',
  'master.write': 'マスタの編集は在庫管理者以上が行えます',
  'view.share': '共有ビューは在庫管理者以上が作成できます',
  'analytics.view': '金額を含む分析は在庫管理者以上が閲覧できます',
  'admin.access': '設定と操作ログは管理者のみが利用できます',
}

// ---------------------------------------------------------------------------
// スコープの解決
// ---------------------------------------------------------------------------

export type Scope = {
  userId: string
  userName: string
  role: Role
  /** 見えてよい拠点 */
  warehouseIds: string[]
  /** 全拠点が見えるか（一覧を「全拠点合計」で返すか） */
  allWarehouses: boolean
  can(p: Permission, ctx?: { warehouseId?: string; fromWarehouseId?: string }): boolean
}

export type SessionInput = { role: Role; staffWarehouseId: string }

/** デモのロールから、操作する利用者と見える範囲を決める */
export function resolveScope(session: SessionInput, users: User[], warehouses: Warehouse[]): Scope {
  const active = users.filter((u) => u.isActive && u.role === session.role)
  const user =
    session.role === 'staff'
      ? (active.find((u) => u.warehouseIds.includes(session.staffWarehouseId)) ?? active[0])
      : active[0]
  if (!user) throw new Error(`ロール ${session.role} の利用者がいません`)

  const all = MATRIX['stock.viewAllWarehouses'].includes(user.role)
  const warehouseIds = all
    ? warehouses.filter((w) => w.isActive).map((w) => w.id)
    : user.warehouseIds.filter((id) => id === session.staffWarehouseId || session.role !== 'staff')

  return {
    userId: user.id,
    userName: user.name,
    role: user.role,
    warehouseIds,
    allWarehouses: all,
    can(p, ctx) {
      if (!MATRIX[p].includes(user.role)) return false
      // 拠点に紐づく操作は、見える拠点の中だけ
      if (ctx?.warehouseId && !warehouseIds.includes(ctx.warehouseId)) return false
      // 現場担当の拠点間移動は「自拠点発のみ」（4章 △）
      if (
        p === 'transfer.create' &&
        !all &&
        ctx?.fromWarehouseId &&
        !warehouseIds.includes(ctx.fromWarehouseId)
      ) {
        return false
      }
      return true
    },
  }
}

// ---------------------------------------------------------------------------
// データスコープ（見える行）
// ---------------------------------------------------------------------------

export function canSeeWarehouse(scope: Scope, warehouseId: string | undefined): boolean {
  return warehouseId === undefined ? scope.allWarehouses : scope.warehouseIds.includes(warehouseId)
}

export function filterByWarehouse<T>(
  scope: Scope,
  rows: T[],
  warehouseOf: (row: T) => string | undefined,
): T[] {
  return rows.filter((r) => canSeeWarehouse(scope, warehouseOf(r)))
}

// ---------------------------------------------------------------------------
// 項目スコープ（見える列）。★ CSS で隠すのではなく、キーごと取り除く（SCP-03）
// ---------------------------------------------------------------------------

export type ScopedItem = Omit<Item, 'cost'> & { cost?: number }
export type ScopedSnapshot = Omit<StockSnapshot, 'unitCost' | 'stockValue'> & {
  unitCost?: number
  stockValue?: number
}
export type ScopedTransaction = Omit<Transaction, 'unitCost'> & { unitCost?: number }
export type ScopedPurchaseOrder = Omit<PurchaseOrder, 'lines'> & {
  lines: (Omit<PurchaseOrder['lines'][number], 'unitCost'> & { unitCost?: number })[]
}
export type ScopedStocktake = Omit<Stocktake, 'lines'> & {
  lines: (Omit<Stocktake['lines'][number], 'varianceAmount'> & { varianceAmount?: number })[]
}

const canCost = (scope: Scope) => scope.can('cost.view')

export function scopeItem(scope: Scope, item: Item): ScopedItem {
  if (canCost(scope)) return item
  const { cost: _cost, ...rest } = item
  return rest
}

export function scopeSnapshot(scope: Scope, s: StockSnapshot): ScopedSnapshot {
  if (canCost(scope)) return s
  const { unitCost: _u, stockValue: _v, ...rest } = s
  return rest
}

export function scopeTransaction(scope: Scope, t: Transaction): ScopedTransaction {
  if (canCost(scope)) return t
  const { unitCost: _u, ...rest } = t
  return rest
}

export function scopePurchaseOrder(scope: Scope, po: PurchaseOrder): ScopedPurchaseOrder {
  if (canCost(scope)) return po
  return { ...po, lines: po.lines.map(({ unitCost: _u, ...l }) => l) }
}

export function scopeStocktake(scope: Scope, st: Stocktake): ScopedStocktake {
  if (canCost(scope)) return st
  return { ...st, lines: st.lines.map(({ varianceAmount: _a, ...l }) => l) }
}

/** 金額を含む集計値を、権限がなければ取り除く */
export function scopeMoney<T extends object, K extends keyof T>(
  scope: Scope,
  obj: T,
  keys: K[],
): Omit<T, K> & Partial<Pick<T, K>> {
  if (canCost(scope)) return obj
  const out = { ...obj }
  for (const k of keys) delete out[k]
  return out
}
