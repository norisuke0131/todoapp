// 日付ユーティリティ（純粋関数。現在時刻は必ず引数で受け取る / INV-05）

const DAY_MS = 86_400_000

/** from → to の経過日数（切り捨て）。to が前なら負 */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS)
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString()
}

/** 時系列順の比較（occurredAt → seq） */
export function byOccurred<T extends { occurredAt: string; seq: number }>(a: T, b: T): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1
  return a.seq - b.seq
}
