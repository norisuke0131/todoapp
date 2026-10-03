'use client'
// 取り消し可能な操作トースト（IX-06）：破壊的操作の後、5秒間「元に戻す」を出す
// 右下から 160ms で出し、読み上げは aria-live で行う
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

type Toast = {
  id: number
  message: string
  tone?: 'info' | 'error'
  undo?: () => void | Promise<void>
  duration?: number
}
type Ctx = { show(t: Omit<Toast, 'id'>): void }

const ToastContext = createContext<Ctx>({ show: () => {} })

export function useToast(): Ctx {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])
  const show = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current
    setToasts((ts) => [...ts.slice(-2), { ...t, id }])
  }, [])
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const h = setTimeout(onDone, toast.duration ?? (toast.undo ? 5000 : 3500))
    return () => clearTimeout(h)
  }, [toast, onDone])
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex items-center gap-3 rounded bg-ink-900 px-4 py-3 text-body text-white shadow-pop motion-safe:animate-[toast-in_160ms_ease-out]',
        toast.tone === 'error' && 'border-l-[3px] border-st-stockout',
      )}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          className="shrink-0 rounded-sm px-2 py-1 text-[12px] font-bold text-primary-50 underline-offset-2 hover:underline"
          onClick={async () => {
            await toast.undo?.()
            onDone()
          }}
        >
          元に戻す
        </button>
      )}
      <button
        type="button"
        aria-label="閉じる"
        onClick={onDone}
        className="shrink-0 rounded-sm p-1 text-white/70 hover:text-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
