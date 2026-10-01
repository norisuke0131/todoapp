// スケルトン：テーブルは行の形で、★ 水位バーの位置も確保してレイアウトシフトを防ぐ（NFR-03）
import { cn } from '@/lib/utils/cn'

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block rounded-sm bg-[linear-gradient(90deg,var(--panel-alt)_0px,var(--line)_80px,var(--panel-alt)_160px)] bg-[length:400px_100%] motion-safe:animate-[shimmer_1.2s_linear_infinite]',
        className,
      )}
    />
  )
}

export function TableSkeleton({ rows = 8, rowHeight = 38 }: { rows?: number; rowHeight?: number }) {
  return (
    <div role="status" aria-label="読み込み中" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-3" style={{ height: rowHeight }}>
          <SkeletonBlock className="h-3 w-16" />
          <SkeletonBlock className="h-3 flex-1" />
          <SkeletonBlock className="h-3 w-10" />
          <SkeletonBlock className="h-3 w-10" />
          <SkeletonBlock className="h-3 w-10" />
          {/* 水位バーの領域（120×6） */}
          <SkeletonBlock className="h-[6px] w-[120px]" />
        </div>
      ))}
    </div>
  )
}
