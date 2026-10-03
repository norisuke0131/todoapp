import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  code128B,
  code128BValues,
  EMPTY_SCAN,
  holdUnknown,
  parseInput,
  removeLine,
  scan,
  setQty,
} from './index'

const items = Array.from({ length: 620 }, (_, i) => ({
  itemId: `item-${i}`,
  sku: `SKU-${1000 + i}`,
  name: `商品${i}`,
  baseUnit: '本',
  isLotManaged: false,
  packUnits: [],
  jan: `20${String(i).padStart(10, '0')}0`,
}))
const catalog = buildCatalog(items)

describe('連続スキャン（FR-302）', () => {
  it('同じ商品は数量 +1、新しい商品は先頭に行を足す', () => {
    let s = scan(EMPTY_SCAN, catalog, 'SKU-1042')
    s = scan(s, catalog, items[5]!.jan)
    s = scan(s, catalog, 'sku-1042') // 小文字でも同じ商品
    expect(s.lines.map((l) => [l.sku, l.qty])).toEqual([
      ['SKU-1042', 2],
      ['SKU-1005', 1],
    ])
    expect(s.last).toEqual({ kind: 'hit', itemId: 'item-42', qty: 2 })
  })

  it('全角・前後の空白・数量の前置き（3*コード）を受け付ける', () => {
    expect(parseInput('　ＳＫＵ－１０４２ ')).toEqual({ qty: 1, code: 'SKU-1042' })
    expect(parseInput('12*2000000000420')).toEqual({ qty: 12, code: '2000000000420' })
    const s = scan(EMPTY_SCAN, catalog, '3×SKU-1042')
    expect(s.lines[0]?.qty).toBe(3)
  })

  it('未登録のコードは別に数え、保留にできる（FR-304）', () => {
    let s = scan(EMPTY_SCAN, catalog, '4999999999999')
    s = scan(s, catalog, '4999999999999')
    expect(s.unknown).toEqual([{ code: '4999999999999', count: 2, lastSeq: 2, held: false }])
    expect(s.last).toEqual({ kind: 'miss', code: '4999999999999' })
    s = holdUnknown(s, '4999999999999')
    expect(s.unknown[0]?.held).toBe(true)
  })

  it('行ごとに取り消し・数量の手直しができる', () => {
    let s = scan(scan(EMPTY_SCAN, catalog, 'SKU-1001'), catalog, 'SKU-1002')
    s = setQty(s, 'item-1', 5)
    expect(s.lines.find((l) => l.itemId === 'item-1')?.qty).toBe(5)
    s = removeLine(s, 'item-2')
    expect(s.lines.map((l) => l.itemId)).toEqual(['item-1'])
    expect(setQty(s, 'item-1', 0).lines).toEqual([])
  })

  it('★ 620 SKU の照合表で、1件あたり 50ms 以下（NFR-07）', () => {
    let s = EMPTY_SCAN
    const t0 = performance.now()
    for (let k = 0; k < 1000; k++) s = scan(s, catalog, items[k % 620]!.jan)
    const perScan = (performance.now() - t0) / 1000
    expect(perScan).toBeLessThan(50)
    expect(s.lines).toHaveLength(620)
  })
})

describe('Code 128（ピッキングリストのバーコード）', () => {
  it('チェックデジットが規格どおり（例：PJJ123C）', () => {
    // Start B(104) + P(48) J(42) J(42) 1(17) 2(18) 3(19) C(35) → (104+48+84+126+68+90+114+245) = 879、879 % 103 = 55
    expect(code128BValues('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106])
  })
  it('各文字は 11 モジュール、停止符号は 13 モジュール', () => {
    const w = code128B('A-01-1')
    expect(w.reduce((a, b) => a + b, 0)).toBe(11 * (1 + 6 + 1) + 13)
  })
  it('表せない文字は例外', () => {
    expect(() => code128B('棚')).toThrow()
  })
})
