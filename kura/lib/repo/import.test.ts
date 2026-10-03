import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Result } from '@/lib/types'
import { createStores, memoryStorage, setStores } from '@/lib/store'
import { setClock } from '@/lib/utils/clock'
import { guessMapping, parseCsv, SAMPLE_CSV, validateRows, type ImportKind } from '@/lib/csv'
import { setDelayEnabled } from './_delay'
import * as repo from './index'

const NOW = '2026-10-01T09:00:00.000Z'
const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error)
  return r.data
}
const rowsOf = (kind: ImportKind) => {
  const p = parseCsv(SAMPLE_CSV[kind].text)
  return validateRows(kind, p, guessMapping(kind, p.headers))
}

beforeEach(async () => {
  setStores(createStores(memoryStorage))
  setClock(() => NOW)
  setDelayEnabled(false)
  await repo.switchRole('keeper')
})
afterAll(() => {
  setStores(undefined)
  setClock(undefined)
})

describe('CSV インポート（FR-701〜FR-703）', () => {
  it('プレビュー（dryRun）では何も書き込まない', async () => {
    const before = unwrap(await repo.listItems()).length
    const s = unwrap(await repo.importCsv('items', rowsOf('items'), { dryRun: true }))
    expect(s).toMatchObject({ created: 4, failed: 2, committed: false })
    expect(unwrap(await repo.listItems())).toHaveLength(before)
  })

  it('エラー行を除いて取り込み、エラーには行番号と理由がある（部分取込）', async () => {
    const s = unwrap(await repo.importCsv('items', rowsOf('items'), { dryRun: false }))
    expect(s.committed).toBe(true)
    expect(s.lines.filter((l) => l.status === 'error').map((l) => [l.line, l.errors[0]])).toEqual([
      [5, expect.stringContaining('カテゴリ「台所用品」が見つかりません')],
      [6, '原価「九百」が数値ではありません。半角数字で入力してください'],
    ])
    const plate = unwrap(await repo.getItem('SKU-9001'))
    expect(plate).toMatchObject({ name: '白磁パスタ皿 26cm', packUnits: [{ name: 'ケース', qtyInBase: 12 }] })
    // ★ 危険な式は無害化されたまま保存される
    expect(unwrap(await repo.getItem('SKU-9006')).name.startsWith("'=")).toBe(true)
  })

  it('★ 在庫初期値は「期首棚卸」トランザクションとして登録される（在庫数を直接書かない）', async () => {
    unwrap(await repo.importCsv('items', rowsOf('items'), { dryRun: false }))
    const s = unwrap(await repo.importCsv('opening', rowsOf('opening'), { dryRun: false }))
    expect(s.created).toBe(3)
    expect(s.lines.find((l) => l.line === 5)?.errors[0]).toContain('すでに在庫の履歴があります')
    expect(s.lines.find((l) => l.line === 6)?.errors).toEqual([
      '数量は1以上で入力してください（在庫0の商品は行ごと省いてください）',
    ])

    const ledger = unwrap(await repo.getItemLedger('SKU-9001', { warehouseId: 'wh-tokyo' }))
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.txn).toMatchObject({ type: 'opening', qtyBase: 48, note: 'CSVで取り込んだ期首棚卸' })
    const d = unwrap(await repo.getStockDetail('SKU-9001'))
    expect(d.byWarehouse[0]).toMatchObject({ warehouseId: 'wh-tokyo', onHand: 48 })
    // ロット管理品はロットも作られる
    const lots = unwrap(await repo.listLots()).filter((l) => l.sku === 'SKU-9003')
    expect(lots).toEqual([
      expect.objectContaining({ lotNo: 'L261001-01', onHand: 30, expiryDate: '2027-03-31' }),
    ])
  })

  it('取引先：区分の誤りを指摘し、正しい行は取り込む', async () => {
    const s = unwrap(await repo.importCsv('partners', rowsOf('partners'), { dryRun: false }))
    expect(s).toMatchObject({ created: 3, failed: 1 })
    expect(unwrap(await repo.listPartners()).find((p) => p.code === 'S101')).toMatchObject({
      leadTimeDays: 9,
      minOrderAmount: 30000,
    })
  })

  it('現場担当は取り込めない', async () => {
    await repo.switchRole('staff')
    const r = await repo.importCsv('items', rowsOf('items'), { dryRun: true })
    expect(r.ok).toBe(false)
  })
})
