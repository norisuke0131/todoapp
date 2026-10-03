// 画面の好み（サイドバーの折りたたみ・行の高さ・ガイドツアー）
import type { Result } from '@/lib/types'
import { getStores } from '@/lib/store'
import { ok, run } from './_context'

export type UiPrefs = {
  sidebarCollapsed: boolean
  density: 'standard' | 'compact'
  tourDismissed: boolean
  columns: Record<string, string[]>
}

export async function getUiPrefs(): Promise<Result<UiPrefs>> {
  return run(() => {
    const { sidebarCollapsed, density, tourDismissed, columns } = getStores().ui.getState()
    return ok({ sidebarCollapsed, density, tourDismissed, columns: columns ?? {} })
  })
}

export async function setUiPrefs(patch: Partial<UiPrefs>): Promise<Result<UiPrefs>> {
  getStores().ui.getState().set(patch)
  return getUiPrefs()
}

/** 一覧の表示列を保存する（FR-202） */
export async function setTableColumns(table: string, columns: string[]): Promise<Result<UiPrefs>> {
  const cur = getStores().ui.getState().columns ?? {}
  getStores()
    .ui.getState()
    .set({ columns: { ...cur, [table]: columns } })
  return getUiPrefs()
}
