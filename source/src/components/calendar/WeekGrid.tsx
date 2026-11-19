import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { addDays, fmtStay, occupancyOn } from '../../lib/booking'
import { ROOM_CATEGORIES, type RoomConfig } from '../../lib/config'
import { parseISO, TODAY_ISO } from '../../lib/format'
import type { Booking } from '../../types'
import { fmtDayShort, WEEKDAY_SHORT } from './dates'

/** A booking's run of consecutive nights in one room within the week (day indexes, inclusive). */
interface Segment {
  booking: Booking
  start: number
  end: number
}

const COLS = '128px repeat(7, minmax(96px, 1fr))'
const TODAY_TINT = 'bg-[#eef1ed]'

/**
 * Weekly booking view: rooms down the left (grouped by category), the week's
 * days across. Booking bars span every night the booking holds the room in
 * this week (clipped at the week's edges); empty nights show "Free".
 */
export function WeekGrid({
  start, rooms, bookings, canOpen, linkState,
}: {
  start: string // the Sunday
  rooms: RoomConfig[]
  bookings: Booking[]
  canOpen: boolean // may open booking details
  linkState: unknown // passed to Room availability (its "Back to calendar" link)
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start])
  const occ = useMemo(() => days.map((d) => occupancyOn(bookings, d)), [days, bookings])
  const todayIdx = days.indexOf(TODAY_ISO)
  const groups = ROOM_CATEGORIES.map((category) => ({ category, rooms: rooms.filter((r) => r.category === category) })).filter(
    (g) => g.rooms.length > 0,
  )

  const segmentsOf = (room: string): Segment[] => {
    const out: Segment[] = []
    occ.forEach((night, i) => {
      const b = night.get(room)
      if (!b) return
      const last = out[out.length - 1]
      if (last && last.booking === b && last.end === i - 1) last.end = i
      else out.push({ booking: b, start: i, end: i })
    })
    return out
  }

  return (
    <div className="min-w-[800px] text-sm">
      {/* Day headers */}
      <div className="grid border-b border-[#ece8df]" style={{ gridTemplateColumns: COLS }}>
        <div className="sticky left-0 z-[2] bg-white" />
        {days.map((d, i) => {
          const label = `${WEEKDAY_SHORT[i]} ${parseISO(d).getDate()}`
          const isToday = i === todayIdx
          const inner = (
            <span
              className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-[15px] ${
                isToday ? 'bg-ink font-semibold text-white' : 'text-slate-600'
              }`}
            >
              {label}
            </span>
          )
          return (
            <div key={d} className="flex items-center justify-center px-1 py-2">
              {d >= TODAY_ISO ? (
                <Link
                  to={`/calendar/${d}`}
                  state={linkState}
                  aria-label={`${fmtDayShort(d)}: open room availability`}
                  aria-current={isToday ? 'date' : undefined}
                  className={`rounded-xl ${isToday ? '' : 'hover:bg-[#f3f0e8]'}`}
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </div>
          )
        })}
      </div>

      {groups.map((g) => (
        <div key={g.category}>
          <div className="border-b border-[#ece8df] bg-[#f3f0e8] py-2">
            <span className="sticky left-0 inline-block px-4 text-[13px] font-semibold text-slate-600">
              {g.category} · {g.rooms.length} {g.rooms.length === 1 ? 'room' : 'rooms'}
            </span>
          </div>
          {g.rooms.map((room) => (
            <div key={room.name} className="grid border-b border-[#ece8df] last:border-b-0" style={{ gridTemplateColumns: COLS }}>
              <div
                className="sticky left-0 z-[2] flex min-h-[46px] items-center bg-white px-4 text-[15px] font-semibold text-dark"
                style={{ gridRow: 1, gridColumn: 1 }}
              >
                {room.name}
              </div>
              {days.map((d, i) => {
                const cell = i === todayIdx ? TODAY_TINT : ''
                const pos = { gridRow: 1, gridColumn: i + 2 }
                if (occ[i].has(room.name)) return <div key={d} className={cell} style={pos} />
                const free = 'flex items-center justify-center text-[13px] text-slate-400'
                return d >= TODAY_ISO ? (
                  <Link
                    key={d}
                    to={`/calendar/${d}`}
                    state={linkState}
                    aria-label={`${room.name} free on ${fmtDayShort(d)}: open room availability`}
                    className={`${free} ${cell} transition-colors hover:bg-[#f3f0e8] hover:text-dark`}
                    style={pos}
                  >
                    Free
                  </Link>
                ) : (
                  <span key={d} className={`${free} ${cell}`} style={pos}>Free</span>
                )
              })}
              {segmentsOf(room.name).map((s) => {
                const b = s.booking
                const before = s.start === 0 && b.checkIn < days[0]
                const after = s.end === 6 && b.checkOut > addDays(days[6], 1)
                const cls = `relative z-[1] mx-[3px] my-[5px] flex h-9 min-w-0 items-center overflow-hidden bg-ink px-3 text-sm font-semibold text-white ${
                  before ? 'rounded-l-sm' : 'rounded-l-lg'
                } ${after ? 'rounded-r-sm' : 'rounded-r-lg'}`
                const style = { gridRow: 1, gridColumn: `${s.start + 2} / span ${s.end - s.start + 1}` }
                const title = `${b.guest} · ${b.ref} · ${fmtStay(b)}`
                const name = <span className="truncate">{b.guest}</span>
                return canOpen ? (
                  <Link
                    key={`${b.id}-${s.start}`}
                    to={`/bookings/${encodeURIComponent(b.ref)}`}
                    title={title}
                    aria-label={`${b.guest}, ${room.name}, ${fmtStay(b)}: open booking`}
                    className={`${cls} transition-colors hover:bg-ink-hover`}
                    style={style}
                  >
                    {name}
                  </Link>
                ) : (
                  <div key={`${b.id}-${s.start}`} title={title} className={cls} style={style}>
                    {name}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
