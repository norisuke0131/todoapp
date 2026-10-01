// KURA のドメイン型（CLAUDE.md 7章）
// ★ 在庫数量を持つ型はない。在庫は常にトランザクションから算出する（INV-01）

// ---- 組織・ユーザー ----
export type StorageCondition = 'normal' | 'chilled' | 'frozen'
export type Role = 'staff' | 'keeper' | 'admin'

export type Warehouse = { id: string; code: string; name: string; address: string; isActive: boolean }

export type Location = {
  id: string
  warehouseId: string
  code: string // 'A-01-1'（エリア-列-段）
  area: string
  storageCondition: StorageCondition
  sortOrder: number // ★ ピッキングの巡回順
}

export type User = {
  id: string
  name: string
  role: Role
  warehouseIds: string[] // ★ 担当拠点。スコープ判定の起点
  isActive: boolean
}

// ---- マスタ ----
export type PackUnit = { name: string; qtyInBase: number }

export type Item = {
  id: string
  sku: string
  name: string
  jan?: string
  categoryId: string
  // --- 単位換算（FR-110） ---
  baseUnit: string
  packUnits: PackUnit[]
  // --- 原価・売価（★ 権限で出し入れする項目）---
  cost: number // 移動平均原価（円・小数第2位まで）
  price: number
  // --- 補充 ---
  reorderPoint: number
  safetyStock: number
  orderLot: number
  defaultSupplierId?: string
  leadTimeDays: number
  // --- 管理方式 ---
  isLotManaged: boolean
  isSerialManaged: boolean
  shelfLifeDays?: number
  storageCondition: StorageCondition
  abcClass?: 'A' | 'B' | 'C'
  isActive: boolean
}

export type Category = { id: string; name: string; expiryAlertDays: number; sortOrder: number }

export type Partner = {
  id: string
  kind: 'supplier' | 'customer'
  code: string
  name: string
  leadTimeDays: number
  minOrderAmount: number
}

export type ReasonCode = { id: string; kind: 'adjust' | 'variance'; name: string; sortOrder: number }

export type Lot = {
  id: string
  itemId: string
  lotNo: string
  receivedAt: string
  expiryDate?: string
  supplierId?: string
}

// ---- ★★★ トランザクション ★★★ ----
export type TxnType =
  | 'receive' // 入庫
  | 'ship' // 出庫
  | 'transfer_out' // 拠点間移動：出荷
  | 'transfer_in' // 拠点間移動：入荷
  | 'move' // 棚間移動
  | 'adjust' // 在庫調整
  | 'stocktake' // 棚卸差異（承認済みのみ生成）
  | 'opening' // 期首棚卸（FR-703）

export type Device = 'pc' | 'mobile' | 'scanner'

export type Transaction = {
  id: string
  seq: number // ★ 連番。メモ化の世代管理に使う（INV-04）
  type: TxnType
  itemId: string
  warehouseId: string
  locationId?: string
  lotId?: string
  qtyBase: number // ★ 常に最小単位。符号付き
  inputQty: number
  inputUnit: string
  unitCost?: number // 入庫時の単価（円）
  reasonCodeId?: string // ★ adjust / stocktake では必須
  refType?: 'purchase_order' | 'shipping_order' | 'transfer' | 'stocktake'
  refId?: string
  // --- 取消（FR-315）---
  // 「取消済」は逆仕訳の存在から導出する（元取引を書き換えない / INV-03）。
  // reversedByTxnId は型の互換のために残すが、ストアでは設定しない。
  reversedByTxnId?: string
  reversesTxnId?: string
  // --- 監査（FR-317）---
  userId: string
  device: Device
  occurredAt: string
  createdAt: string
  note: string
  syncState: 'synced' | 'pending'
}

/** 追加時に seq / id / createdAt を採番する前のトランザクション */
export type TransactionDraft = Omit<Transaction, 'id' | 'seq' | 'createdAt'>

// ---- 引当（★ 実在庫を動かさない）----
export type Allocation = {
  id: string
  itemId: string
  warehouseId: string
  lotId?: string
  qtyBase: number // 正の数
  refType: 'shipping_order'
  refId: string
  status: 'active' | 'released' | 'shipped'
  createdAt: string
  releasedAt?: string
}

