'use client'
// 商品の登録・編集フォーム（SC-013）。React Hook Form + Zod
// ★ 在庫数はここでは入力しない。在庫はトランザクション（入庫・期首棚卸）でしか変わらない
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Category, Partner } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

const int = (label: string, min = 0) =>
  z.coerce
    .number({ error: `${label}は半角数字で入力してください` })
    .int(`${label}は整数で入力してください`)
    .min(min, `${label}は${min}以上で入力してください`)

export const itemSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{3,20}$/, 'SKUは半角英数字とハイフンで3〜20文字にしてください'),
    name: z.string().trim().min(1, '商品名を入力してください').max(80, '商品名は80文字以内にしてください'),
    jan: z
      .string()
      .trim()
      .regex(/^(\d{8}|\d{13})?$/, 'JANは8桁か13桁の半角数字で入力してください'),
    categoryId: z.string().min(1, 'カテゴリを選んでください'),
    baseUnit: z.string().trim().min(1, '単位を入力してください（例：本・個・袋）'),
    caseName: z.string().trim(),
    caseQty: z.union([z.literal(''), int('ケース入数', 2)]),
    cost: z.coerce
      .number({ error: '原価は半角数字で入力してください' })
      .min(0, '原価は0以上で入力してください'),
    price: z.coerce
      .number({ error: '売価は半角数字で入力してください' })
      .min(0, '売価は0以上で入力してください'),
    reorderPoint: int('発注点'),
    safetyStock: int('安全在庫'),
    orderLot: int('発注ロット', 1),
    leadTimeDays: int('リードタイム'),
    defaultSupplierId: z.string(),
    isLotManaged: z.boolean(),
    shelfLifeDays: z.union([z.literal(''), int('賞味期間', 1)]),
    isActive: z.boolean(),
  })
  .refine((v) => v.safetyStock <= v.reorderPoint, {
    path: ['safetyStock'],
    message: '安全在庫は発注点以下にしてください（発注点を下回ってから欠品までの余裕です）',
  })
  .refine((v) => !v.isLotManaged || v.shelfLifeDays !== '', {
    path: ['shelfLifeDays'],
    message: 'ロット管理する商品は、賞味期間（日）を入れてください',
  })

export type ItemFormValues = z.input<typeof itemSchema>
export type ItemFormOutput = z.output<typeof itemSchema>

type Props = {
  mode: 'new' | 'edit'
  defaultValues: ItemFormValues
  categories: Category[]
  suppliers: Partner[]
  hint?: string
  onSubmit: (v: ItemFormOutput) => Promise<string | undefined>
  onCancel: () => void
}

