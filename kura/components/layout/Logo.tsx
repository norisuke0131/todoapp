// ロゴ：「蔵」の字を、水位の線が横切る角印に
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-sm bg-ink-900"
      >
        <span className="absolute inset-x-0 bottom-0 h-[38%] bg-primary" />
        <span className="absolute inset-x-0 bottom-[38%] h-[2px] bg-st-low" />
        <span className="relative text-[15px] font-bold leading-none text-white">蔵</span>
      </span>
      {!compact && (
        <span className="num text-[18px] font-bold uppercase leading-none tracking-[0.12em] text-ink-900">
          Kura
        </span>
      )}
    </span>
  )
}
