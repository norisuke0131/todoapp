'use client'
// 一覧の状態（キーワード・条件・並び・表示列）を URL と同期する（FR-205）
// URL をそのまま共有すれば、相手の画面でも同じ一覧が再現される
import { useCallback, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { fromSearchParams, toSearchParams, toggleSort, type QueryState } from '@/lib/query'
import type { Filter } from '@/lib/types'

export function useListQuery() {
  const params = useSearchParams()
  const pathname = usePathname()
  const state = useMemo(() => fromSearchParams(new URLSearchParams(params.toString())), [params])

  // ★ 遷移（サーバーへの問い合わせ）を起こさず URL だけ書き換える。絞り込みは即座に反映（IX-01, NFR-05）
  // Next.js は history.replaceState を useSearchParams に同期する
  const set = useCallback(
    (next: QueryState) => {
      const qs = toSearchParams(next).toString()
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname],
  )

  return {
    state,
    set,
    /** 手で条件を変えたら、ビューからは外れる */
    patch: (p: Partial<QueryState>) => set({ ...state, viewId: undefined, ...p }),
    setQ: (q: string) => set({ ...state, q }),
    addFilter: (f: Filter) =>
      set({
        ...state,
        viewId: undefined,
        filters: [...state.filters.filter((x) => !(x.field === f.field && x.operator === f.operator)), f],
      }),
    removeFilter: (i: number) =>
      set({ ...state, viewId: undefined, filters: state.filters.filter((_, k) => k !== i) }),
    clearFilters: () => set({ ...state, viewId: undefined, filters: [], q: '' }),
    toggleSort: (field: string, multi: boolean) =>
      set({ ...state, sort: toggleSort(state.sort, field, multi) }),
  }
}
