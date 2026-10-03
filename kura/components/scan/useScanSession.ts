'use client'
// スキャンの状態と読み上げ（A11Y-10：成功・失敗を aria-live で知らせる）
import { useCallback, useMemo, useState } from 'react'
import {
  buildCatalog,
  EMPTY_SCAN,
  dropUnknown,
  holdUnknown,
  removeLine,
  scan,
  setQty,
  type ScanState,
} from '@/lib/scan'
import { getScanCatalog } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'

export function useScanSession() {
  const raw = useRepo(getScanCatalog)
  const catalog = useMemo(() => buildCatalog(raw.data ?? []), [raw.data])
  const [state, setState] = useState<ScanState>(EMPTY_SCAN)
  const [message, setMessage] = useState('')

  const onScan = useCallback(
    (code: string) => {
      setState((s) => {
        const next = scan(s, catalog, code)
        if (next.last?.kind === 'hit') {
          const line = next.lines[0]!
          setMessage(`${line.name}、${line.qty}${line.baseUnit}`)
        } else if (next.last?.kind === 'miss') {
          setMessage(`登録のないバーコードです：${next.last.code}`)
        }
        return next
      })
    },
    [catalog],
  )

  return {
    ready: Boolean(raw.data),
    catalog,
    state,
    message,
    onScan,
    setQty: (itemId: string, qty: number) => setState((s) => setQty(s, itemId, qty)),
    remove: (itemId: string) => setState((s) => removeLine(s, itemId)),
    hold: (code: string) => setState((s) => holdUnknown(s, code)),
    drop: (code: string) => setState((s) => dropUnknown(s, code)),
    reset: () => setState(EMPTY_SCAN),
    setState,
  }
}
