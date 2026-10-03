'use client'
// SC-021 取引先：仕入先・出荷先、リードタイム、最小発注金額
import { useState } from 'react'
import { listPartners } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { fmtYen } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { PageTitle } from '@/components/layout/PageTitle'
import { SkeletonBlock } from '@/components/domain/Skeleton'

export default function PartnersPage() {
  const list = useRepo(listPartners)
  const [kind, setKind] = useState<'supplier' | 'customer'>('supplier')
  const rows = (list.data ?? []).filter((p) => p.kind === kind)
  return (
    <>
      <PageTitle
        title="取引先"
        lead="仕入先のリードタイムは発注点の推奨値に、最小発注金額は推奨発注リストの判定に使います。"
      />
      <div role="tablist" aria-label="取引先の区分" className="mb-3 flex gap-1">
        {(
          [
            ['supplier', '仕入先'],
            ['customer', '出荷先'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'h-8 rounded-sm px-3 text-[12px] font-bold',
              kind === k ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-panel',
            )}
          >
            {label}
            <span className="num ml-1.5 opacity-80">
              {(list.data ?? []).filter((p) => p.kind === k).length}
            </span>
          </button>
        ))}
      </div>
      {!list.data ? (
        <SkeletonBlock className="h-[420px] w-full rounded" />
      ) : (
        <section className="overflow-x-auto rounded border border-line bg-panel">
          <table className="w-full min-w-[560px] text-body">
            <caption className="sr-only">{kind === 'supplier' ? '仕入先' : '出荷先'}の一覧</caption>
            <thead>
              <tr className="border-b border-line-hi bg-panel-alt text-label text-ink-600">
                <th scope="col" className="h-9 w-24 px-4 text-left">
                  コード
                </th>
                <th scope="col" className="px-3 text-left">
                  名称
                </th>
                {kind === 'supplier' && (
                  <>
                    <th scope="col" className="w-32 px-3 text-right">
                      リードタイム
                    </th>
                    <th scope="col" className="w-36 px-4 text-right">
                      最小発注金額
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="h-[38px] border-b border-line last:border-0">
                  <td className="num px-4 text-[13px] text-ink-600">{p.code}</td>
                  <th scope="row" className="px-3 text-left font-normal">
                    {p.name}
                  </th>
                  {kind === 'supplier' && (
                    <>
                      <td className="num px-3 text-right text-qty">
                        {p.leadTimeDays}
                        <span className="ml-0.5 font-sans text-[10px] font-normal text-ink-500">日</span>
                      </td>
                      <td className="num px-4 text-right text-qty">{fmtYen(p.minOrderAmount)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}
