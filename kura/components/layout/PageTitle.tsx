import type { ReactNode } from 'react'

export function PageTitle({
  title,
  lead,
  actions,
}: {
  title: string
  lead?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-page-title text-ink-900">{title}</h1>
        {lead && <p className="mt-1 text-body text-ink-600">{lead}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
