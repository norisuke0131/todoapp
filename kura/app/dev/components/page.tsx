'use client'
// コンポーネントカタログ（0-6）。水位バーの全パターンを並べて確認する
// ※ 本番では非公開にする（5-6）
import { getSession } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { PageTitle } from '@/components/layout/PageTitle'
import { StockGauge } from '@/components/gauge/StockGauge'
import { GaugeTooltip } from '@/components/gauge/GaugeTooltip'
import { GaugePanel } from '@/components/gauge/GaugePanel'
import { FourNumbers } from '@/components/gauge/FourNumbers'
import { StockStatusBadge, type BadgeState } from '@/components/domain/StockStatusBadge'
import { ExpiryBadge } from '@/components/domain/ExpiryBadge'
import { MetricCard } from '@/components/domain/MetricCard'
import { EmptyState } from '@/components/domain/EmptyState'
import { TableSkeleton } from '@/components/domain/Skeleton'
import { PermissionGate } from '@/components/demo/PermissionGate'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { fmtQty } from '@/lib/utils/format'
import type { GaugeValues } from '@/components/gauge/scale'

type Pattern = { name: string; state: BadgeState; g: GaugeValues }

const base = { reorderPoint: 60, safetyStock: 40, excessLine: 200 }
const PATTERNS: Pattern[] = [
  { name: '欠品', state: 'stockout', g: { ...base, onHand: 0, allocated: 0, incoming: 0 } },
  {
    name: '棚にはあるが全量引当済',
    state: 'stockout',
    g: { ...base, onHand: 30, allocated: 30, incoming: 0 },
  },
  { name: '発注点以下', state: 'below_reorder', g: { ...base, onHand: 48, allocated: 0, incoming: 0 } },
  {
    name: '発注点以下（入荷予定あり）',
    state: 'below_reorder',
    g: { ...base, onHand: 52, allocated: 0, incoming: 70 },
  },
  {
    name: '実在庫は十分、引当で発注点割れ',
    state: 'below_reorder',
    g: { ...base, onHand: 110, allocated: 70, incoming: 0 },
  },
  { name: '適正（SKU-1042）', state: 'normal', g: { ...base, onHand: 120, allocated: 30, incoming: 60 } },
  { name: '適正（引当なし）', state: 'normal', g: { ...base, onHand: 150, allocated: 0, incoming: 0 } },
  { name: '過剰', state: 'excess', g: { ...base, onHand: 280, allocated: 10, incoming: 0 } },
  { name: '目盛りを超える過剰', state: 'excess', g: { ...base, onHand: 620, allocated: 40, incoming: 140 } },
  { name: '滞留（出庫なし 140日）', state: 'idle', g: { ...base, onHand: 90, allocated: 0, incoming: 0 } },
  { name: '実在庫を超える引当', state: 'stockout', g: { ...base, onHand: 20, allocated: 35, incoming: 60 } },
]

