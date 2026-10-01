// 設定（SC-500）とデモのリセット（F-C07, FR-709）
import type { Result } from '@/lib/types'
import { getStores, STORAGE_PREFIX, type Settings } from '@/lib/store'
import { ctx, err, ok, run } from './_context'
import { delay } from './_delay'
import { DENY_REASON } from './_scope'

export async function getSettings(): Promise<Result<Settings>> {
  return run(() => {
    const { idleThresholdDays, includeExpiredInStock, forbidSelfApproval } = getStores().settings.getState()
    return ok({ idleThresholdDays, includeExpiredInStock, forbidSelfApproval })
  })
}

export async function updateSettings(patch: Partial<Settings>): Promise<Result<Settings>> {
  return run(async () => {
    const c = ctx()
    if (!c.scope.can('master.write')) return err(DENY_REASON['master.write'])
    if (patch.idleThresholdDays !== undefined && patch.idleThresholdDays < 1)
      return err('滞留の日数は1以上で入力してください')
    await delay()
    getStores().settings.getState().update(patch)
    return getSettings()
  })
}

/** デモをリセット：localStorage の KURA のデータを消し、初期状態に戻す */
export async function resetDemo(): Promise<Result<true>> {
  return run(async () => {
    const s = getStores()
    s.data.getState().reset()
    s.settings.getState().reset()
    s.session.setState({ role: 'keeper', staffWarehouseId: 'wh-tokyo' })
    s.ui.setState({ tourDismissed: false })
    if (typeof window !== 'undefined') {
      try {
        for (const k of Object.keys(window.localStorage))
          if (k.startsWith(STORAGE_PREFIX)) window.localStorage.removeItem(k)
      } catch {
        // 保存領域が使えない環境では、メモリ上のリセットだけで十分
      }
    }
    await delay(150, 250)
    return ok(true)
  })
}
