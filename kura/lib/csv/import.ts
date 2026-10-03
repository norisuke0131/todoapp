// CSV インポート（FR-701, FR-702）：読み込み → 列マッピング（自動推測＋手動修正）→ 検証 → プレビュー
import Papa from 'papaparse'
import { sanitizeCell } from './sanitize'

export type ImportKind = 'items' | 'opening' | 'partners'

export type TargetField = {
  key: string
  label: string
  required: boolean
  synonyms: string[]
  type: 'text' | 'int' | 'number' | 'date' | 'bool'
}

/** 取込先の項目。synonyms は見出しの自動推測に使う（全角半角・大小・空白を無視して照合） */
export const TARGETS: Record<ImportKind, TargetField[]> = {
  items: [
    {
      key: 'sku',
      label: 'SKU',
      required: true,
      type: 'text',
      synonyms: ['sku', '品番', '商品コード', 'itemcode', 'コード'],
    },
    {
      key: 'name',
      label: '商品名',
      required: true,
      type: 'text',
      synonyms: ['商品名', '品名', 'name', '名称'],
    },
    {
      key: 'jan',
      label: 'JAN',
      required: false,
      type: 'text',
      synonyms: ['jan', 'janコード', 'バーコード', 'ean'],
    },
    {
      key: 'category',
      label: 'カテゴリ',
      required: true,
      type: 'text',
      synonyms: ['カテゴリ', 'カテゴリー', '分類', 'category'],
    },
    { key: 'baseUnit', label: '単位', required: true, type: 'text', synonyms: ['単位', 'unit', '最小単位'] },
    {
      key: 'caseQty',
      label: 'ケース入数',
      required: false,
      type: 'int',
      synonyms: ['ケース入数', '入数', 'ケース', 'casequantity'],
    },
    {
      key: 'cost',
      label: '原価',
      required: true,
      type: 'number',
      synonyms: ['原価', '仕入単価', 'cost', '単価'],
    },
    {
      key: 'price',
      label: '売価',
      required: true,
      type: 'number',
      synonyms: ['売価', '販売価格', 'price', '定価'],
    },
    {
      key: 'reorderPoint',
      label: '発注点',
      required: false,
      type: 'int',
      synonyms: ['発注点', 'reorderpoint'],
    },
    {
      key: 'safetyStock',
      label: '安全在庫',
      required: false,
      type: 'int',
      synonyms: ['安全在庫', 'safetystock'],
    },
    {
      key: 'orderLot',
      label: '発注ロット',
      required: false,
      type: 'int',
      synonyms: ['発注ロット', '発注単位', 'ロット', 'orderlot'],
    },
    {
      key: 'lotManaged',
      label: 'ロット管理',
      required: false,
      type: 'bool',
      synonyms: ['ロット管理', '期限管理', 'lotmanaged'],
    },
  ],
  opening: [
    {
      key: 'sku',
      label: 'SKU',
      required: true,
      type: 'text',
      synonyms: ['sku', '品番', '商品コード', 'コード'],
    },
    {
      key: 'warehouse',
      label: '拠点',
      required: true,
      type: 'text',
      synonyms: ['拠点', '倉庫', 'warehouse', '保管場所'],
    },
    {
      key: 'qty',
      label: '数量',
      required: true,
      type: 'int',
      synonyms: ['数量', '在庫数', '在庫', 'qty', 'quantity', '実数'],
    },
    {
      key: 'location',
      label: '棚番',
      required: false,
      type: 'text',
      synonyms: ['棚番', 'ロケーション', 'location', '棚'],
    },
    {
      key: 'lotNo',
      label: 'ロット番号',
      required: false,
      type: 'text',
      synonyms: ['ロット番号', 'ロット', 'lot', 'lotno'],
    },
    {
      key: 'expiryDate',
      label: '期限',
      required: false,
      type: 'date',
      synonyms: ['期限', '賞味期限', '使用期限', 'expiry', '消費期限'],
    },
  ],
  partners: [
    {
      key: 'code',
      label: 'コード',
      required: true,
      type: 'text',
      synonyms: ['コード', '取引先コード', 'code'],
    },
    {
      key: 'name',
      label: '名称',
      required: true,
      type: 'text',
      synonyms: ['名称', '取引先名', '会社名', 'name'],
    },
    {
      key: 'kind',
      label: '区分',
      required: true,
      type: 'text',
      synonyms: ['区分', '種別', 'kind', '仕入先/出荷先'],
    },
    {
      key: 'leadTimeDays',
      label: 'リードタイム（日）',
      required: false,
      type: 'int',
      synonyms: ['リードタイム', '納期', 'leadtime'],
    },
    {
      key: 'minOrderAmount',
      label: '最小発注金額',
      required: false,
      type: 'int',
      synonyms: ['最小発注金額', '最低発注金額', 'minorder'],
    },
  ],
}

