// 連続スキャンの積み上げ（FR-302）：同じ商品を読んだら数量 +1、新しい商品なら行を足す
// スキャンごとに画面は遷移しない。直前の行をハイライトし、各行は取り消せる
import { lookup, normalizeCode, type ScanCatalog, type ScanItem } from './catalog'

export type ScanLine = ScanItem & { qty: number; scans: number; lastSeq: number }
export type UnknownCode = { code: string; count: number; lastSeq: number; held: boolean }

export type ScanState = {
  seq: number
  lines: ScanLine[] // 新しく読んだ（または数が増えた）行が先頭
  unknown: UnknownCode[]
  last?: { kind: 'hit'; itemId: string; qty: number } | { kind: 'miss'; code: string }
}

export const EMPTY_SCAN: ScanState = { seq: 0, lines: [], unknown: [] }

/** 「3*4901234567890」のように数量を前置きすると、その数だけ積む */
export function parseInput(raw: string): { code: string; qty: number } | undefined {
  const s = raw.normalize('NFKC').trim()
  if (!s) return undefined
  const m = s.match(/^(\d{1,4})[*xX×](.+)$/)
  if (m) return { qty: Math.max(1, Number(m[1])), code: m[2]!.trim() }
  return { qty: 1, code: s }
}

export function scan(state: ScanState, catalog: ScanCatalog, raw: string): ScanState {
  const parsed = parseInput(raw)
  if (!parsed) return state
  const seq = state.seq + 1
  const item = lookup(catalog, parsed.code)
  if (!item) {
    const code = normalizeCode(parsed.code)
    const existing = state.unknown.find((u) => u.code === code)
    const unknown = existing
      ? state.unknown.map((u) => (u.code === code ? { ...u, count: u.count + 1, lastSeq: seq } : u))
      : [{ code, count: 1, lastSeq: seq, held: false }, ...state.unknown]
    return { ...state, seq, unknown, last: { kind: 'miss', code } }
  }
  const found = state.lines.find((l) => l.itemId === item.itemId)
  const line: ScanLine = found
    ? { ...found, qty: found.qty + parsed.qty, scans: found.scans + 1, lastSeq: seq }
    : { ...item, qty: parsed.qty, scans: 1, lastSeq: seq }
  return {
    ...state,
    seq,
    lines: [line, ...state.lines.filter((l) => l.itemId !== item.itemId)],
    last: { kind: 'hit', itemId: item.itemId, qty: line.qty },
  }
}

/** 行ごとの取り消し・数量の手直し */
export function setQty(state: ScanState, itemId: string, qty: number): ScanState {
  if (qty <= 0) return { ...state, lines: state.lines.filter((l) => l.itemId !== itemId) }
  return { ...state, lines: state.lines.map((l) => (l.itemId === itemId ? { ...l, qty } : l)) }
}

export function removeLine(state: ScanState, itemId: string): ScanState {
  return { ...state, lines: state.lines.filter((l) => l.itemId !== itemId) }
}

/** 未登録のコードを「保留」にする（FR-304）。保留中は一覧の下にまとめておく */
export function holdUnknown(state: ScanState, code: string): ScanState {
  return { ...state, unknown: state.unknown.map((u) => (u.code === code ? { ...u, held: true } : u)) }
}

export function dropUnknown(state: ScanState, code: string): ScanState {
  return { ...state, unknown: state.unknown.filter((u) => u.code !== code) }
}
