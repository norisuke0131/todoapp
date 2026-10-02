'use client'
// 適用中の条件をチップで表示し、個別に解除できる（FR-206）
import { X } from 'lucide-react'
import type { Filter } from '@/lib/types'
import type { FieldDef } from '@/lib/query'
import { describeFilter } from './describe'

export function ConditionChips<Row>({
  filters,
  fields,
  q,
  onRemove,
  onClearQ,
  onClearAll,
}: {
  filters: Filter[]
  fields: FieldDef<Row>[]
  q: string
  onRemove: (i: number) => void
  onClearQ: () => void
  onClearAll: () => void
}) {
  if (filters.length === 0 && !q) return null
  return (
    <ul aria-label="適用中の条件" className="flex flex-wrap items-center gap-1.5">
      {q && <Chip label={`キーワード「${q}」`} onRemove={onClearQ} />}
      {filters.map((f, i) => (
        <Chip
          key={`${f.field}-${f.operator}-${i}`}
          label={describeFilter(f, fields)}
          onRemove={() => onRemove(i)}
        />
      ))}
      <li>
        <button
          type="button"
          onClick={onClearAll}
          className="h-7 rounded-sm px-2 text-[12px] font-bold text-primary-d hover:underline"
        >
          条件をすべて外す
        </button>
      </li>
    </ul>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <li className="flex h-7 items-center gap-1 rounded-sm border border-line-hi bg-panel pl-2.5 pr-1 text-[12px] text-ink-900">
      <span className="max-w-[28ch] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`「${label}」を外す`}
        className="grid size-5 place-items-center rounded-sm text-ink-500 hover:bg-panel-alt hover:text-ink-900"
      >
        <X className="size-3.5" />
      </button>
    </li>
  )
}
