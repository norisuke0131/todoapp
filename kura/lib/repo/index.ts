// ★ コンポーネントが触るのはここだけ（2章 差し替え可能性の担保）
// 全メソッドは async で、戻り値は Result 型。実案件ではこの層の中身を API 呼び出しに差し替える
export * from './stock'
export * from './items'
export * from './lots'
export * from './transactions'
export * from './receive'
export * from './ship'
export * from './allocations'
export * from './transfers'
export * from './adjust'
export * from './stocktakes'
export * from './purchaseOrders'
export * from './views'
export * from './analytics'
export * from './settings'
export * from './session'
export { subscribe } from './_context'
export type {
  Permission,
  ScopedItem,
  ScopedSnapshot,
  ScopedTransaction,
  ScopedPurchaseOrder,
  ScopedStocktake,
} from './_scope'
export * from './ui'
