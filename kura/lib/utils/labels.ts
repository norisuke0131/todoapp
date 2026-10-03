// 画面に出す名前（システム語を使わない / 8章 ライティング規約）
import type { Device, TxnType } from '@/lib/types'

export const TXN_LABEL: Record<TxnType, string> = {
  opening: '期首棚卸',
  receive: '入庫',
  ship: '出庫',
  transfer_out: '移動（出荷）',
  transfer_in: '移動（入荷）',
  move: '棚間移動',
  adjust: '在庫調整',
  stocktake: '棚卸差異',
}

export const DEVICE_LABEL: Record<Device, string> = { pc: 'PC', mobile: 'スマホ', scanner: 'スキャナ' }

export const REF_LABEL = {
  purchase_order: '発注',
  shipping_order: '出荷指示',
  transfer: '移動',
  stocktake: '棚卸',
} as const
