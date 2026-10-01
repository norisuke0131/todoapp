// 画面の好み（サイドバーの折りたたみ・行の高さ・ガイドツアー）
import type { Result } from '@/lib/types'
import { getStores } from '@/lib/store'
import { ok, run } from './_context'

export type UiPrefs = { sidebarCollapsed: boolean; density: 'standard' | 'compact'; tourDismissed: boolean }

export async function getUiPrefs(): Promise<Result<UiPrefs>> {
  return run(() => {
    const { sidebarCollapsed, density, tourDismissed } = getStores().ui.getState()
    return ok({ sidebarCollapsed, density, tourDismissed })
  })
}

export async function setUiPrefs(patch: Partial<UiPrefs>): Promise<Result<UiPrefs>> {
  getStores().ui.getState().set(patch)
  return getUiPrefs()
}
