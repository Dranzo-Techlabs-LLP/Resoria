// ------------------------------------------------------------------
//  Booking rules shared by every page (Dashboard, Bookings, Booking
//  details, Calendar). Keep the money and status logic here so all
//  screens agree.
// ------------------------------------------------------------------
import type { AppData, Booking, BookingCharge, Payment, PaymentType } from '../types'
import { FULL_PROPERTY, ROOMS, bookingRooms, roomCategory } from './config'
import { TODAY_ISO, fmtDate, fmtDateShort, parseISO, toISO } from './format'

/** Scheduled times shown on the timeline (the property's standard times). */
export const CHECK_IN_TIME = '2:00 PM'
export const CHECK_OUT_TIME = '11:00 AM'

/** Payment methods offered everywhere (chips). */
export const PAY_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer'] as const

// ---- Money ---------------------------------------------------------

const isExtras = (p: Payment) => p.purpose === 'extras'

/** Room money received: room payments minus refunds (extras collections excluded). */
export function roomPaid(b: Booking): number {
  return b.payments.reduce((s, p) => (isExtras(p) ? s : s + (p.kind === 'refund' ? -p.amount : p.amount)), 0)
}
/** Room payments received, before refunds. */
export function roomReceived(b: Booking): number {
  return b.payments.reduce((s, p) => (!isExtras(p) && p.kind === 'payment' ? s + p.amount : s), 0)
}
export function refundedOf(b: Booking): number {
  return b.payments.reduce((s, p) => (p.kind === 'refund' ? s + p.amount : s), 0)
}
/** Outstanding room balance (B2B commission collected externally counts as settled). */
export function roomBalance(b: Booking): number {
  return Math.max(0, b.total - roomPaid(b) - (b.b2bExternal ?? 0))
}
export function chargesTotal(b: Booking): number {
  return (b.charges ?? []).reduce((s, c) => s + c.total, 0)
}
export function unpaidCharges(b: Booking): BookingCharge[] {
  return (b.charges ?? []).filter((c) => !c.paymentId)
}
/** Additional expenses still to collect ("Due at checkout"). */
export function chargesDue(b: Booking): number {
  return unpaidCharges(b).reduce((s, c) => s + c.total, 0)
}
export function extrasCollected(b: Booking): number {
  return b.payments.reduce((s, p) => (isExtras(p) && p.kind === 'payment' ? s + p.amount : s), 0)
}

export type PayState = 'Settled' | 'Unpaid' | 'Partially Paid'
/** Room payment state for the progress bar: Settled (green), Unpaid (empty), Partially Paid (proportional). */
export function payState(b: Booking): PayState {
  if (roomBalance(b) <= 0) return 'Settled'
  return roomPaid(b) <= 0 ? 'Unpaid' : 'Partially Paid'
}
/** 0–100 for the progress bar. A ₹0 (complimentary) booking counts as fully paid. */
export function payPercent(b: Booking): number {
  if (b.total <= 0) return 100
  return Math.max(0, Math.min(100, Math.round(((b.total - roomBalance(b)) / b.total) * 100)))
}

/** Ledger label of one payment. */
export function paymentType(p: Payment): PaymentType {
  if (p.kind === 'refund') return 'Refund'
  if (p.purpose === 'extras') return 'Expenses'
  if (p.advance) return 'Advance'
  return 'Remaining'
}

// ---- Cancellation / refund ------------------------------------------

export type RefundStatus = 'Pending' | 'Completed' | 'No refund'
export function refundInfo(b: Booking) {
  const received = roomReceived(b)
  const charge = b.cancellationCharge ?? 0
  const refundable = Math.max(0, received - charge)
  const refunded = refundedOf(b)
  const remaining = Math.max(0, refundable - refunded)
  const status: RefundStatus = refundable <= 0 ? 'No refund' : remaining > 0 ? 'Pending' : 'Completed'
  return { received, charge, refundable, refunded, remaining, status }
}

// ---- Status / tabs ---------------------------------------------------

