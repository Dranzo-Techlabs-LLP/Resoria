// ------------------------------------------------------------------
//  Small helpers for the Booking details page, its popups and the
//  printable bills. Money/status rules stay in lib/booking.ts.
// ------------------------------------------------------------------
import type { AppData, Booking, BookingCharge, Payment } from '../../types'
import { commissionPaid } from '../../lib/booking'
import { toISO } from '../../lib/format'

export const todayISO = () => toISO(new Date())

/** Table cells used by the expenses table and the ledger. */
export const thCls = 'whitespace-nowrap bg-canvas px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6'
export const tdCls = 'px-4 py-3.5 align-middle text-[15px] text-dark first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6'

/** Digits typed in an amount field → whole rupees. */
export function amountOf(digits: string): number {
  return Math.max(0, Math.round(Number(digits.replace(/[^\d]/g, '')) || 0))
}

/** Payments in ledger order: by date, then when they were recorded, then as stored. */
export function ledgerOrder(b: Booking): Payment[] {
  return b.payments
    .map((p, i) => ({ p, i }))
    .sort((x, y) => x.p.date.localeCompare(y.p.date) || (x.p.createdAt || '').localeCompare(y.p.createdAt || '') || x.i - y.i)
    .map((x) => x.p)
}

/** Every payment with its receipt number by ledger position: "RE-00004-R2". */
export function receiptsOf(b: Booking): { p: Payment; no: string }[] {
  return ledgerOrder(b).map((p, i) => ({ p, no: `${b.ref}-R${i + 1}` }))
}

/** The advance collected while booking (room payments flagged as advance). */
export function advanceReceived(b: Booking): number {
  return b.payments.reduce((s, p) => (p.advance && p.kind === 'payment' && p.purpose !== 'extras' ? s + p.amount : s), 0)
}

/** Charges in the order they were added. */
export function chargesInOrder(b: Booking): BookingCharge[] {
  return [...(b.charges ?? [])].sort((x, y) => (x.at || '').localeCompare(y.at || ''))
}

// ---- Conference Hall item names: "Conference Hall · 2 Hours" ----
const HALL_ITEM_PREFIX = 'Conference Hall · '
export const hoursLabel = (h: number) => `${h} ${h === 1 ? 'Hour' : 'Hours'}`
export const hallItemName = (h: number) => `${HALL_ITEM_PREFIX}${hoursLabel(h)}`
export function hallHoursOf(item: string): number | null {
  const m = /(\d+)\s*hours?/i.exec(item)
  return m ? Number(m[1]) : null
}

// ---- Times ----
/** 'YYYY-MM-DD HH:MM:SS' → the date part. */
export const datePart = (dt?: string) => (dt ? dt.split(/[ T]/)[0] : '')
/** 'YYYY-MM-DD HH:MM:SS' → "2:05 PM" ('' when there's no time). */
export function timePart(dt?: string): string {
  const t = dt?.split(/[ T]/)[1]
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// ---- B2B commission ----
export type CommissionState = 'Paid' | 'Partially paid' | 'Pending'
export function commissionInfo(data: AppData, b: Booking): { amount: number; paid: number; state: CommissionState } | null {
  const amount = b.commission ?? 0
  if (amount <= 0) return null
  const paid = commissionPaid(data, b.ref)
  return { amount, paid, state: paid >= amount ? 'Paid' : paid > 0 ? 'Partially paid' : 'Pending' }
}
