// CSV エクスポート（FR-705）：いまの絞り込み・表示列のまま書き出す
// Excel で文字化けしないよう UTF-8 BOM を付け、各セルを無害化する
import Papa from 'papaparse'
import { sanitizeCell } from './sanitize'

export type ExportColumn<Row> = { label: string; value: (row: Row) => string | number | undefined | null }

export function toCsv<Row>(rows: Row[], columns: ExportColumn<Row>[]): string {
  const data = rows.map((r) => columns.map((c) => sanitizeCell(String(c.value(r) ?? ''))))
  return '﻿' + Papa.unparse({ fields: columns.map((c) => c.label), data }, { newline: '\r\n' })
}

/** ブラウザでファイルとしてダウンロードさせる */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
