/** Payment progress bar: green when settled, accent (proportional) when partial, empty when unpaid. */
export function PayProgress({ percent, settled, className = '', thick = false }: { percent: number; settled?: boolean; className?: string; thick?: boolean }) {
  const full = settled ?? percent >= 100
  return (
    <div className={`w-full overflow-hidden rounded-full bg-[#e6e1d6] ${thick ? 'h-2' : 'h-1.5'} ${className}`}>
      <div
        className={`h-full rounded-full ${full ? 'bg-ok' : 'bg-accent'}`}
        style={{ width: `${full ? 100 : Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  )
}
