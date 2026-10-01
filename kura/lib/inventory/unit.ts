// 単位換算（FR-110）
// 内部は常に最小単位（qtyBase）。入力・表示のときだけ換算する。

import type { Item, PackUnit } from '@/lib/types'

type UnitSource = Pick<Item, 'baseUnit' | 'packUnits'>

/** 単位名から最小単位あたりの数量を返す。未知の単位は undefined */
export function unitFactor(item: UnitSource, unitName: string): number | undefined {
  if (unitName === item.baseUnit) return 1
  return item.packUnits.find((p) => p.name === unitName)?.qtyInBase
}

/** 入力数量（任意の単位）を最小単位に換算する。単位が不正なら例外 */
export function toBase(item: UnitSource, qty: number, unitName: string): number {
  const factor = unitFactor(item, unitName)
  if (factor === undefined) throw new Error(`単位「${unitName}」は登録されていません`)
  if (!Number.isFinite(qty)) throw new Error('数量が数値ではありません')
  return qty * factor
}

export type UnitBreakdown = { parts: { unit: string; qty: number }[]; totalBase: number }

/**
 * 最小単位の数量を、大きい単位から順に分解する。
 * 例：ケース24・ボール6・バラ → 53本 = 2ケース 0ボール 5本
 */
export function breakdown(item: UnitSource, qtyBase: number): UnitBreakdown {
  const sign = qtyBase < 0 ? -1 : 1
  let rest = Math.abs(qtyBase)
  const packs: PackUnit[] = [...item.packUnits].sort((a, b) => b.qtyInBase - a.qtyInBase)
  const parts: { unit: string; qty: number }[] = []
  for (const p of packs) {
    const q = Math.floor(rest / p.qtyInBase)
    parts.push({ unit: p.name, qty: q * sign })
    rest -= q * p.qtyInBase
  }
  parts.push({ unit: item.baseUnit, qty: rest * sign })
  return { parts, totalBase: qtyBase }
}

/** 「2ケース 5本」のような表示文字列。0 の単位は省く */
export function formatBreakdown(item: UnitSource, qtyBase: number): string {
  if (qtyBase === 0) return `0${item.baseUnit}`
  const { parts } = breakdown(item, qtyBase)
  const nonZero = parts.filter((p) => p.qty !== 0)
  const sign = qtyBase < 0 ? '−' : ''
  return sign + nonZero.map((p) => `${Math.abs(p.qty)}${p.unit}`).join(' ')
}
