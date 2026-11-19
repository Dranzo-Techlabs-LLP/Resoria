// ------------------------------------------------------------------
//  Guest ratings: score maths, periods, feedback links and the
//  WhatsApp messages staff send to guests.
// ------------------------------------------------------------------
import { RATING_ASPECTS, type Booking, type Rating, type RatingAspect } from '../../types'
import { RESORT, bookingRooms } from '../../lib/config'
import {
  CHECK_IN_TIME, CHECK_OUT_TIME, chargesDue, chargesTotal, extrasCollected, isCompleted, isInHouse, nightsOf, roomBalance,
  roomLabel,
} from '../../lib/booking'
import { TODAY_ISO, fmtDate, formatINR, parseISO, toISO } from '../../lib/format'
import { datePart, timePart } from '../booking-detail/helpers'

/** Ratings the guest submitted through the shared link: they can be replied to, never edited. */
export const GUEST_LINK_SOURCE = 'Guest feedback link'
export const isGuestSubmitted = (r: Rating) => r.source === GUEST_LINK_SOURCE

export const STAR_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'] as const

/** A low score or a comment, with no reply yet. */
export function needsReply(r: Rating): boolean {
  return !(r.response ?? '').trim() && (r.overall <= 3 || !!(r.comment ?? '').trim())
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}
export const avgOf = (list: Rating[]) => average(list.map((r) => r.overall))
/** 4.6 → "4.6"; no reviews → "—". */
export const fmtAvg = (n: number | null) => (n === null ? '—' : n.toFixed(1))

/** Counts of 5★ … 1★. */
export function distribution(list: Rating[]): { stars: number; count: number }[] {
  return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: list.filter((r) => Math.round(r.overall) === stars).length }))
}

export function aspectAverages(list: Rating[]): { aspect: RatingAspect; avg: number | null; count: number }[] {
  return RATING_ASPECTS.map((aspect) => {
    const values = list.map((r) => r.aspects?.[aspect]).filter((v): v is number => typeof v === 'number' && v > 0)
    return { aspect, avg: average(values), count: values.length }
  })
}

// ---- Periods ------------------------------------------------------------------

export const PERIODS = ['This month', 'Last 3 months', 'This year', 'All time'] as const
export type Period = (typeof PERIODS)[number]

/** First day of the period (calendar months: "Last 3 months" = this month and the two before). */
export function periodStart(p: Period, today = TODAY_ISO): string | null {
  const d = parseISO(today)
  if (p === 'This month') return toISO(new Date(d.getFullYear(), d.getMonth(), 1))
  if (p === 'Last 3 months') return toISO(new Date(d.getFullYear(), d.getMonth() - 2, 1))
  if (p === 'This year') return toISO(new Date(d.getFullYear(), 0, 1))
  return null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export interface TrendPoint {
  key: string // YYYY-MM
  label: string // Jun
  long: string // June 2026
  avg: number | null
  count: number
}
/** Average rating per calendar month, oldest first, ending with the current month. */
export function monthlyTrend(list: Rating[], months = 6, today = TODAY_ISO): TrendPoint[] {
  const d = parseISO(today)
  const out: TrendPoint[] = []
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    const key = toISO(m).slice(0, 7)
    const inMonth = list.filter((r) => (r.date || '').slice(0, 7) === key)
    out.push({ key, label: MONTHS[m.getMonth()], long: `${MONTHS_FULL[m.getMonth()]} ${m.getFullYear()}`, avg: avgOf(inMonth), count: inMonth.length })
  }
  return out
}

export const sameRef = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
export const ratingsOf = (ratings: Rating[], ref: string) => ratings.filter((r) => sameRef(r.bookingRef, ref))

