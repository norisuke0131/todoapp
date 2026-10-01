import type { Category } from '@/lib/types'

// expiryAlertDays：期限の何日前から「期限間近」とするか（FR-509）
export const categories: Category[] = [
  { id: 'cat-bottle', name: '水筒・ボトル', expiryAlertDays: 90, sortOrder: 1 },
  { id: 'cat-parts', name: 'ボトルパーツ・替え栓', expiryAlertDays: 90, sortOrder: 2 },
  { id: 'cat-kitchen', name: 'キッチン雑貨', expiryAlertDays: 90, sortOrder: 3 },
  { id: 'cat-food', name: '食品（常温）', expiryAlertDays: 30, sortOrder: 4 },
  { id: 'cat-drink', name: '飲料', expiryAlertDays: 45, sortOrder: 5 },
  { id: 'cat-season', name: '調味料', expiryAlertDays: 60, sortOrder: 6 },
  { id: 'cat-daily', name: '日用消耗品', expiryAlertDays: 90, sortOrder: 7 },
  { id: 'cat-pack', name: '梱包資材', expiryAlertDays: 90, sortOrder: 8 },
]