export default function ComponentCatalog() {
  const session = useRepo(getSession)
  return (
    <>
      <PageTitle
        title="コンポーネントカタログ"
        lead="Phase 0 のデザインシステム。水位バーの全パターン、4数値ブロック、状態表示、空状態を確認します。"
      />

      <Section
        title="在庫水位バー（行内 120×6px）"
        note="一覧の各行に入る形。ホバー／フォーカスで4つの在庫数を表示します。"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-body">
            <caption className="sr-only">水位バーのパターン</caption>
            <thead>
              <tr className="border-b border-line-hi bg-panel-alt text-left text-label text-ink-600">
                <th scope="col" className="h-9 px-3">
                  パターン
                </th>
                <th scope="col" className="px-3 text-right">
                  実在庫
                </th>
                <th scope="col" className="px-3 text-right">
                  引当済
                </th>
                <th scope="col" className="px-3 text-right">
                  有効在庫
                </th>
                <th scope="col" className="px-3 text-right">
                  入荷予定
                </th>
                <th scope="col" className="px-3">
                  水位
                </th>
                <th scope="col" className="px-3">
                  状態
                </th>
              </tr>
            </thead>
            <tbody>
              {PATTERNS.map((p) => (
                <tr
                  key={p.name}
                  className="hover:bg-primary-50/50 h-[38px] border-b border-line last:border-0"
                >
                  <th scope="row" className="px-3 text-left font-normal">
                    {p.name}
                  </th>
                  <Num v={p.g.onHand} />
                  <Num v={p.g.allocated} />
                  <Num v={p.g.onHand - p.g.allocated} strong />
                  <Num v={p.g.incoming} plus />
                  <td className="px-3">
                    <GaugeTooltip values={p.g} unit="本">
                      <StockGauge {...p.g} unit="本" />
                    </GaugeTooltip>
                  </td>
                  <td className="px-3">
                    <StockStatusBadge state={p.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section
          title="水位計（詳細サイズ・高さ 14px）"
          note="商品詳細と埋め込みで使う形。区間・目盛り・凡例つき。"
        >
          <GaugePanel {...PATTERNS[5]!.g} unit="本" />
        </Section>
        <Section title="4数値ブロック" note="実在庫 − 引当済 = 有効在庫。有効在庫だけを大きく。">
          <div className="flex flex-col gap-6">
            <FourNumbers onHand={120} allocated={30} incoming={60} unit="本" />
            <FourNumbers onHand={20} allocated={35} incoming={60} inTransit={24} unit="本" />
          </div>
        </Section>
      </div>

      <Section
        title="状態バッジ・期限バッジ"
        note="色だけで伝えず、必ず文字を添えます。適正には色を持たせません。"
      >
        <div className="flex flex-wrap items-center gap-2">
          {(['stockout', 'below_reorder', 'normal', 'excess', 'idle'] as const).map((s) => (
            <StockStatusBadge key={s} state={s} />
          ))}
          <span className="mx-2 h-5 w-px bg-line" />
          <ExpiryBadge expiryDate="2026-09-20" daysLeft={-11} alertDays={30} />
          <ExpiryBadge expiryDate="2026-10-04" daysLeft={3} alertDays={30} />
          <ExpiryBadge expiryDate="2027-03-31" daysLeft={181} alertDays={30} />
        </div>
      </Section>

      <Section title="メトリクスカード" note="対応が必要なときだけ左端に色の帯。装飾グラフは載せません。">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="欠品" value={28} unit="件" tone="stockout" hint="有効在庫が0以下" />
          <MetricCard label="要発注" value={18} unit="件" tone="low" delta={{ value: 4, label: '先週比' }} />
          <MetricCard label="遅延している発注" value={0} unit="件" tone="low" hint="対応なし（帯なし）" />
          <MetricCard label="在庫金額" value={48213500} money delta={{ value: -1250000, label: '先月比' }} />
        </div>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="空状態（データ0件）">
          <EmptyState kind="no-data" action={<Button variant="primary">CSVを取り込む</Button>} />
        </Section>
        <Section title="空状態（絞り込み0件）">
          <EmptyState kind="no-match" action={<Button>条件をすべて外す</Button>} />
        </Section>
      </div>

      <Section title="スケルトン" note="水位バーの位置（120×6）を確保して、読み込み後のずれを防ぎます。">
        <TableSkeleton rows={4} />
      </Section>

      <Section
        title="ボタン・ツールチップ・ダイアログ"
        note="権限で押せない操作は、非活性にして理由をツールチップで示します（FR-712）。"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">入庫を登録</Button>
          <Button>CSVを書き出す</Button>
          <Button variant="ghost">キャンセル</Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button disabled aria-describedby="deny-adjust">
                  在庫を調整
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent id="deny-adjust">在庫調整は在庫管理者以上が行えます</TooltipContent>
          </Tooltip>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="danger">この入庫を取り消す</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>この入庫を取り消しますか？</DialogTitle>
              <DialogDescription>
                元の取引は消さずに、数量を打ち消す取引（逆仕訳）を追加します。履歴には両方が残ります。
              </DialogDescription>
              <div className="mt-5 flex justify-end gap-2">
                <DialogClose asChild>
                  <Button>やめる</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="danger">取り消す</Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </Section>

      <Section
        title="権限外の画面の案内（FR-711）"
        note="管理者以外のロールで見ると、切替ボタンつきの案内が出ます。"
      >
        <PermissionGate session={session.data} need="admin.access" title="操作ログ">
          <p className="text-body text-ink-600">
            管理者として表示しています。操作ログの画面は Phase 4 で実装します。
          </p>
        </PermissionGate>
      </Section>
    </>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded border border-line bg-panel">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-section">{title}</h2>
        {note && <p className="mt-0.5 text-[12px] text-ink-600">{note}</p>}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  )
}

function Num({ v, strong, plus }: { v: number; strong?: boolean; plus?: boolean }) {
  return (
    <td
      className={`num px-3 text-right text-qty ${strong ? 'text-ink-900' : 'text-ink-600'} ${v < 0 ? 'text-st-ink-stockout' : ''}`}
    >
      {plus && v > 0 ? '+' : ''}
      {fmtQty(v)}
    </td>
  )
}
