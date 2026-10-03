'use client'
// 条件の追加（FR-203）：項目 → 条件（等しい／含む／以上／以下／期間／空である）→ 値
import { useMemo, useState } from 'react'
import { ListFilter } from 'lucide-react'
import type { Filter, FilterOperator } from '@/lib/types'
import { OPERATOR_LABEL, type FieldDef } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const OPS_BY_TYPE: Record<FieldDef<unknown>['type'], FilterOperator[]> = {
  text: ['contains', 'eq', 'isEmpty'],
  number: ['gte', 'lte', 'eq', 'isEmpty'],
  date: ['between', 'gte', 'lte', 'isEmpty'],
  enum: ['in', 'isEmpty'],
  tags: ['in'],
}

// 入力は日本時間の日付。保存は UTC の ISO 文字列にそろえる（取引日時と同じ形式で比べるため）
const jstStart = (d: string) => new Date(`${d}T00:00:00+09:00`).toISOString()
const jstEnd = (d: string) => new Date(`${d}T23:59:59.999+09:00`).toISOString()

const inputCls = 'h-8 w-full rounded border border-line-hi bg-panel px-2 text-body text-ink-900'

export function FilterBuilder<Row>({
  fields,
  onAdd,
}: {
  fields: FieldDef<Row>[]
  onAdd: (f: Filter) => void
}) {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState(fields[0]?.key ?? '')
  const def = useMemo(() => fields.find((f) => f.key === field), [fields, field])
  const ops = def ? OPS_BY_TYPE[def.type] : []
  const [op, setOp] = useState<FilterOperator>(ops[0] ?? 'contains')
  const [v1, setV1] = useState('')
  const [v2, setV2] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState('')

  const reset = (key: string) => {
    setField(key)
    const d = fields.find((f) => f.key === key)
    setOp(d ? OPS_BY_TYPE[d.type][0]! : 'contains')
    setV1('')
    setV2('')
    setPicked([])
    setError('')
  }

  const submit = () => {
    if (!def) return
    let value: unknown = v1
    if (op === 'isEmpty') value = null
    else if (op === 'in') {
      if (picked.length === 0) return setError('ひとつ以上選んでください')
      value = picked
    } else if (op === 'between') {
      if (!v1 && !v2) return setError('開始日か終了日を入れてください')
      value = [v1 ? jstStart(v1) : '', v2 ? jstEnd(v2) : '']
    } else if (def.type === 'number') {
      if (v1.trim() === '' || Number.isNaN(Number(v1))) return setError('半角数字で入力してください')
      value = Number(v1)
    } else if (def.type === 'date') {
      if (!v1) return setError('日付を選んでください')
      value = op === 'lte' ? jstEnd(v1) : jstStart(v1)
    } else if (!v1.trim()) return setError('値を入力してください')
    onAdd({ field: def.key, operator: op, value })
    setOpen(false)
    reset(field)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm">
          <ListFilter aria-hidden />
          条件を追加
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-600">項目</span>
            <select className={inputCls} value={field} onChange={(e) => reset(e.target.value)}>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-600">条件</span>
            <select className={inputCls} value={op} onChange={(e) => setOp(e.target.value as FilterOperator)}>
              {ops.map((o) => (
                <option key={o} value={o}>
                  {OPERATOR_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
          {op === 'in' && def?.options && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-label text-ink-600">値（複数選べます）</legend>
              <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
                {def.options.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-body">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={picked.includes(o.value)}
                      onChange={(e) =>
                        setPicked((p) =>
                          e.target.checked ? [...p, o.value] : p.filter((x) => x !== o.value),
                        )
                      }
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {op !== 'in' && op !== 'isEmpty' && (
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-label text-ink-600">{op === 'between' ? '開始' : '値'}</span>
                <input
                  className={inputCls}
                  type={def?.type === 'date' ? 'date' : 'text'}
                  inputMode={def?.type === 'number' ? 'numeric' : undefined}
                  value={v1}
                  onChange={(e) => setV1(e.target.value)}
                  aria-describedby={error ? 'filter-error' : undefined}
                />
              </label>
              {op === 'between' && (
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-label text-ink-600">終了</span>
                  <input
                    className={inputCls}
                    type="date"
                    value={v2}
                    onChange={(e) => setV2(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}
          {error && (
            <p id="filter-error" role="alert" className="text-[12px] text-st-ink-stockout">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="sm" className="self-end">
            この条件で絞り込む
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
