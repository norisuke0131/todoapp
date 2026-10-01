// 表示用の整形。マイナスは U+2212（−）で表し、桁区切りを入れる
const nf = new Intl.NumberFormat('ja-JP')

export function fmtQty(n: number): string {
  return n < 0 ? `−${nf.format(-n)}` : nf.format(n)
}

/** 符号付き（差異・取引数量）：+4 / −4 / 0 */
export function fmtSigned(n: number): string {
  if (n > 0) return `+${nf.format(n)}`
  return fmtQty(n)
}

export function fmtYen(n: number): string {
  return n < 0 ? `−¥${nf.format(-n)}` : `¥${nf.format(n)}`
}

// 日付は日本時間（JST）で表示する
const dateFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const dateTimeFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function fmtDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

export function fmtDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}
