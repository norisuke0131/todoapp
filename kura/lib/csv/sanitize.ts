// 数式インジェクションの無害化（FR-704, NFR-12）
// = + - @ タブ 改行 で始まるセルは、Excel 等で開いたときに式として実行されうる。
// 先頭に ' を付けて文字列として扱わせる。ただし「-12」のような純粋な数値はそのまま残す
const DANGER = /^[=+\-@\t\r]/

export function sanitizeCell(v: string): string {
  if (!DANGER.test(v)) return v
  if (/^[+-]?\d+(\.\d+)?$/.test(v)) return v
  return `'${v}`
}

export function isDangerous(v: string): boolean {
  return sanitizeCell(v) !== v
}
