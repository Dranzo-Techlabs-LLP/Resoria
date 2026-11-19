import type { ReactNode } from 'react'

export type PillTone = 'green' | 'amber' | 'blue' | 'red' | 'grey' | 'ink'
const TONES: Record<PillTone, string> = {
  green: 'bg-[#e3efe6] text-[#24603e]',
  amber: 'bg-due-soft text-due',
  blue: 'bg-[#e4edf5] text-[#2c5a80]',
  red: 'bg-[#fbe4e1] text-[#a3261b]',
  grey: 'bg-slate-100 text-slate-600',
  ink: 'bg-ink text-white',
}

/** Soft rounded pill (Settled, Unpaid, ₹10,000 due, Advance, In-house…). */
export function Pill({ tone = 'grey', children, className = '' }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium ${TONES[tone]} ${className}`}>
      {children}
    </span>
  )
}

/** Booking status pill: Confirmed / In-house / Completed / Cancelled. */
export function StatusTag({ label }: { label: string }) {
  const tone: PillTone =
    label === 'Cancelled' ? 'red' : label === 'In-house' ? 'blue' : label === 'Completed' || label === 'Confirmed' ? 'green' : 'grey'
  return <Pill tone={tone}>{label}</Pill>
}

/** Ledger type pill: Advance (blue) / Remaining (green) / Expenses (amber) / Refund (red). */
export function PaymentTypeTag({ type }: { type: string }) {
  const tone: PillTone = type === 'Advance' ? 'blue' : type === 'Remaining' ? 'green' : type === 'Expenses' ? 'amber' : 'red'
  return <Pill tone={tone}>{type}</Pill>
}
