import type { ReactNode } from 'react'

/** KPI tile from the reference: caps label, big serif value, small subtext. */
export function KpiCard({ label, value, sub, tone = 'ink', onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ink' | 'due'; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`rounded-2xl border border-[#e6e1d6] bg-white px-5 py-5 text-left ${onClick ? 'transition-colors hover:border-slate-300' : ''}`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`nums mt-3 font-display text-[34px] font-semibold leading-none ${tone === 'due' ? 'text-due' : 'text-dark'}`}>{value}</div>
      {sub && <div className="mt-3 text-sm text-slate-500">{sub}</div>}
    </Tag>
  )
}
