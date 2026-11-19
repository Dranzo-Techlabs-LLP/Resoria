// Date helpers for the Dashboard, Calendar and Room availability pages.
import { addDays } from '../../lib/booking'
import { parseISO, toISO } from '../../lib/format'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const WEEKDAY_SHORT = WEEKDAYS

/** A real calendar date written as YYYY-MM-DD. */
export function isValidISO(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return toISO(parseISO(s)) === s
}

/** "Tue, 10 Nov" */
export function fmtDayShort(iso: string): string {
  const d = parseISO(iso)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}
/** "Tue, 10 Nov 2026" */
export function fmtDayLong(iso: string): string {
  return `${fmtDayShort(iso)} ${parseISO(iso).getFullYear()}`
}
/** "Tuesday, 10 November 2026" */
export function fmtFullDate(iso: string): string {
  const d = parseISO(iso)
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}

/** The Sunday that starts the week containing `iso`. */
export function weekStartOf(iso: string): string {
  return addDays(iso, -parseISO(iso).getDay())
}
/** "8 – 14 Nov 2026", "29 Nov – 5 Dec 2026", "27 Dec 2026 – 2 Jan 2027" */
export function fmtWeekRange(start: string): string {
  const a = parseISO(start)
  const b = parseISO(addDays(start, 6))
  if (a.getFullYear() !== b.getFullYear()) {
    return `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
  }
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
  }
  return `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
}

/** First day (YYYY-MM-01) of the month `n` months after the month of `iso`. */
export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso)
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1))
}
