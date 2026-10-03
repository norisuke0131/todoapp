'use client'
// スキャン入力欄（IX-03）：常にフォーカスを保ち、スキャン後もフォーカスを失わない
// ハンディ端末はキーボードとして「コード＋Enter」を送ってくる（FR-303）
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type ScanInputHandle = { focus(): void }

type Props = {
  onScan: (raw: string) => void
  label?: string
  /** 欄の外を押しても、ほかの入力欄でなければここへ戻す */
  sticky?: boolean
  className?: string
}

export const ScanInput = forwardRef<ScanInputHandle, Props>(function ScanInput(
  { onScan, label = 'バーコード', sticky = true, className },
  ref,
) {
  const input = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }))

  useEffect(() => {
    input.current?.focus()
    if (!sticky) return
    // 何もない所を押してフォーカスが body に落ちたら、スキャン欄へ戻す
    const onDown = () =>
      setTimeout(() => {
        const a = document.activeElement
        if (!a || a === document.body) input.current?.focus({ preventScroll: true })
      }, 0)
    document.addEventListener('pointerup', onDown)
    return () => document.removeEventListener('pointerup', onDown)
  }, [sticky])

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor="scan-input" className="flex items-center justify-between text-label text-ink-600">
        <span>{label}</span>
        <span
          className={cn(
            'flex items-center gap-1.5 font-normal tracking-normal',
            focused ? 'text-st-ink-normal' : 'text-st-ink-low',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              focused ? 'bg-st-normal motion-safe:animate-pulse' : 'bg-st-low',
            )}
          />
          {focused ? 'スキャン待ち' : 'ここを押すとスキャンを受け付けます'}
        </span>
      </label>
      <div
        className={cn(
          'flex h-12 items-center gap-2 rounded border-2 bg-panel px-3 transition-colors duration-80',
          focused ? 'border-primary' : 'border-line-hi',
        )}
      >
        <ScanLine aria-hidden className="size-5 shrink-0 text-ink-500" />
        <input
          ref={input}
          id="scan-input"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="enter"
          placeholder="JAN・SKU をスキャン（3*コード で3個）"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const v = e.currentTarget.value
            e.currentTarget.value = ''
            if (v.trim()) onScan(v)
          }}
          className="num h-full min-w-0 flex-1 bg-transparent text-[18px] tracking-wide text-ink-900 outline-none placeholder:font-sans placeholder:text-[13px] placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-500"
        />
      </div>
    </div>
  )
})