export function nightsOf(b: Pick<Booking, 'checkIn' | 'checkOut'>): number {
  const ms = parseISO(b.checkOut).getTime() - parseISO(b.checkIn).getTime()
  return Math.max(1, Math.round(ms / 86_400_000))
}
export const isCancelled = (b: Booking) => b.status === 'cancelled'
export const isInHouse = (b: Booking) => b.status === 'checked in'
export const isCompleted = (b: Booking) => b.status === 'completed'
/** Not yet checked in, not cancelled or completed (confirmed / hold / enquiry). */
export const isPreArrival = (b: Booking) => !isCancelled(b) && !isInHouse(b) && !isCompleted(b)

export type BookingTab = 'All' | 'Today' | 'In-house' | 'Upcoming' | 'Completed' | 'Cancelled'
export const BOOKING_TABS: BookingTab[] = ['All', 'Today', 'In-house', 'Upcoming', 'Completed', 'Cancelled']

/** Which tab a booking belongs to (besides All). Today = arriving today and not yet checked in. */
export function bookingTab(b: Booking, today = TODAY_ISO): Exclude<BookingTab, 'All'> {
  if (isCancelled(b)) return 'Cancelled'
  if (isCompleted(b)) return 'Completed'
  if (isInHouse(b)) return 'In-house'
  if (b.checkIn === today) return 'Today'
  if (b.checkIn > today) return 'Upcoming'
  return 'Today' // overdue arrival (check-in date passed, not checked in): keep it visible with today's work
}

/** Display label for a status pill. */
export function statusLabel(b: Booking): string {
  switch (b.status) {
    case 'checked in': return 'In-house'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    case 'hold': return 'On hold'
    case 'enquiry': return 'Enquiry'
    default: return 'Confirmed'
  }
}

/** Bookings newest first (most recent booking first). */
export function byNewest(a: Booking, b: Booking): number {
  return b.createdAt.localeCompare(a.createdAt) || b.ref.localeCompare(a.ref, undefined, { numeric: true })
}

// ---- Source ----------------------------------------------------------

/** Normalised source type, also for older free-text sources. */
export function sourceType(b: Booking): 'Direct' | 'B2B' | 'OTA' | 'Referral' | 'Other' {
  const s = (b.source || '').toLowerCase()
  if (s === 'direct' || s === '') return 'Direct'
  if (s.startsWith('b2b') || s === 'agent') return 'B2B'
  if (s.startsWith('ota') || s.includes('booking.com') || s.includes('agoda') || s.includes('airbnb') || s.includes('makemytrip')) return 'OTA'
  if (s.includes('referral')) return 'Referral'
  return 'Other'
}
/** Bookings list / header: { name, kind } e.g. { 'Nova Travels', 'B2B' }, { 'Direct', '' }. */
export function sourceLabel(b: Booking): { name: string; kind: string } {
  const t = sourceType(b)
  const detail = (b.sourceDetail || '').trim()
  if (t === 'Direct') return { name: 'Direct', kind: '' }
  if (t === 'Other') return { name: b.source, kind: '' }
  return { name: detail || (t === 'Referral' ? 'Management Referral' : t), kind: detail ? t : '' }
}
/** One line: "B2B · Nova Travels", "Direct". */
export function sourceLine(b: Booking): string {
  const t = sourceType(b)
  const detail = (b.sourceDetail || '').trim()
  if (t === 'Direct') return 'Direct'
  if (t === 'Other') return b.source
  return detail ? `${t} · ${detail}` : t
}

// ---- Rooms / occupancy ---------------------------------------------

/** "Sylvane (Premium)", "S2, S3". */
export function roomLabel(villa: string): string {
  const rooms = bookingRooms(villa)
  if (villa === FULL_PROPERTY) return 'Full Property'
  if (rooms.length === 1) {
    const cat = roomCategory(rooms[0])
    return cat ? `${rooms[0]} (${cat})` : rooms[0]
  }
  return rooms.join(', ')
}

/** Does the booking hold its room(s) on the night of `iso`? (check-in ≤ night < check-out, not cancelled) */
export function occupiesNight(b: Booking, iso: string): boolean {
  return !isCancelled(b) && b.checkIn <= iso && iso < b.checkOut
}

