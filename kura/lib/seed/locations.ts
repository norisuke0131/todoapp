// 棚番：エリアA〜C × 列01〜05 × 段1〜4（拠点ごとに60棚、計120棚）
// 巡回順は列ごとに上り下りを折り返す（蛇行）順
import type { Location } from '@/lib/types'
import { warehouses } from './warehouses'

const AREAS = [
  { area: 'A', storageCondition: 'normal' },
  { area: 'B', storageCondition: 'normal' },
  { area: 'C', storageCondition: 'normal' }, // 食品・飲料・調味料（ロット管理品）の区画
] as const

export const locations: Location[] = warehouses.flatMap((wh) => {
  const out: Location[] = []
  let order = 0
  for (const a of AREAS) {
    for (let row = 1; row <= 5; row++) {
      const levels = row % 2 === 1 ? [1, 2, 3, 4] : [4, 3, 2, 1]
      for (const lv of levels) {
        order += 1
        const code = `${a.area}-${String(row).padStart(2, '0')}-${lv}`
        out.push({
          id: `${wh.id}:${code}`,
          warehouseId: wh.id,
          code,
          area: a.area,
          storageCondition: a.storageCondition,
          sortOrder: order,
        })
      }
    }
  }
  return out
})
