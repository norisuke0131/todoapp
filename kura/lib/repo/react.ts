'use client'
// 画面からリポジトリを購読するフック。データ・ロール・設定が変わると自動で取り直す
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Result } from '@/lib/types'
import { subscribe } from './_context'

export type RepoState<T> = { data?: T; error?: string; loading: boolean; reload(): void }

export function useRepo<T>(fetcher: () => Promise<Result<T>>, deps: unknown[] = []): RepoState<T> {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher
  const seq = useRef(0)

  const load = useCallback(() => {
    const mine = ++seq.current
    void fetchRef.current().then((r) => {
      if (mine !== seq.current) return // 古い応答は捨てる
      setState(r.ok ? { data: r.data, loading: false } : { error: r.error, loading: false })
    })
  }, [])

  useEffect(() => {
    load()
    return subscribe(load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { ...state, reload: load }
}