/** Room name → booking holding it on the night of `iso`. */
export function occupancyOn(bookings: Booking[], iso: string): Map<string, Booking> {
  const map = new Map<string, Booking>()
  for (const b of bookings) {
    if (!occupiesNight(b, iso)) continue
    for (const r of bookingRooms(b.villa)) if (!map.has(r)) map.set(r, b)
  }
  return map
}
export const TOTAL_ROOMS = ROOMS.length

// ---- Dates -----------------------------------------------------------

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function time12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`
}
/** 'YYYY-MM-DD HH:MM:SS' → "10 Nov 2026, 2:05 PM" (date only when there's no time). */
export function fmtDateTime(dt?: string): string {
  if (!dt) return ''
  const [d, t] = dt.split(/[ T]/)
  return t ? `${fmtDate(d)}, ${time12(t)}` : fmtDate(d)
}
/** 'YYYY-MM-DD HH:MM:SS' → "10 Nov, 2:05 PM". */
export function fmtDateTimeShort(dt?: string): string {
  if (!dt) return ''
  const [d, t] = dt.split(/[ T]/)
  return t ? `${fmtDateShort(d)}, ${time12(t)}` : fmtDateShort(d)
}
/** "12 Nov – 14 Nov 2026" */
export function fmtStay(b: Pick<Booking, 'checkIn' | 'checkOut'>): string {
  return `${fmtDateShort(b.checkIn)} – ${fmtDate(b.checkOut)}`
}
export function monthShort(i: number): string {
  return MONTHS[i]
}

// ---- Settings helpers --------------------------------------------------

/** B2B commission for an agent on a booking amount. */
export function agentCommission(data: AppData, agentName: string, amount: number): number {
  const a = data.settings.agents.find((x) => x.name === agentName)
  if (!a) return 0
  return a.commissionType === 'percent' ? Math.round((amount * a.commissionValue) / 100) : Math.round(a.commissionValue)
}
/** B2B commission paid so far (B2B Commission expenses linked to the booking). */
export function commissionPaid(data: AppData, ref: string): number {
  const r = ref.toLowerCase()
  return data.expenses
    .filter((e) => e.category === 'B2B Commission' && e.bookingRef?.toLowerCase() === r)
    .reduce((s, e) => s + e.amount, 0)
}

// ---- Group bookings: room-wise amounts ----------------------------------

export interface RoomShare { room: string; rate: number; amount: number }

/**
 * A booking's room amount split by room. Each room gets a share of the booking total in proportion to its
 * nightly rate when booked (`roomRates`; older bookings use the room's current rate), or an equal share when
 * no rates are known. Shares are whole rupees and add up to the booking total. A whole-property booking is one
 * line (FULL_PROPERTY), as the property is let as a unit.
 */
export function roomShares(b: Booking, data?: Pick<AppData, 'villaOverrides'>): RoomShare[] {
  if (b.villa === FULL_PROPERTY) return [{ room: FULL_PROPERTY, rate: 0, amount: b.total }]
  const rooms = bookingRooms(b.villa)
  if (rooms.length === 0) return []
  const current = (r: string) => data?.villaOverrides[r]?.baseRate ?? ROOMS.find((x) => x.name === r)?.baseRate ?? 0
  const rates = rooms.map((r) => b.roomRates?.[r] ?? current(r))
  const weights = rates.every((x) => x > 0) ? rates : rooms.map(() => 1)
  const sum = weights.reduce((s, w) => s + w, 0)
  let given = 0
  return rooms.map((room, i) => {
    const amount = i === rooms.length - 1 ? b.total - given : Math.round((b.total * weights[i]) / sum)
    given += amount
    return { room, rate: rates[i], amount }
  })
}

/** The part (0–1) of a booking's money that belongs to one room (1 for a single-room booking). */
export function roomShareOf(b: Booking, room: string, data?: Pick<AppData, 'villaOverrides'>): number {
  const shares = roomShares(b, data)
  if (shares.length <= 1) return shares[0]?.room === room ? 1 : 0
  const line = shares.find((s) => s.room === room)
  if (!line) return 0
  if (b.total > 0) return line.amount / b.total
  return 1 / shares.length
}
