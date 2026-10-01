// 取引先（すべて架空）
import type { Partner } from '@/lib/types'

const SUPPLIERS: [string, number, number][] = [
  ['ミナモ製作所', 10, 50000],
  ['燕原ステンレス工房', 14, 80000],
  ['北辰樹脂工業', 7, 30000],
  ['くらしの道具 小鞠', 5, 20000],
  ['丹波食品研究所', 6, 40000],
  ['瀬戸内やさい加工', 4, 30000],
  ['水分山ボトリング', 8, 60000],
  ['常磐醸造', 10, 50000],
  ['にじいろ日用品', 3, 15000],
  ['雪平パッケージ', 4, 25000],
  ['港町紙器', 6, 30000],
  ['あさぎ化成', 12, 40000],
]

const CUSTOMERS = [
  '雑貨店 ひだまり舎',
  'アウトドアショップ 稜線',
  'ECストア くらしのたね',
  '生活館 みなと店',
  'カフェ＆マーケット 木漏れ日',
  '道の駅 さとやま',
  'セレクトショップ ノード',
  'キッチン用品 匙屋',
  'スーパー まるみ 本店',
  'スーパー まるみ 西店',
  'ドラッグ あおば',
  'ホームセンター 槌',
  '珈琲焙煎所 灯',
  'ECストア ハコブネ',
  '保育園給食センター（架空）',
  'ホテル 汐見',
  '社員食堂サービス 和',
  '弁当工房 いろは',
  'ギフトショップ 包',
  '観光物産館 ゆずりは',
]

export const partners: Partner[] = [
  ...SUPPLIERS.map(([name, lt, min], i) => ({
    id: `sup-${String(i + 1).padStart(2, '0')}`,
    kind: 'supplier' as const,
    code: `S${String(i + 1).padStart(3, '0')}`,
    name,
    leadTimeDays: lt,
    minOrderAmount: min,
  })),
  ...CUSTOMERS.map((name, i) => ({
    id: `cus-${String(i + 1).padStart(2, '0')}`,
    kind: 'customer' as const,
    code: `C${String(i + 1).padStart(3, '0')}`,
    name,
    leadTimeDays: 0,
    minOrderAmount: 0,
  })),
]

/** カテゴリごとの主な仕入先 */
export const suppliersByCategory: Record<string, string[]> = {
  'cat-bottle': ['sup-01', 'sup-02'],
  'cat-parts': ['sup-03', 'sup-12'],
  'cat-kitchen': ['sup-04', 'sup-03'],
  'cat-food': ['sup-05', 'sup-06'],
  'cat-drink': ['sup-07'],
  'cat-season': ['sup-08', 'sup-05'],
  'cat-daily': ['sup-09'],
  'cat-pack': ['sup-10', 'sup-11'],
}
