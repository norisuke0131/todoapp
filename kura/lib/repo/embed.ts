// 記事埋め込み（SC-900, FR-715）：1商品の水位と、入庫・出庫・引当の3ボタンだけ
// ロール切替バーがないため、在庫管理者として動く。在庫を変えるのは必ずトランザクション（INV-02）
import type { Result } from '@/lib/types'
import { composeSnapshot, excessThreshold } from '@/lib/inventory'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId } from './_context'
import { draftBase, post } from './_post'

export const EMBED_SKU = 'SKU-1042'
export const EMBED_WAREHOUSE = 'wh-tokyo'
const STEP = 10

export type EmbedState = {
  sku: string
  name: string
  unit: string
  warehouseName: string
  onHand: number
  allocated: number
  available: number
  incoming: number
  reorderPoint: number
  safetyStock: number
  excessLine: number
  status: 'stockout' | 'below_reorder' | 'normal' | 'excess'
}

function read(): EmbedState {
  const c = ctx({ asRole: 'keeper' })
  const item = c.data.items.find((i) => i.sku === EMBED_SKU)
  if (!item) throw new Error('デモの商品が見つかりません')
  const s = composeSnapshot(c.index(), { itemId: item.id, warehouseId: EMBED_WAREHOUSE }, c.now)
  return {
    sku: item.sku,
    name: item.name,
    unit: item.baseUnit,
    warehouseName: c.data.warehouses.find((w) => w.id === EMBED_WAREHOUSE)?.name ?? '',
    onHand: s.onHand,
    allocated: s.allocated,
    available: s.available,
    incoming: s.incoming,
    reorderPoint: s.reorderPoint,
    safetyStock: s.safetyStock,
    excessLine: excessThreshold(item),
    status: s.status,
  }
}

export async function getEmbedState(): Promise<Result<EmbedState>> {
  return run(() => ok(read()))
}

export type EmbedAction = 'receive' | 'ship' | 'allocate'

/** ボタン1回分の操作。擬似ディレイは入れない（記事内で待たせない） */
export async function embedAct(action: EmbedAction): Promise<Result<EmbedState>> {
  return run(() => {
    const c = ctx({ asRole: 'keeper' })
    const item = c.data.items.find((i) => i.sku === EMBED_SKU)
    if (!item) return err('デモの商品が見つかりません')
    const base = {
      ...draftBase(c, 'pc'),
      itemId: item.id,
      warehouseId: EMBED_WAREHOUSE,
      inputUnit: item.baseUnit,
      note: '記事のデモから',
    }
    if (action === 'receive')
      post(c, [{ ...base, type: 'receive', qtyBase: STEP, inputQty: STEP, unitCost: item.cost }])
    if (action === 'ship') {
      if (read().onHand < STEP) return err('実在庫が足りないため、これ以上は出庫できません')
      post(c, [{ ...base, type: 'ship', qtyBase: -STEP, inputQty: -STEP }])
    }
    if (action === 'allocate') {
      getStores()
        .data.getState()
        .upsert('allocations', {
          id: newId('al'),
          itemId: item.id,
          warehouseId: EMBED_WAREHOUSE,
          qtyBase: STEP,
          refType: 'shipping_order',
          refId: 'embed-demo',
          status: 'active',
          createdAt: c.now,
        })
    }
    return ok(read())
  })
}
