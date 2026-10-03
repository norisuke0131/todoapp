import { describe, expect, it } from 'vitest'
import { guessMapping, parseCsv, sanitizeCell, toCsv, validateRows } from './index'

describe('数式インジェクションの無害化（FR-704）', () => {
  it("= + - @ で始まる文字列は先頭に ' を付ける。純粋な数値はそのまま", () => {
    expect(sanitizeCell('=HYPERLINK("http://evil","x")')).toBe(`'=HYPERLINK("http://evil","x")`)
    expect(sanitizeCell('+cmd|/c calc')).toBe("'+cmd|/c calc")
    expect(sanitizeCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(sanitizeCell('-2+3')).toBe("'-2+3")
    expect(sanitizeCell('-12')).toBe('-12')
    expect(sanitizeCell('ステンレスボトル')).toBe('ステンレスボトル')
  })

  it('取り込み時も書き出し時も無害化する', () => {
    const p = parseCsv('SKU,商品名\nX-1,=1+1\n')
    expect(p.rows[0]).toEqual(['X-1', "'=1+1"])
    expect(p.neutralized).toBe(1)
    const out = toCsv([{ a: '=1+1' }], [{ label: '名', value: (r) => r.a }])
    expect(out.startsWith('﻿')).toBe(true)
    expect(out).toContain("'=1+1")
  })
})

describe('列マッピングと検証（FR-701）', () => {
  it('見出しの言い換え・全角・空白を吸収して自動推測する', () => {
    const p = parseCsv('﻿品番,品名,ＪＡＮコード,分類,単位,入数,仕入単価,販売価格\n')
    expect(guessMapping('items', p.headers)).toMatchObject({
      sku: 0,
      name: 1,
      jan: 2,
      category: 3,
      baseUnit: 4,
      caseQty: 5,
      cost: 6,
      price: 7,
    })
  })

  it('エラーは行番号・項目・対処を含む。正しい行は通す（部分取込）', () => {
    const p = parseCsv(
      'SKU,拠点,数量,期限\nSKU-1042,東京倉庫,120,2027/3/1\nSKU-2011,東京倉庫,十二,\n,大阪倉庫,5,2027-13\n',
    )
    const rows = validateRows('opening', p, guessMapping('opening', p.headers))
    expect(rows[0]).toEqual({
      line: 2,
      values: expect.objectContaining({ qty: '120', expiryDate: '2027-03-01' }),
      errors: [],
    })
    expect(rows[1]?.errors).toEqual(['数量「十二」が整数ではありません。半角数字で入力してください'])
    expect(rows[2]?.errors).toEqual([
      'SKUが空です。値を入れてください',
      '期限「2027-13」が日付ではありません。2026-12-31 の形で入力してください',
    ])
  })

  it('桁区切りのカンマと全角数字を受け付ける', () => {
    const p = parseCsv('SKU,拠点,数量\nA-1,東京倉庫,"1,200"\nA-2,東京倉庫,３４\n')
    const rows = validateRows('opening', p, guessMapping('opening', p.headers))
    expect(rows.map((r) => r.values.qty)).toEqual(['1200', '34'])
    expect(rows.every((r) => r.errors.length === 0)).toBe(true)
  })
})

describe('取り込み後も無害化が保たれる', () => {
  it("文字列の項目は先頭の ' を残して保存する（式として解釈させない）", () => {
    const p = parseCsv('SKU,商品名,カテゴリ,単位,原価,売価\nX-001,=1+1,キッチン雑貨,個,100,200\n')
    const [row] = validateRows('items', p, guessMapping('items', p.headers))
    expect(row?.values.name).toBe("'=1+1")
    expect(row?.errors).toEqual([])
  })
})
