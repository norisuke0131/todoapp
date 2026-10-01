// NFR-04 / FR-109：620 SKU × 2拠点 × 約5,000トランザクションで、在庫一覧の算出が 150ms 以下
import { expect, it } from 'vitest'
import { generateSeed } from '@/lib/seed'
import { buildIndex, composeSnapshot, getSnapshots, isIdle, stockedPairs } from './index'

const NOW = '2026-10-01T09:00:00.000Z'

it('在庫一覧の算出（インデックス構築 + 全拠点合計620行 + 商品×拠点700行）が 150ms 以下', () => {
  const seed = generateSeed(NOW)
  const runs: number[] = []
  let rows = 0
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now()
    const index = buildIndex(seed)
    const perWh = getSnapshots(index, stockedPairs(index), NOW)
    const total = getSnapshots(
      index,
      seed.items.map((it) => ({ itemId: it.id })),
      NOW,
    )
    rows = perWh.length + total.length
    runs.push(performance.now() - t0)
  }
  runs.sort((a, b) => a - b)
  const median = runs[3]!
  const index = buildIndex(seed)
  const snaps = stockedPairs(index).map((k) => composeSnapshot(index, k, NOW))
  const dist = Object.fromEntries(
    ['stockout', 'below_reorder', 'normal', 'excess'].map((s) => [
      s,
      snaps.filter((x) => x.status === s).length,
    ]),
  )
  console.info(
    `txns=${seed.txns.length} rows=${rows} median=${median.toFixed(1)}ms worst=${runs[6]!.toFixed(1)}ms`,
    dist,
    `idle=${snaps.filter((s) => isIdle(s.idleDays)).length}`,
  )
  expect(seed.txns.length).toBeGreaterThan(4500)
  expect(median).toBeLessThan(150)
})
