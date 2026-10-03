'use client'
// SC-103 ピッキングリスト印刷：棚番順・バーコードつき。PDF は押したときに作る（PDF の部品は動的に読み込む）
import Link from 'next/link'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, FileDown, Printer } from 'lucide-react'
import { getPickingList } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { code128B } from '@/lib/scan/code128'
import { fmtDate, fmtQty } from '@/lib/utils/format'
import { PageTitle } from '@/components/layout/PageTitle'
import { SkeletonBlock } from '@/components/domain/Skeleton'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

export default function PrintPickingPage() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const list = useRepo(() => getPickingList(id), [id])
  const [busy, setBusy] = useState(false)

  const downloadPdf = async () => {
    if (!list.data) return
    setBusy(true)
    try {
      const [{ pdf }, { PickingListPdf }, { registerJapaneseFont }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf/PickingListPdf'),
        import('@/components/pdf/fonts'),
      ])
      registerJapaneseFont()
      const printedAt = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date())
      const blob = await pdf(<PickingListPdf list={list.data} printedAt={printedAt} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `picking-${list.data.order.code}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.show({ message: 'ピッキングリストの PDF を作成しました' })
    } catch {
      toast.show({ message: 'PDF を作れませんでした。もう一度お試しください', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const l = list.data
  return (
    <>
      <Link
        href="/ship"
        className="mb-3 inline-flex items-center gap-1 text-[12px] font-bold text-primary-d hover:underline print:hidden"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        出庫へ戻る
      </Link>
      <PageTitle
        title="ピッキングリスト"
        lead={
          l
            ? `${l.order.code}・${l.order.customerName}・${l.order.warehouseName}・出荷期日 ${l.order.shipBy ? fmtDate(l.order.shipBy) : '—'}`
            : ' '
        }
        actions={
          <div className="flex gap-2 print:hidden">
            <Button size="sm" onClick={() => window.print()}>
              <Printer aria-hidden />
              印刷
            </Button>
            <Button size="sm" variant="primary" disabled={!l || busy} onClick={downloadPdf}>
              <FileDown aria-hidden />
              {busy ? 'PDF を作成中…' : 'PDF をダウンロード'}
            </Button>
          </div>
        }
      />
      {!l ? (
        <SkeletonBlock className="h-[400px] w-full rounded" />
      ) : (
        <section className="rounded border border-line bg-panel print:border-0">
          <table className="w-full text-body">
            <caption className="sr-only">棚番の巡回順のピッキングリスト</caption>
            <thead>
              <tr className="border-b-2 border-ink-900 text-label text-ink-600">
                <th scope="col" className="h-9 w-10 px-4 text-left">
                  #
                </th>
                <th scope="col" className="w-40 px-3 text-left">
                  棚番
                </th>
                <th scope="col" className="px-3 text-left">
                  商品
                </th>
                <th scope="col" className="w-20 px-3 text-right">
                  指示数
                </th>
                <th scope="col" className="w-24 px-4 text-left">
                  実数
                </th>
              </tr>
            </thead>
            <tbody>
              {l.lines.map((x, i) => (
                <tr key={x.itemId} className="border-b border-line align-middle">
                  <td className="num px-4 py-3 text-ink-500">{i + 1}</td>
                  <th scope="row" className="px-3 py-3 text-left">
                    <span className="num block text-[22px] leading-7">{x.locationCode ?? '未設定'}</span>
                    {x.locationCode && <HtmlBarcode value={x.locationCode} />}
                  </th>
                  <td className="px-3 py-3">
                    <span className="num block text-[12px] text-ink-600">{x.sku}</span>
                    {x.name}
                    {x.isLotManaged && x.lots.some((y) => y.recommended > 0) && (
                      <span className="mt-0.5 block text-[12px] text-ink-600">
                        期限の近いロットから：
                        {x.lots
                          .filter((y) => y.recommended > 0)
                          .map((y) => `${y.lotNo}×${y.recommended}`)
                          .join('、')}
                      </span>
                    )}
                  </td>
                  <td className="num px-3 py-3 text-right text-[20px]">
                    {fmtQty(x.qty)}
                    <span className="ml-0.5 font-sans text-[11px] font-normal text-ink-500">
                      {x.baseUnit}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block h-8 w-20 border border-ink-900" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}

/** 画面・印刷用の Code 128（SVG） */
function HtmlBarcode({ value }: { value: string }) {
  const widths = code128B(value)
  const total = widths.reduce((a, b) => a + b, 0)
  let x = 0
  return (
    <svg
      role="img"
      aria-label={`棚番 ${value} のバーコード`}
      viewBox={`0 0 ${total} 20`}
      preserveAspectRatio="none"
      className="mt-1 h-4 w-28"
    >
      {widths.map((w, i) => {
        const r = i % 2 === 0 ? <rect key={i} x={x} y={0} width={w} height={20} fill="currentColor" /> : null
        x += w
        return r
      })}
    </svg>
  )
}
