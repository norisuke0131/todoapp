'use client'
// SC-020 拠点・ロケーション：棚番の階層（エリア→列→段）と巡回順、棚ごとの商品数
import { listLocations } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { cn } from '@/lib/utils/cn'
import { PageTitle } from '@/components/layout/PageTitle'
import { SkeletonBlock } from '@/components/domain/Skeleton'

export default function LocationsPage() {
  const list = useRepo(listLocations)
  return (
    <>
      <PageTitle
        title="拠点・ロケーション"
        lead="棚番は「エリア-列-段」。数字はピッキングで回る順番（巡回順）です。マスの濃さはその棚に置いている商品の数を表します。"
      />
      {!list.data ? (
        <SkeletonBlock className="h-[480px] w-full rounded" />
      ) : (
        <div className="flex flex-col gap-5">
          {list.data.map((w) => {
            const max = Math.max(1, ...w.areas.flatMap((a) => a.locations.map((l) => l.itemCount)))
            return (
              <section key={w.warehouse.id} className="rounded border border-line bg-panel">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
                  <h2 className="text-section">
                    {w.warehouse.name}
                    <span className="num ml-2 text-[13px] font-normal text-ink-500">{w.warehouse.code}</span>
                  </h2>
                  <p className="text-[12px] text-ink-600">
                    {w.warehouse.address}・<span className="num text-[13px] text-ink-900">{w.skuCount}</span>{' '}
                    SKU
                  </p>
                </div>
                <div className="grid gap-5 px-5 py-5 md:grid-cols-3">
                  {w.areas.map((a) => {
                    const rows = [...new Set(a.locations.map((l) => l.code.split('-')[1]))]
                    return (
                      <div key={a.area}>
                        <h3 className="mb-2 flex items-baseline gap-2 text-label text-ink-600">
                          エリア {a.area}
                          <span className="font-normal">
                            {a.area === 'C' ? '食品・飲料・調味料（ロット管理）' : '雑貨・資材'}
                          </span>
                        </h3>
                        <table className="w-full border-separate border-spacing-1 text-[12px]">
                          <caption className="sr-only">
                            {w.warehouse.name} エリア{a.area} の棚
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col" className="w-10 text-left font-normal text-ink-500">
                                列
                              </th>
                              {[4, 3, 2, 1].map((lv) => (
                                <th key={lv} scope="col" className="font-normal text-ink-500">
                                  {lv}段
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r}>
                                <th
                                  scope="row"
                                  className="num text-left text-[12px] font-semibold text-ink-600"
                                >
                                  {r}
                                </th>
                                {[4, 3, 2, 1].map((lv) => {
                                  const l = a.locations.find((x) => x.code === `${a.area}-${r}-${lv}`)
                                  if (!l) return <td key={lv} />
                                  const ratio = l.itemCount / max
                                  return (
                                    <td key={lv}>
                                      <div
                                        title={`${l.code}：${l.itemCount} SKU・巡回順 ${l.sortOrder}`}
                                        className={cn(
                                          'flex h-11 flex-col justify-between rounded-sm border px-1.5 py-1 text-ink-900',
                                          // 濃淡は淡いティールの3段階。色を強くしすぎない（色は在庫状態のためにとっておく）
                                          ratio > 0.66
                                            ? 'border-[#8fbcc0] bg-[#b9d9dc]'
                                            : ratio > 0.33
                                              ? 'border-[#b9d9dc] bg-[#d5e9eb]'
                                              : ratio > 0
                                                ? 'border-line bg-primary-50'
                                                : 'border-line bg-panel-alt text-ink-500',
                                        )}
                                      >
                                        <span className="num text-[11px] leading-none">{l.code}</span>
                                        <span className="flex items-baseline justify-between">
                                          <span className="num text-[10px] leading-none text-ink-600">
                                            #{l.sortOrder}
                                          </span>
                                          <span className="num text-[13px] leading-none">{l.itemCount}</span>
                                        </span>
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
