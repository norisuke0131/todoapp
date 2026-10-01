// 空状態：「データ0件」と「絞り込み0件」を別の文言にする（8章）
import type { ReactNode } from 'react'
import { PackageOpen, SearchX } from 'lucide-react'

type Props =
  | { kind: 'no-data'; title?: string; description?: string; action?: ReactNode }
  | { kind: 'no-match'; title?: string; description?: string; action?: ReactNode }

export function EmptyState(p: Props) {
  const Icon = p.kind === 'no-data' ? PackageOpen : SearchX
  const title = p.title ?? (p.kind === 'no-data' ? 'まだ在庫がありません' : '条件に一致する商品はありません')
  const desc =
    p.description ??
    (p.kind === 'no-data'
      ? 'CSVで取り込むか、入庫から始めましょう。'
      : '条件を外すか、別の言葉で探してください。')
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <Icon aria-hidden className="size-8 text-ink-400" strokeWidth={1.5} />
      <p className="mt-3 text-section text-ink-900">{title}</p>
      <p className="mt-1 max-w-[36ch] text-body text-ink-600">{desc}</p>
      {p.action && <div className="mt-4">{p.action}</div>}
    </div>
  )
}
