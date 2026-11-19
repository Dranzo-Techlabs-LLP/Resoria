// Month money for the Dashboard. Same definitions as Financial Overview on the
// cash-date basis (and the previous Dashboard), so both screens agree:
//   revenue  = every payment received in the month (room payments and
//              additional-expense collections) − refunds paid in the month
//              − B2B commission the resort paid out in the month.
//              B2B commission a partner collected externally was never received
//              by the resort, so it is neither revenue nor a deduction.
//   expenses = operating expenses dated in the month (every category except B2B Commission).
//   profit   = revenue − expenses.
import { B2B_CATEGORY, isPaidOutB2b } from '../../data/store'
import { sourceType } from '../../lib/booking'
import type { AppData, Booking } from '../../types'

export type SourceKey = 'Direct' | 'B2B' | 'OTA' | 'Other'
export const SOURCE_KEYS: SourceKey[] = ['Direct', 'B2B', 'OTA', 'Other']

/** Donut bucket of a booking: management referral and any other source count as Other. */
export function sourceKey(b: Booking): SourceKey {
  const t = sourceType(b)
  return t === 'Direct' || t === 'B2B' || t === 'OTA' ? t : 'Other'
}

export interface MonthMoney {
  revenue: number
  expenses: number
  profit: number
  bySource: Record<SourceKey, number>
}

/** Money of one month, `month` = 'YYYY-MM'. Revenue is attributed to the paying booking's source. */
export function monthMoney(data: AppData, month: string): MonthMoney {
  const bySource: Record<SourceKey, number> = { Direct: 0, B2B: 0, OTA: 0, Other: 0 }
  const sourceOfRef = new Map<string, SourceKey>()
  for (const b of data.bookings) {
    const key = sourceKey(b)
    sourceOfRef.set(b.ref.trim().toLowerCase(), key)
    for (const p of b.payments) {
      if (p.date.startsWith(month)) bySource[key] += p.kind === 'refund' ? -p.amount : p.amount
    }
  }
  let expenses = 0
  for (const e of data.expenses) {
    if (!e.date.startsWith(month)) continue
    if (e.category !== B2B_CATEGORY) expenses += e.amount
    else if (isPaidOutB2b(e)) bySource[sourceOfRef.get(e.bookingRef?.trim().toLowerCase() ?? '') ?? 'B2B'] -= e.amount
  }
  const revenue = SOURCE_KEYS.reduce((s, k) => s + bySource[k], 0)
  return { revenue, expenses, profit: revenue - expenses, bySource }
}

const trimZero = (s: string) => s.replace(/\.0+$/, '')

/** Compact Indian amount: ₹3.40L, ₹1.25Cr, ₹85K, ₹8.5K, ₹950 (− prefix when negative). */
export function formatLakh(n: number): string {
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(n)
  let s: string
  if (a >= 99_95_000) s = `₹${(a / 1_00_00_000).toFixed(2)}Cr`
  else if (a >= 99_500) s = `₹${(a / 1_00_000).toFixed(2)}L`
  else if (a >= 1_000) s = `₹${trimZero((a / 1_000).toFixed(a >= 9_950 ? 0 : 1))}K`
  else s = `₹${Math.round(a)}`
  return sign + s
}
