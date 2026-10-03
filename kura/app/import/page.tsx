'use client'
// SC-014 CSVインポート：ファイル選択 → 列マッピング → プレビュー → 取込結果（FR-701〜FR-704）
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import {
  guessMapping,
  parseCsv,
  SAMPLE_CSV,
  TARGETS,
  validateRows,
  downloadCsv,
  type ImportKind,
  type ParsedCsv,
} from '@/lib/csv'
import { getSession, importCsv, type ImportSummary } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { cn } from '@/lib/utils/cn'
import { PageTitle } from '@/components/layout/PageTitle'
import { PermissionGate } from '@/components/demo/PermissionGate'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

const KINDS: { id: ImportKind; title: string; desc: string }[] = [
  { id: 'items', title: '商品マスタ', desc: 'SKU・商品名・単位・原価など。同じ SKU は上書きします' },
  {
    id: 'opening',
    title: '在庫の初期値',
    desc: '導入時の実地棚卸の結果。「期首棚卸」の取引として記録します',
  },
  { id: 'partners', title: '取引先', desc: '仕入先・出荷先。同じコードは上書きします' },
]
const STEPS = ['ファイル', '列の対応', 'プレビュー', '結果']

export default function ImportPage() {
  const session = useRepo(getSession)
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<ImportKind>('items')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedCsv>()
  const [mapping, setMapping] = useState<Record<string, number | undefined>>({})
  const [preview, setPreview] = useState<ImportSummary>()
  const [result, setResult] = useState<ImportSummary>()
  const [readError, setReadError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fields = TARGETS[kind]
  const rows = useMemo(() => (parsed ? validateRows(kind, parsed, mapping) : []), [kind, parsed, mapping])
  const missingRequired = fields.filter((f) => f.required && mapping[f.key] === undefined)

  const load = (text: string, name: string) => {
    const p = parseCsv(text)
    if (p.headers.length === 0 || p.rows.length === 0) {
      setReadError('見出し行とデータ行がある CSV を選んでください（1行目が見出しです）')
      return
    }
    setReadError('')
    setParsed(p)
    setFileName(name)
    setMapping(guessMapping(kind, p.headers))
    setStep(1)
  }

  const runPreview = async () => {
    setBusy(true)
    const r = await importCsv(kind, rows, { dryRun: true })
    setBusy(false)
    if (!r.ok) return toast.show({ message: r.error, tone: 'error' })
    setPreview(r.data)
    setStep(2)
  }

  const commit = async () => {
    setBusy(true)
    const r = await importCsv(kind, rows, { dryRun: false })
    setBusy(false)
    if (!r.ok) return toast.show({ message: r.error, tone: 'error' })
    setResult(r.data)
    setStep(3)
  }

  const reset = () => {
    setStep(0)
    setParsed(undefined)
    setPreview(undefined)
    setResult(undefined)
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
      <PageTitle
        title="CSVインポート"
        lead="お手元の商品マスタや在庫表を取り込んで試せます。データはこのブラウザの中だけに保存され、外部には送信されません。"
      />
      <PermissionGate session={session.data} need="master.write" title="CSVインポート">
        <ol aria-label="手順" className="mb-5 flex flex-wrap gap-x-1 gap-y-2">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined} className="flex items-center gap-1">
              <span
                className={cn(
                  'flex h-8 items-center gap-2 rounded-sm px-3 text-[12px] font-bold',
                  i === step ? 'bg-ink-900 text-white' : i < step ? 'bg-panel text-ink-900' : 'text-ink-500',
                )}
              >
                <span className="num">{i + 1}</span>
                {s}
              </span>
              {i < STEPS.length - 1 && <span aria-hidden className="h-px w-4 bg-line-hi" />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="rounded border border-line bg-panel">
            <fieldset className="grid gap-3 border-b border-line px-5 py-5 md:grid-cols-3">
              <legend className="sr-only">取り込むデータの種類</legend>
              {KINDS.map((k) => (
                <label
                  key={k.id}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded border px-4 py-3 transition-colors duration-80',
                    kind === k.id ? 'border-primary bg-primary-50' : 'border-line hover:border-line-hi',
                  )}
                >
                  <span className="flex items-center gap-2 text-section">
                    <input
                      type="radio"
                      name="kind"
                      className="accent-[var(--primary)]"
                      checked={kind === k.id}
                      onChange={() => setKind(k.id)}
                    />
                    {k.title}
                  </span>
                  <span className="text-[12px] text-ink-600">{k.desc}</span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-4 px-5 py-5">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-line-hi bg-panel-alt px-6 py-10 text-center hover:border-primary">
                <Upload aria-hidden className="size-6 text-ink-500" strokeWidth={1.5} />
                <span className="text-section">CSV ファイルを選ぶ</span>
                <span className="text-[12px] text-ink-600">
                  1行目が見出し。UTF-8（Excel の「CSV UTF-8」）で保存したファイル
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  aria-describedby={readError ? 'read-error' : undefined}
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (f) load(await f.text(), f.name)
                  }}
                />
              </label>
              {readError && (
                <p id="read-error" role="alert" className="text-[12px] text-st-ink-stockout">
                  {readError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => load(SAMPLE_CSV[kind].text, SAMPLE_CSV[kind].filename)}>
                  <FileSpreadsheet aria-hidden />
                  サンプルで試す
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => downloadCsv(SAMPLE_CSV[kind].filename, '﻿' + SAMPLE_CSV[kind].text)}
                >
                  ひな形をダウンロード
                </Button>
                <span className="text-[12px] text-ink-500">{SAMPLE_CSV[kind].note}</span>
              </div>
            </div>
          </section>
        )}

        {step === 1 && parsed && (
          <section className="rounded border border-line bg-panel">
            <div className="border-b border-line px-5 py-3">
              <h2 className="text-section">列の対応を確かめる</h2>
              <p className="mt-0.5 text-[12px] text-ink-600">
                {fileName}・{parsed.rows.length}{' '}
                行。見出しから自動で推測しました。違っていれば選び直してください。
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-body">
                <caption className="sr-only">列の対応</caption>
                <thead>
                  <tr className="border-b border-line-hi bg-panel-alt text-label text-ink-600">
                    <th scope="col" className="h-9 px-5 text-left">
                      KURA の項目
                    </th>
                    <th scope="col" className="px-3 text-left">
                      CSV の列
                    </th>
                    <th scope="col" className="px-5 text-left">
                      1行目の値
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => {
                    const col = mapping[f.key]
                    return (
                      <tr key={f.key} className="h-11 border-b border-line last:border-0">
                        <th scope="row" className="px-5 text-left font-normal">
                          {f.label}
                          {f.required && (
                            <span className="ml-1.5 text-[11px] font-bold text-st-ink-low">必須</span>
                          )}
                        </th>
                        <td className="px-3">
                          <select
                            aria-label={`${f.label}に対応する列`}
                            value={col ?? ''}
                            onChange={(e) =>
                              setMapping((m) => ({
                                ...m,
                                [f.key]: e.target.value === '' ? undefined : Number(e.target.value),
                              }))
                            }
                            className={cn(
                              'h-8 w-full max-w-[240px] rounded border bg-panel px-2 text-body',
                              f.required && col === undefined ? 'border-st-low' : 'border-line-hi',
                            )}
                          >
                            <option value="">（使わない）</option>
                            {parsed.headers.map((h, i) => (
                              <option key={i} value={i}>
                                {h || `${i + 1}列目`}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="max-w-[280px] truncate px-5 text-[12px] text-ink-600">
                          {col !== undefined ? parsed.rows[0]?.[col] : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
              <p className="text-[12px] text-ink-600" role={missingRequired.length ? 'alert' : undefined}>
                {missingRequired.length
                  ? `必須の項目「${missingRequired.map((f) => f.label).join('・')}」に列を割り当ててください`
                  : 'すべての必須項目に列が割り当てられています'}
              </p>
              <div className="flex gap-2">
                <Button onClick={reset}>ファイルを選び直す</Button>
                <Button variant="primary" disabled={missingRequired.length > 0 || busy} onClick={runPreview}>
                  プレビューする
                </Button>
              </div>
            </div>
          </section>
        )}

        {step === 2 && preview && parsed && (
          <section className="rounded border border-line bg-panel">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-line px-5 py-4">
              <Count label="取り込める行" value={preview.created + preview.updated} tone="ok" />
              {preview.updated > 0 && <Count label="うち上書き" value={preview.updated} />}
              <Count label="エラーの行" value={preview.failed} tone={preview.failed ? 'error' : undefined} />
              {parsed.neutralized > 0 && (
                <p className="text-[12px] text-ink-600">
                  式として実行されうるセル {parsed.neutralized} 件の先頭に「&apos;」を付けて無害化しました
                </p>
              )}
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[640px] text-body">
                <caption className="sr-only">取り込みのプレビュー</caption>
                <thead className="sticky top-0">
                  <tr className="border-b border-line-hi bg-panel-alt text-label text-ink-600">
                    <th scope="col" className="h-9 w-16 px-5 text-left">
                      行
                    </th>
                    <th scope="col" className="w-28 px-3 text-left">
                      判定
                    </th>
                    {fields.slice(0, 4).map((f) => (
                      <th key={f.key} scope="col" className="px-3 text-left">
                        {f.label}
                      </th>
                    ))}
                    <th scope="col" className="px-5 text-left">
                      理由
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((l) => {
                    const r = rows.find((x) => x.line === l.line)
                    return (
                      <tr
                        key={l.line}
                        className={cn(
                          'border-b border-line align-top last:border-0',
                          l.status === 'error' && 'shadow-[inset_3px_0_0_var(--st-stockout)]',
                        )}
                      >
                        <th scope="row" className="num px-5 py-2 text-left text-[13px] text-ink-600">
                          {l.line}
                        </th>
                        <td className="px-3 py-2">
                          {l.status === 'ok' ? (
                            <span className="inline-flex items-center gap-1 text-[12px] font-bold text-st-ink-normal">
                              <CheckCircle2 aria-hidden className="size-3.5" />
                              {l.action === 'update' ? '上書き' : '新規'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[12px] font-bold text-st-ink-stockout">
                              <AlertTriangle aria-hidden className="size-3.5" />
                              取り込まない
                            </span>
                          )}
                        </td>
                        {fields.slice(0, 4).map((f) => (
                          <td key={f.key} className="max-w-[200px] truncate px-3 py-2 text-[12px]">
                            {r?.values[f.key] || <span className="text-ink-400">—</span>}
                          </td>
                        ))}
                        <td className="px-5 py-2 text-[12px] leading-5 text-st-ink-stockout">
                          {l.errors.join('　')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
              <p className="text-[12px] text-ink-600">
                {preview.failed > 0
                  ? 'エラーの行は取り込まずに、残りだけを取り込みます。直してから取り込み直すこともできます。'
                  : 'すべての行を取り込めます。'}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setStep(1)}>列の対応に戻る</Button>
                <Button
                  variant="primary"
                  disabled={busy || preview.created + preview.updated === 0}
                  onClick={commit}
                >
                  {busy ? '取り込んでいます…' : `${preview.created + preview.updated} 行を取り込む`}
                </Button>
              </div>
            </div>
          </section>
        )}

        {step === 3 && result && (
          <section className="flex flex-col items-start gap-3 rounded border border-line bg-panel px-6 py-6">
            <CheckCircle2 aria-hidden className="size-7 text-st-normal" strokeWidth={1.5} />
            <h2 className="text-section">
              {result.created + result.updated} 行を取り込みました
              {result.failed > 0 && (
                <span className="ml-2 text-body font-normal text-ink-600">
                  （{result.failed} 行はエラーのため取り込んでいません）
                </span>
              )}
            </h2>
            <p className="text-body text-ink-600">
              {result.kind === 'opening'
                ? '在庫は「期首棚卸」の取引として記録しました。商品の在庫履歴を開くと、ここが起点になっているのが確かめられます。'
                : result.kind === 'items'
                  ? '登録しただけでは在庫は 0 です。続けて「在庫の初期値」を取り込むと、在庫が入ります。'
                  : '取引先を登録しました。'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild variant="primary">
                <Link href={result.kind === 'partners' ? '/partners' : '/stock'}>
                  {result.kind === 'partners' ? '取引先を見る' : '在庫一覧を見る'}
                </Link>
              </Button>
              <Button
                onClick={() => {
                  if (result.kind === 'items') setKind('opening')
                  reset()
                }}
              >
                {result.kind === 'items' ? '続けて在庫の初期値を取り込む' : 'ほかのファイルを取り込む'}
              </Button>
            </div>
          </section>
        )}
      </PermissionGate>
    </>
  )
}

function Count({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'error' }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-label text-ink-600">{label}</span>
      <span
        className={cn(
          'num text-[24px] leading-7',
          tone === 'error' ? 'text-st-ink-stockout' : 'text-ink-900',
        )}
      >
        {value}
      </span>
      <span className="text-[11px] text-ink-500">行</span>
    </div>
  )
}
