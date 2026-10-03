'use client'
// SC-001 ダッシュボード（Phase 0 時点の先行版）
// Phase 0 で作った在庫エンジン・スコープ・水位バーを、実データで確かめるための画面
import { getDashboard, getSpotlight } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { PageTitle } from '@/components/layout/PageTitle'
import { MetricCard } from '@/components/domain/MetricCard'
import { SkeletonBlock } from '@/components/domain/Skeleton'
import { StockStatusBadge } from '@/components/domain/StockStatusBadge'
import { StatusStrip } from '@/components/domain/StatusStrip'
import { FourNumbers } from '@/components/gauge/FourNumbers'
import { GaugePanel } from '@/components/gauge/GaugePanel'

export function DashboardView() {
  const dash = useRepo(getDashboard)
  const spot = useRepo(getSpotlight)
  const d = dash.data

  return (
    <>
      <PageTitle
        title="ダッシュボード"
        lead={
          d
            ? `${d.scopeLabel}・${d.skuCount.toLocaleString('ja-JP')} SKU。すべての数字は、入出庫の履歴を積み上げて計算しています。`
            : ' '
        }
      />

      <section aria-labelledby="level" className="mb-5 rounded border border-line bg-panel px-5 py-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="level" className="text-section">
            倉庫の水位
          </h2>
          <p className="text-[12px] text-ink-500">
            {d ? `拠点ごとの在庫 ${d.rowCount.toLocaleString('ja-JP')} 行を、有効在庫で判定` : '\u00a0'}
          </p>
        </div>
        {d ? (
          <StatusStrip counts={d.statusCounts} total={d.rowCount} idle={d.idleItems} />
        ) : (
          <SkeletonBlock className="h-[56px] w-full" />
        )}
      </section>

      <section aria-labelledby="metrics" className="mb-6">
        <h2 id="metrics" className="sr-only">
          対応が必要なこと
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {d ? (
            <>
              <MetricCard
                label="欠品"
                value={d.stockoutRisk}
                unit="件"
                tone="stockout"
                hint="有効在庫が0以下"
              />
              <MetricCard
                label="要発注"
                value={d.needsReorder}
                unit="件"
                tone="low"
                hint="有効在庫＋入荷予定が発注点未満"
              />
              <MetricCard
                label="期限間近・期限切れ"
                value={d.expiringItems}
                unit="件"
                tone="low"
                hint="ロットの期限で判定"
              />
              <MetricCard
                label="未承認の棚卸差異"
                value={d.pendingVarianceStocktakes}
                unit="件"
                hint="承認まで在庫は動きません"
              />
              <MetricCard
                label="遅延している発注"
                value={d.delayedPurchaseOrders}
                unit="件"
                hint="入荷予定日を過ぎた発注"
              />
              {d.stockValue !== undefined ? (
                <MetricCard label="在庫金額" value={d.stockValue} money hint="移動平均法で評価" />
              ) : (
                <MetricCard
                  label="移動中の在庫"
                  value={d.inTransitTransfers}
                  unit="件"
                  hint="拠点間で輸送中"
                />
              )}
            </>
          ) : (
            Array.from({ length: 6 }, (_, i) => <SkeletonBlock key={i} className="h-[106px] rounded" />)
          )}
        </div>
      </section>

      <section aria-labelledby="four" className="rounded border border-line bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id="four" className="text-section">
              在庫数は、ひとつではありません
            </h2>
            <p className="mt-1 text-body text-ink-600">
              実在庫から引当済を引いたものが「売れる在庫」。発注の判断は、有効在庫に入荷予定を足して行います。
            </p>
          </div>
          {spot.data && (
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-600">
              <span className="num whitespace-nowrap text-[13px] text-ink-900">{spot.data.sku}</span>
              <span className="min-w-0">{spot.data.item.name}</span>
              <span className="whitespace-nowrap text-ink-500">{spot.data.warehouseName}</span>
              <StockStatusBadge state={spot.data.snapshot.status} />
            </div>
          )}
        </div>
        <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-center lg:gap-10">
          {spot.data ? (
            <>
              <div>
                <FourNumbers
                  onHand={spot.data.snapshot.onHand}
                  allocated={spot.data.snapshot.allocated}
                  incoming={spot.data.snapshot.incoming}
                  inTransit={spot.data.snapshot.inTransit}
                  unit={spot.data.item.baseUnit}
                />
              </div>
              <GaugePanel
                onHand={spot.data.snapshot.onHand}
                allocated={spot.data.snapshot.allocated}
                incoming={spot.data.snapshot.incoming}
                reorderPoint={spot.data.snapshot.reorderPoint}
                safetyStock={spot.data.snapshot.safetyStock}
                excessLine={spot.data.excessLine}
                unit={spot.data.item.baseUnit}
              />
            </>
          ) : (
            <>
              <SkeletonBlock className="h-[88px] w-[360px] max-w-full" />
              <SkeletonBlock className="h-[88px] w-full" />
            </>
          )}
        </div>
      </section>
    </>
  )
}
