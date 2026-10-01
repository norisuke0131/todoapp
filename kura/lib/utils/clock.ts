// 現在時刻の唯一の取得口。lib/inventory・lib/analytics にはここから引数で渡す（INV-05）
let override: (() => string) | undefined

export function nowIso(): string {
  return override ? override() : new Date().toISOString()
}

/** テスト用：時刻を固定する */
export function setClock(fn: (() => string) | undefined): void {
  override = fn
}
