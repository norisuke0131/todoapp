'use client'
// 3ロールのワンクリック切替（FR-706）と、現場担当の拠点選択
import type { Role } from '@/lib/types'
import { switchRole, type SessionInfo } from '@/lib/repo'
import { cn } from '@/lib/utils/cn'

const ROLES: { id: Role; label: string }[] = [
  { id: 'staff', label: '現場担当' },
  { id: 'keeper', label: '在庫管理者' },
  { id: 'admin', label: '管理者' },
]

export function RoleSwitcher({ session }: { session?: SessionInfo }) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="radiogroup"
        aria-label="デモのロール"
        className="flex rounded-sm border border-demo-line p-0.5"
      >
        {ROLES.map((r) => {
          const active = session?.role === r.id
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => void switchRole(r.id)}
              className={cn(
                'h-6 rounded-sm px-2.5 text-[12px] font-bold leading-none transition-colors duration-80',
                active ? 'bg-demo-ink text-demo-bg' : 'text-demo-dim hover:text-demo-ink',
              )}
            >
              {r.label}
            </button>
          )
        })}
      </div>
      {session?.role === 'staff' && (
        <label className="flex items-center gap-1.5 text-[12px] text-demo-dim">
          <span className="sr-only sm:not-sr-only">担当</span>
          <select
            value={session.staffWarehouseId}
            onChange={(e) => void switchRole('staff', e.target.value)}
            className="h-7 rounded-sm border border-demo-line bg-demo-bg px-1.5 text-[12px] font-bold text-demo-ink"
          >
            {session.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
