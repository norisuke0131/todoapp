// 保存ビュー（F-C05, FR-207）
import type { Result, SavedView } from '@/lib/types'
import { getStores } from '@/lib/store'
import { ctx, err, ok, run, newId } from './_context'
import { delay } from './_delay'
import { DENY_REASON } from './_scope'

export async function listViews(target: SavedView['target']): Promise<Result<SavedView[]>> {
  return run(() => {
    const c = ctx()
    return ok(c.data.views.filter((v) => v.target === target && (v.isShared || v.ownerId === c.scope.userId)))
  })
}

export async function saveView(
  view: Omit<SavedView, 'id' | 'ownerId'> & { id?: string },
): Promise<Result<SavedView>> {
  return run(async () => {
    const c = ctx()
    if (view.isShared && !c.scope.can('view.share')) return err(DENY_REASON['view.share'])
    if (!view.name.trim()) return err('ビューの名前を入力してください')
    const existing = view.id ? c.data.views.find((v) => v.id === view.id) : undefined
    if (existing && existing.ownerId !== c.scope.userId && !c.scope.can('admin.access'))
      return err('他の人のビューは編集できません')
    await delay()
    const saved: SavedView = {
      ...view,
      id: view.id ?? newId('view'),
      ownerId: existing?.ownerId ?? c.scope.userId,
    }
    getStores().data.getState().upsert('views', saved)
    return ok(saved)
  })
}

export async function deleteView(id: string): Promise<Result<true>> {
  return run(async () => {
    const c = ctx()
    const v = c.data.views.find((x) => x.id === id)
    if (!v) return err('ビューが見つかりません')
    if (v.ownerId !== c.scope.userId && !c.scope.can('admin.access'))
      return err('他の人のビューは削除できません')
    await delay()
    getStores().data.getState().remove('views', id)
    return ok(true)
  })
}
