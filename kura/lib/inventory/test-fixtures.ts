// テスト用の最小データ。本番コードからは import しない
import type { Allocation, Category, Item, Lot, PurchaseOrder, Transaction, Transfer } from '@/lib/types'
import type { InventoryData } from './snapshot'

export const NOW = '2026-10-01T09:00:00.000Z'

export function makeItem(over: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    sku: 'SKU-1042',
    name: 'ステンレスボトル 500ml マット黒',
    categoryId: 'c1',
    baseUnit: '本',
    packUnits: [
      { name: 'ケース', qtyInBase: 24 },
      { name: 'ボール', qtyInBase: 6 },
    ],
    cost: 1300,
    price: 2400,
    reorderPoint: 60,
    safetyStock: 40,
    orderLot: 70,
    leadTimeDays: 7,
    isLotManaged: false,
    isSerialManaged: false,
    storageCondition: 'normal',
    isActive: true,
    ...over,
  }
}

let seq = 0
export function txn(over: Partial<Transaction> & Pick<Transaction, 'type' | 'qtyBase'>): Transaction {
  seq += 1
  return {
    id: `t${seq}`,
    seq,
    itemId: 'i1',
    warehouseId: 'tokyo',
    inputQty: over.qtyBase,
    inputUnit: '本',
    userId: 'u1',
    device: 'pc',
    occurredAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    note: '',
    syncState: 'synced',
    ...over,
  }
}

export function data(over: Partial<InventoryData> = {}): InventoryData {
  const categories: Category[] = [{ id: 'c1', name: '水筒・ボトル', expiryAlertDays: 30, sortOrder: 1 }]
  return {
    items: [makeItem()],
    txns: [] as Transaction[],
    allocations: [] as Allocation[],
    purchaseOrders: [] as PurchaseOrder[],
    transfers: [] as Transfer[],
    lots: [] as Lot[],
    categories,
    ...over,
  }
}
