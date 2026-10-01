'use client'
// 権限外の画面の案内（FR-711）：素の 404 を出さず、その場でロールを切り替えられるようにする
import type { ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'
import type { Role } from '@/lib/types'
import { switchRole, type Permission, type SessionInfo } from '@/lib/repo'
import { ROLE_LABEL } from '@/lib/repo/session'
import { Button } from '@/components/ui/button'

const MIN_ROLE: Partial<Record<Permission, Role>> = { 'admin.access': 'admin' }

export function PermissionGate({
  session,
  need,
  children,
  title,
}: {
  session?: SessionInfo
  need: Permission
  children: ReactNode
  title: string
}) {
  if (!session) return null
  const p = session.permissions[need]
  if (p.allowed) return <>{children}</>
  const to = MIN_ROLE[need] ?? 'keeper'
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-start rounded border border-line bg-panel p-6">
      <span className="grid size-10 place-items-center rounded-sm bg-panel-alt">
        <LockKeyhole aria-hidden className="size-5 text-ink-600" />
      </span>
      <h2 className="mt-4 text-section">
        {title}は、{ROLE_LABEL[to]}
        {to === 'admin' ? 'のみ' : '以上'}が使える画面です
      </h2>
      <p className="mt-1.5 text-body text-ink-600">
        {p.reason}。いまは「{ROLE_LABEL[session.role]}
        」として操作しています。実際の運用でも、この画面は権限で出し分けます。
      </p>
      <Button variant="primary" className="mt-5" onClick={() => void switchRole(to)}>
        {ROLE_LABEL[to]}に切り替えて開く
      </Button>
    </div>
  )
}
