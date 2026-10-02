// シードデータの生成（7章）。日付はすべて now からの相対で作る
// 同じ now を渡せば、毎回まったく同じデータになる（乱数は固定シード）
import type {
  Allocation,
  AuditLog,
  Category,
  Item,
  Location,
  Lot,
  Partner,
  PurchaseOrder,
  ReasonCode,
  SavedView,
  ShippingOrder,
  Stocktake,
  Transaction,
  Transfer,
  User,
  Warehouse,
} from '@/lib/types'
import { buildIndex, buildCostIndex } from '@/lib/inventory'
import { abcAnalysis } from '@/lib/analytics'
import { createRng } from './rng'
import { warehouses } from './warehouses'
import { locations } from './locations'
import { users } from './users'
import { categories } from './categories'
import { reasonCodes } from './reasonCodes'
import { partners } from './partners'
import { buildItems } from './items'
import { assignPairs, generateEvents, settle } from './plan'
import { planTransfers } from './transfers'
import { planStocktakes, stocktakeBlackouts, buildStocktakes } from './stocktakes'
import { buildTransactions } from './transactions'
import { buildPurchaseOrders } from './purchaseOrders'
import { buildShippingOrders } from './shippingOrders'

export type SeedData = {
  warehouses: Warehouse[]
  locations: Location[]
  users: User[]
  categories: Category[]
  reasonCodes: ReasonCode[]
  partners: Partner[]
  items: Item[]
  lots: Lot[]
  txns: Transaction[]
  allocations: Allocation[]
  purchaseOrders: PurchaseOrder[]
  shippingOrders: ShippingOrder[]
  transfers: Transfer[]
  stocktakes: Stocktake[]
  views: SavedView[]
  auditLogs: AuditLog[]
}

export const SEED = 20260824

export function generateSeed(now: string): SeedData {
  const rng = createRng(SEED)
  const { items, profiles } = buildItems(rng)
  const pairs = assignPairs(rng, items)

  const blackouts = stocktakeBlackouts(now)
  for (const p of pairs) generateEvents(rng, now, p, profiles.get(p.item.id) ?? { dailyRate: 1 }, blackouts)
  const transfers = planTransfers(rng, now, pairs, blackouts)
  const stPlans = planStocktakes(rng, now, pairs)
  for (const p of pairs) settle(rng, now, p)

  const { txns, lots } = buildTransactions(rng, pairs)
  const cost = buildCostIndex(txns)

  // 原価は移動平均の結果を商品マスタに反映（表示用のキャッシュ。在庫金額の算出には使わない）
  for (const item of items) item.cost = cost.unitCostOf(item.id) ?? item.cost

  const baseData = { items, txns, allocations: [], purchaseOrders: [], transfers, lots, categories }
  const index0 = buildIndex(baseData)
  const purchaseOrders = buildPurchaseOrders(rng, now, pairs, txns, index0)
  const { shippingOrders, allocations } = buildShippingOrders(rng, now, pairs, txns, index0)
  const stocktakes = buildStocktakes(rng, stPlans, txns, cost)

  // ABC区分（出庫金額の累積構成比）。検索性のため商品に保持する
  const shipped = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'ship') continue
    shipped.set(
      t.itemId,
      (shipped.get(t.itemId) ?? 0) + -t.qtyBase * (cost.unitCostAt(t.itemId, t.occurredAt) ?? 0),
    )
  }
  const abc = new Map(
    abcAnalysis(items.map((i) => ({ itemId: i.id, shippedValue: Math.round(shipped.get(i.id) ?? 0) }))).map(
      (r) => [r.itemId, r.abcClass],
    ),
  )
  for (const item of items) item.abcClass = abc.get(item.id)

  return {
    warehouses,
    locations,
    users,
    categories,
    reasonCodes,
    partners,
    items,
    lots,
    txns,
    allocations,
    purchaseOrders,
    shippingOrders,
    transfers,
    stocktakes,
    views: defaultViews(),
    auditLogs: [],
  }
}

function defaultViews(): SavedView[] {
  const cols = [
    'sku',
    'name',
    'onHand',
    'allocated',
    'available',
    'incoming',
    'gauge',
    'state',
    'reorderPoint',
  ]
  return [
    {
      id: 'view-reorder',
      name: '発注点以下',
      target: 'stock',
      ownerId: 'u-keeper-1',
      isShared: true,
      filters: [{ field: 'state', operator: 'in', value: ['stockout', 'below_reorder'] }],
      visibleColumns: cols,
      sort: [{ field: 'available', dir: 'asc' }],
    },
    {
      id: 'view-allocated',
      name: '引当で有効在庫が不足',
      target: 'stock',
      ownerId: 'u-keeper-1',
      isShared: true,
      filters: [
        { field: 'allocated', operator: 'gte', value: 1 },
        { field: 'state', operator: 'in', value: ['below_reorder', 'stockout'] },
      ],
      visibleColumns: cols,
      sort: [{ field: 'allocated', dir: 'desc' }],
    },
    {
      id: 'view-expiring',
      name: '期限間近',
      target: 'stock',
      ownerId: 'u-keeper-2',
      isShared: true,
      filters: [{ field: 'expiringQty', operator: 'gte', value: 1 }],
      visibleColumns: [...cols, 'nearestExpiryDate'],
      sort: [{ field: 'nearestExpiryDate', dir: 'asc' }],
    },
    {
      id: 'view-idle',
      name: '滞留（90日以上出庫なし）',
      target: 'stock',
      ownerId: 'u-keeper-2',
      isShared: true,
      filters: [{ field: 'idleDays', operator: 'gte', value: 90 }],
      visibleColumns: [...cols, 'idleDays'],
      sort: [{ field: 'idleDays', dir: 'desc' }],
    },
  ]
}