// ---- 発注 / 入荷予定 ----
export type PurchaseOrderLine = {
  id: string
  itemId: string
  qtyBase: number
  receivedQtyBase: number // ★ 入荷予定 = qtyBase − receivedQtyBase
  unitCost: number
}

export type PurchaseOrder = {
  id: string
  code: string
  supplierId: string
  warehouseId: string
  status: 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled'
  orderedAt?: string
  expectedAt?: string // ★ 遅延判定の基準（FR-507）
  lines: PurchaseOrderLine[]
  createdAt: string
}

export type ShippingOrderLine = { id: string; itemId: string; qtyBase: number; shippedQtyBase: number }

export type ShippingOrder = {
  id: string
  code: string
  customerId: string
  warehouseId: string
  status: 'draft' | 'allocated' | 'picking' | 'shipped' | 'cancelled'
  shipBy?: string
  lines: ShippingOrderLine[]
  createdAt: string
}

export type TransferLine = { itemId: string; lotId?: string; qtyBase: number; receivedQtyBase: number }

export type Transfer = {
  id: string
  code: string
  fromWarehouseId: string
  toWarehouseId: string
  status: 'in_transit' | 'received' | 'cancelled'
  shippedAt: string
  receivedAt?: string
  lines: TransferLine[]
}

// ---- 棚卸 ----
export type StocktakeLine = {
  id: string
  itemId: string
  locationId?: string
  lotId?: string
  theoreticalQty: number // ★ 凍結時点の理論在庫
  countedQty?: number
  countedBy?: string
  countedAt?: string
  varianceQty?: number
  varianceAmount?: number
  reasonCodeId?: string // ★ 必須（FR-406）
  note: string
}

export type Stocktake = {
  id: string
  code: string
  warehouseId: string
  scope: { areas?: string[]; categoryIds?: string[] }
  status: 'counting' | 'reviewing' | 'approved' | 'cancelled'
  frozenAt: string // ★ 理論在庫を凍結した時刻（FR-401）
  assigneeIds: string[]
  lines: StocktakeLine[]
  approvedBy?: string
  approvedAt?: string
  createdAt: string
}

// ---- 在庫スナップショット（★ 保存しない。常に算出）----
export type StockStatus = 'stockout' | 'below_reorder' | 'normal' | 'excess'

export type StockSnapshot = {
  itemId: string
  warehouseId?: string // 未指定なら全拠点合計
  lotId?: string
  // ★ 4つの在庫数（FR-102, INV-06）
  onHand: number
  allocated: number
  available: number
  incoming: number // 入荷予定（発注残 + 移動中）
  inTransit: number // うち移動中
  reorderPoint: number
  safetyStock: number
  status: StockStatus
  // --- 金額（★ 権限がない場合は含めない。SCP-03）---
  unitCost?: number
  stockValue?: number
  // --- 滞留・期限 ---
  lastShippedAt?: string
  idleDays?: number
  nearestExpiryDate?: string
  expiringQty?: number
}

// ---- 分析（算出値。ストアに保存しない）----
export type TurnoverMetrics = {
  itemId: string
  shippedValue: number
  avgStockValue: number
  turnover: number
  idleDays: number
}
export type AbcClass = 'A' | 'B' | 'C'
export type AbcResult = { itemId: string; shippedValue: number; cumulativeRatio: number; abcClass: AbcClass }
export type VarianceSummary = {
  reasonCodeId: string
  count: number
  varianceQty: number
  varianceAmount: number
}

// ---- ビュー・監査 ----
export type FilterOperator = 'eq' | 'contains' | 'gte' | 'lte' | 'between' | 'in' | 'isEmpty'
export type Filter = { field: string; operator: FilterOperator; value: unknown }

export type SavedView = {
  id: string
  name: string
  target: 'stock' | 'transactions' | 'lots' | 'replenishment'
  ownerId: string
  isShared: boolean // keeper 以上のみ true にできる
  filters: Filter[]
  visibleColumns: string[]
  sort: { field: string; dir: 'asc' | 'desc' }[]
}

export type AuditAction = 'adjust' | 'approve_stocktake' | 'reverse_txn' | 'update_master' | 'import'

export type AuditLog = {
  id: string
  actorId: string
  action: AuditAction
  targetType: string
  targetId: string
  changes: { field: string; before: unknown; after: unknown }[]
  createdAt: string
}

// ---- リポジトリの戻り値（7章 リポジトリ層の規約）----
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
