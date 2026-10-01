// デモのロール切替（F-C01, FR-706）と、画面が使う権限情報
import type { Result, Role } from '@/lib/types'
import { getStores } from '@/lib/store'
import { ctx, ok, run } from './_context'
import { DENY_REASON, type Permission } from './_scope'

export type SessionInfo = {
  role: Role
  userId: string
  userName: string
  staffWarehouseId: string
  allWarehouses: boolean
  warehouses: { id: string; name: string; visible: boolean }[]
  /** 権限ごとの可否と、不可のときの理由（FR-712 のツールチップ用） */
  permissions: Record<Permission, { allowed: boolean; reason?: string }>
}

export const ROLE_LABEL: Record<Role, string> = { staff: '現場担当', keeper: '在庫管理者', admin: '管理者' }

export async function getSession(): Promise<Result<SessionInfo>> {
  return run(() => {
    const c = ctx()
    const s = getStores().session.getState()
    const permissions = Object.fromEntries(
      (Object.keys(DENY_REASON) as Permission[]).map((p) => {
        const allowed = c.scope.can(p)
        return [p, allowed ? { allowed } : { allowed, reason: DENY_REASON[p] }]
      }),
    ) as SessionInfo['permissions']
    return ok({
      role: c.scope.role,
      userId: c.scope.userId,
      userName: c.scope.userName,
      staffWarehouseId: s.staffWarehouseId,
      allWarehouses: c.scope.allWarehouses,
      warehouses: c.data.warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        visible: c.scope.warehouseIds.includes(w.id),
      })),
      permissions,
    })
  })
}

export async function switchRole(role: Role, staffWarehouseId?: string): Promise<Result<SessionInfo>> {
  const s = getStores().session.getState()
  s.setRole(role)
  if (staffWarehouseId) s.setStaffWarehouse(staffWarehouseId)
  return getSession()
}
