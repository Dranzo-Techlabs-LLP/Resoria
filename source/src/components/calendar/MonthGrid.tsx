import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { occupancyOn } from '../../lib/booking'
import type { RoomConfig } from '../../lib/config'
import { parseISO, TODAY_ISO, toISO } from '../../lib/format'
import type { Booking } from '../../types'
import { fmtDayShort, WEEKDAY_SHORT } from './dates'

/**
 * Monthly view: the whole month (weeks start Sunday). Each date from today on
 * shows "5 B" (booked rooms) and "10 A" (available rooms) for the current room
 * filter; past dates are dimmed without figures.
 */
export function MonthGrid({
  month, rooms, bookings, linkState,
}: {
  month: string // any date in the month
  rooms: RoomConfig[]
  bookings: Booking[]
  linkState: unknown // passed to Room availability (its "Back to calendar" link)
}) {
  const cells = useMemo(() => {
    const first = parseISO(month)
    const y = first.getFullYear()
    const m = first.getMonth()
    const lead = new Date(y, m, 1).getDay()
    const count = new Date(y, m + 1, 0).getDate()
    const out: (null | { iso: string; day: number; booked: number; available: number })[] = Array(lead).fill(null)
    for (let day = 1; day <= count; day++) {
      const iso = toISO(new Date(y, m, day))
      let booked = 0
      if (iso >= TODAY_ISO) {
        const occ = occupancyOn(bookings, iso)
        booked = rooms.filter((r) => occ.has(r.name)).length
      }
      out.push({ iso, day, booked, available: rooms.length - booked })
    }
    while (out.length % 7) out.push(null)
    return out
  }, [month, rooms, bookings])

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-[#ece8df]">
        {WEEKDAY_SHORT.map((w) => (
          <div key={w} className="px-1.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-3 sm:text-xs">
            <span className="hidden sm:inline">{w}</span>
            <span className="sm:hidden">{w.slice(0, 2)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          const edge = `${i % 7 === 6 ? '' : 'border-r'} ${i < cells.length - 7 ? 'border-b' : ''} border-[#ece8df]`
          const box = `block min-h-[76px] min-w-0 p-1.5 sm:min-h-[120px] sm:p-3 ${edge}`
          if (!c) return <div key={`x${i}`} className={box} />
          if (c.iso < TODAY_ISO) {
            return (
              <div key={c.iso} className={`${box} bg-canvas`}>
                <span className="nums text-[13px] text-slate-400 sm:text-sm">{c.day}</span>
              </div>
            )
          }
          const isToday = c.iso === TODAY_ISO
          return (
            <Link
              key={c.iso}
              to={`/calendar/${c.iso}`}
              state={linkState}
              aria-label={`${fmtDayShort(c.iso)}: ${c.booked} booked, ${c.available} available. Open room availability`}
              aria-current={isToday ? 'date' : undefined}
              className={`${box} transition-colors hover:bg-[#faf8f4] ${isToday ? 'shadow-[inset_0_0_0_2px_#0b241e]' : ''}`}
            >
              <span className="nums text-[14px] font-semibold text-dark sm:text-[15px]">{c.day}</span>
              <span className="mt-1.5 flex flex-col items-start gap-1 sm:mt-2 sm:flex-row sm:flex-wrap sm:gap-1.5">
                <span className="nums whitespace-nowrap rounded-full bg-ink px-1 py-[3px] text-[10px] font-semibold leading-none text-white sm:px-2 sm:py-1 sm:text-xs">
                  {c.booked} B
                </span>
                <span className="nums whitespace-nowrap rounded-full bg-[#e3efe6] px-1 py-[3px] text-[10px] font-semibold leading-none text-[#24603e] sm:px-2 sm:py-1 sm:text-xs">
                  {c.available} A
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