export function ItemForm({ mode, defaultValues, categories, suppliers, hint, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues, unknown, ItemFormOutput>({ resolver: zodResolver(itemSchema), defaultValues })
  const lot = watch('isLotManaged')

  const field = (
    name: keyof ItemFormValues,
    label: string,
    opts: {
      type?: string
      inputMode?: 'numeric' | 'decimal'
      disabled?: boolean
      help?: string
      className?: string
      suffix?: string
    } = {},
  ) => {
    const err = errors[name]?.message
    const id = `f-${name}`
    return (
      <div className={cn('flex flex-col gap-1', opts.className)}>
        <label htmlFor={id} className="text-label text-ink-600">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id={id}
            type={opts.type ?? 'text'}
            inputMode={opts.inputMode}
            disabled={opts.disabled}
            aria-invalid={Boolean(err)}
            aria-describedby={err ? `${id}-err` : opts.help ? `${id}-help` : undefined}
            className={cn(
              'h-9 w-full rounded border bg-panel px-2.5 text-body disabled:bg-panel-alt disabled:text-ink-500',
              err ? 'border-st-stockout' : 'border-line-hi',
              opts.inputMode && 'num text-qty',
            )}
            {...register(name)}
          />
          {opts.suffix && <span className="shrink-0 text-[12px] text-ink-500">{opts.suffix}</span>}
        </div>
        {err ? (
          <p id={`${id}-err`} role="alert" className="text-[12px] text-st-ink-stockout">
            {String(err)}
          </p>
        ) : (
          opts.help && (
            <p id={`${id}-help`} className="text-[12px] text-ink-500">
              {opts.help}
            </p>
          )
        )}
      </div>
    )
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (v) => {
        const r = await onSubmit(v)
        if (r) setError('root', { message: r })
      })}
      className="flex flex-col gap-5"
    >
      <Section title="基本情報">
        {field('sku', 'SKU', {
          disabled: mode === 'edit',
          help:
            mode === 'edit' ? 'SKU は履歴の照合に使うため、登録後は変えられません' : '半角英数字とハイフン',
        })}
        {field('name', '商品名', { className: 'sm:col-span-2' })}
        {field('jan', 'JAN', { inputMode: 'numeric', help: '8桁または13桁。空でも登録できます' })}
        <div className="flex flex-col gap-1">
          <label htmlFor="f-categoryId" className="text-label text-ink-600">
            カテゴリ
          </label>
          <select
            id="f-categoryId"
            className="h-9 rounded border border-line-hi bg-panel px-2 text-body"
            {...register('categoryId')}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="単位" note="在庫は常に最小単位で数えます。入庫はケース、出庫はバラ、のように打てます。">
        {field('baseUnit', '最小単位', {
          disabled: mode === 'edit',
          help:
            mode === 'edit'
              ? '最小単位を変えると過去の数量の意味が変わるため、変えられません'
              : '例：本・個・袋',
        })}
        {field('caseName', 'まとめ単位の名前', { help: '例：ケース' })}
        {field('caseQty', 'まとめ単位の入数', { inputMode: 'numeric', help: '1ケースに入る最小単位の数' })}
      </Section>

      <Section title="価格">
        {field('cost', '原価', {
          inputMode: 'decimal',
          suffix: '円',
          disabled: mode === 'edit',
          help:
            mode === 'edit'
              ? '原価は入庫のたびに移動平均で更新されます'
              : '最初の原価。以後は入庫で更新されます',
        })}
        {field('price', '売価', { inputMode: 'decimal', suffix: '円' })}
      </Section>

      <Section title="補充" note={hint}>
        {field('reorderPoint', '発注点', {
          inputMode: 'numeric',
          help: '有効在庫＋入荷予定がこれを下回ったら発注',
        })}
        {field('safetyStock', '安全在庫', { inputMode: 'numeric' })}
        {field('orderLot', '発注ロット', { inputMode: 'numeric', help: '推奨数量をこの単位で切り上げます' })}
        {field('leadTimeDays', 'リードタイム', { inputMode: 'numeric', suffix: '日' })}
        <div className="flex flex-col gap-1">
          <label htmlFor="f-defaultSupplierId" className="text-label text-ink-600">
            仕入先
          </label>
          <select
            id="f-defaultSupplierId"
            className="h-9 rounded border border-line-hi bg-panel px-2 text-body"
            {...register('defaultSupplierId')}
          >
            <option value="">未設定</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="管理方式">
        <label className="flex items-center gap-2 text-body">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            disabled={mode === 'edit'}
            {...register('isLotManaged')}
          />
          ロット・期限を管理する
        </label>
        {lot && field('shelfLifeDays', '賞味期間（入荷から）', { inputMode: 'numeric', suffix: '日' })}
        {mode === 'edit' && (
          <label className="flex items-center gap-2 text-body">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register('isActive')} />
            取扱中（外すと一覧に出なくなります）
          </label>
        )}
      </Section>

      {errors.root?.message && (
        <p
          role="alert"
          className="border-st-stockout/40 bg-st-stockout/5 rounded border px-4 py-3 text-body text-st-ink-stockout"
        >
          {errors.root.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel}>
          やめる
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? '保存しています…' : mode === 'new' ? '商品を登録する' : '変更を保存する'}
        </Button>
      </div>
    </form>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-line bg-panel">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-section">{title}</h2>
        {note && <p className="mt-0.5 text-[12px] text-ink-600">{note}</p>}
      </div>
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}