export type ParsedCsv = { headers: string[]; rows: string[][]; neutralized: number }

/** 読み込み。BOM・空行は捨て、各セルを無害化する */
export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  const [headers = [], ...body] = res.data
  let neutralized = 0
  const rows = body.map((r) =>
    r.map((cell) => {
      const v = (cell ?? '').trim()
      const s = sanitizeCell(v)
      if (s !== v) neutralized += 1
      return s
    }),
  )
  return { headers: headers.map((h) => h.trim()), rows, neutralized }
}

const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_\-（）()・/]/g, '')

/** 見出しから列の対応を推測する。key → 列番号 */
export function guessMapping(kind: ImportKind, headers: string[]): Record<string, number | undefined> {
  const used = new Set<number>()
  const out: Record<string, number | undefined> = {}
  for (const f of TARGETS[kind]) {
    const cands = [f.label, f.key, ...f.synonyms].map(norm)
    const i = headers.findIndex((h, idx) => !used.has(idx) && cands.includes(norm(h)))
    const j =
      i >= 0
        ? i
        : headers.findIndex(
            (h, idx) => !used.has(idx) && cands.some((c) => c.length >= 2 && norm(h).includes(c)),
          )
    if (j >= 0) {
      out[f.key] = j
      used.add(j)
    }
  }
  return out
}

export type RowResult = { line: number; values: Record<string, string>; errors: string[] }

/** 型と必須の検証。エラーは「何行目：何が・どうすれば」の形で返す（8章 ライティング規約） */
export function validateRows(
  kind: ImportKind,
  parsed: ParsedCsv,
  mapping: Record<string, number | undefined>,
): RowResult[] {
  const fields = TARGETS[kind]
  return parsed.rows.map((r, i) => {
    const line = i + 2 // 見出しが1行目
    const values: Record<string, string> = {}
    const errors: string[] = []
    for (const f of fields) {
      const col = mapping[f.key]
      // 無害化の ' は、数値・日付の項目でだけ外す（文字列はそのまま保持して、式として解釈させない）
      const cell = col === undefined ? '' : (r[col] ?? '').trim()
      const raw = f.type === 'text' || f.type === 'bool' ? cell : cell.replace(/^'/, '')
      values[f.key] = raw
      if (!raw) {
        if (f.required) errors.push(`${f.label}が空です。値を入れてください`)
        continue
      }
      const num = raw.replace(/,/g, '').normalize('NFKC')
      if (f.type === 'int' && !/^-?\d+$/.test(num))
        errors.push(`${f.label}「${raw}」が整数ではありません。半角数字で入力してください`)
      if (f.type === 'number' && Number.isNaN(Number(num)))
        errors.push(`${f.label}「${raw}」が数値ではありません。半角数字で入力してください`)
      if (f.type === 'date' && !/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(num))
        errors.push(`${f.label}「${raw}」が日付ではありません。2026-12-31 の形で入力してください`)
      if ((f.type === 'int' || f.type === 'number') && !errors.length) values[f.key] = num
      if (f.type === 'date' && !errors.length) {
        const [y, m, d] = num.split(/[-/]/)
        values[f.key] = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
      }
    }
    return { line, values, errors }
  })
}
