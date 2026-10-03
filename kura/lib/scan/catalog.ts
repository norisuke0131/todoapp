// バーコードの照合表：JAN・SKU（大文字小文字・全角半角を無視）から商品を引く
// ハンディ端末はキーボードとして文字列＋Enter を送ってくる（FR-303）ので、ここは文字列の照合だけ
export type ScanItem = {
  itemId: string
  sku: string
  name: string
  baseUnit: string
  isLotManaged: boolean
  packUnits: { name: string; qtyInBase: number }[]
}

export type ScanCatalog = { byCode: Map<string, ScanItem>; size: number }

export const normalizeCode = (code: string) => code.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, '')

export function buildCatalog(items: (ScanItem & { jan?: string })[]): ScanCatalog {
  const byCode = new Map<string, ScanItem>()
  for (const i of items) {
    const { jan, ...item } = i
    byCode.set(normalizeCode(i.sku), item)
    if (jan) byCode.set(normalizeCode(jan), item)
  }
  return { byCode, size: items.length }
}

export function lookup(catalog: ScanCatalog, code: string): ScanItem | undefined {
  return catalog.byCode.get(normalizeCode(code))
}