/** Newest review first (review date, then when it was recorded). */
export function byNewestRating(a: Rating, b: Rating): number {
  return (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')
}

/** Bookings a rating can be linked to: in-house and completed stays, latest check-out first. */
export function rateableBookings(bookings: Booking[]): Booking[] {
  return bookings.filter((b) => isCompleted(b) || isInHouse(b)).sort((a, b) => b.checkOut.localeCompare(a.checkOut) || b.ref.localeCompare(a.ref))
}

// ---- Feedback link, WhatsApp, clipboard ------------------------------------------

/** The guest's page on the website: <site>/feedback?t=<token>. */
export const feedbackUrl = (token: string) => `${window.location.origin}/feedback?t=${encodeURIComponent(token)}`

/** wa.me number: digits only; a 10-digit Indian mobile (or 0 + 10 digits) gets the 91 country code. '' if unusable. */
export function waNumber(phone?: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  return digits.length > 10 ? digits : ''
}
/** WhatsApp chat with the text filled in; without a usable number WhatsApp asks who to send it to. */
export function waUrl(phone: string | undefined, text: string): string {
  const n = waNumber(phone)
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

/**
 * Open a link in a new tab. When the link needs an API call first, pass a promise: the tab is opened
 * straight away (still inside the click, so pop-up blockers allow it) and pointed at the link once ready.
 */
export async function openInNewTab(url: string | Promise<string>): Promise<void> {
  if (typeof url === 'string') {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  const win = window.open('', '_blank')
  try {
    const href = await url
    if (win) {
      win.opener = null
      win.location.href = href
    } else {
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  } catch (e) {
    win?.close()
    throw e
  }
}

/**
 * Copy text to the clipboard. A promise (a link still being created) is handed to the clipboard inside the
 * click where the browser supports it, so Safari still allows the copy.
 */
export async function copyText(value: string | Promise<string>): Promise<void> {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
  if (typeof value !== 'string' && clip?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await clip.write([new ClipboardItem({ 'text/plain': value.then((t) => new Blob([t], { type: 'text/plain' })) })])
      return
    } catch {
      // not supported, or the link failed: settle below (which rethrows an API error)
    }
  }
  const text = await value
  try {
    if (clip?.writeText) {
      await clip.writeText(text)
      return
    }
  } catch {
    // plain http or no permission: try the old way
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  ta.remove()
  if (!ok) throw new Error('Could not copy. Select the text and copy it by hand.')
}

// ---- Messages ---------------------------------------------------------------------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there'
/** "Tue, 10 Nov 2026" */
const longDay = (iso: string) => `${WEEKDAYS[parseISO(iso).getDay()]}, ${fmtDate(iso)}`
/** Booked date with the standard time, or the actual date and time once it happened. */
const when = (booked: string, actual: string | undefined, scheduled: string) =>
  actual && datePart(actual) && timePart(actual) ? `${longDay(datePart(actual))}, ${timePart(actual)}` : `${longDay(booked)}, ${scheduled}`
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

function signOff(): string[] {
  return [
    ...(RESORT.phone ? [`For anything you need, call or WhatsApp us on ${RESORT.phone}.`] : []),
    '',
    'Warm regards,',
    RESORT.name,
  ]
}

/** Booking details for the guest (*…* is bold in WhatsApp). */
export function bookingMessage(b: Booking): string {
  const done = isCompleted(b)
  const inHouse = isInHouse(b)
  const intro = done
    ? `Thank you for staying with us at ${RESORT.name}. Here are your booking details.`
    : inHouse
      ? `Welcome to ${RESORT.name}! Here are your booking details.`
      : b.status === 'confirmed'
        ? `Thank you for booking with ${RESORT.name}. Your booking is confirmed.`
        : `Thank you for choosing ${RESORT.name}. Here are your booking details.`
  const closing = done ? 'We hope to welcome you back soon.' : inHouse ? 'We hope you enjoy your stay.' : 'We look forward to welcoming you.'

  const adults = b.adults ?? b.guests
  const kids = b.kids ?? 0
  const extras = chargesTotal(b)
  const paid = Math.max(0, b.total - roomBalance(b)) + extrasCollected(b)
  const balance = roomBalance(b) + chargesDue(b)
  const roomsWord = bookingRooms(b.villa).length > 1 ? 'Rooms' : 'Room'

  return [
    `Hello ${firstName(b.guest)},`,
    '',
    intro,
    '',
    `*Booking ref:* ${b.ref}`,
    `*Guest:* ${b.guest}`,
    `*${roomsWord}:* ${roomLabel(b.villa)}`,
    `*Check-in:* ${when(b.checkIn, b.checkedInAt, CHECK_IN_TIME)}`,
    `*Check-out:* ${when(b.checkOut, b.checkedOutAt, CHECK_OUT_TIME)} (${plural(nightsOf(b), 'night')})`,
    `*Guests:* ${plural(adults, 'adult')}${kids > 0 ? `, ${plural(kids, 'kid')}` : ''}`,
    ...(extras > 0
      ? [`*Room charges:* ${formatINR(b.total)}`, `*Other expenses:* ${formatINR(extras)}`, `*Total:* ${formatINR(b.total + extras)}`]
      : [`*Total:* ${formatINR(b.total)}`]),
    `*Paid:* ${formatINR(paid)}`,
    `*Balance:* ${formatINR(balance)}`,
    '',
    closing,
    ...signOff(),
  ].join('\n')
}

/** Asks the guest to rate the stay through their feedback link. */
export function feedbackMessage(b: Booking, link: string): string {
  const ask = isInHouse(b)
    ? `We hope you're enjoying your stay at ${RESORT.name}! When you have a minute, we'd love to hear how it's going. It takes less than a minute:`
    : `Thank you for staying with us at ${RESORT.name}! We'd love to hear how your stay was. It takes less than a minute:`
  return [`Hello ${firstName(b.guest)},`, '', ask, link, '', 'Warm regards,', RESORT.name].join('\n')
}

export const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)
