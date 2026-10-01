import Link from 'next/link'
import { MapPinOff } from 'lucide-react'

// 素の 404 を出さない（FR-711）。まだ作っていない画面もここに来る
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-start rounded border border-line bg-panel p-6">
      <MapPinOff aria-hidden className="size-6 text-ink-500" strokeWidth={1.5} />
      <h1 className="mt-3 text-section">この棚番には、まだ何も置かれていません</h1>
      <p className="mt-1.5 text-body text-ink-600">
        お探しの画面は見つかりませんでした。URLが変わったか、これから公開する画面の可能性があります。
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex h-9 items-center rounded bg-primary px-3.5 text-body font-bold text-white hover:bg-primary-d"
      >
        ダッシュボードへ戻る
      </Link>
    </div>
  )
}
