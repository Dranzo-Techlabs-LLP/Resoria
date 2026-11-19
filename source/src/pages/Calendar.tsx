import { useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { can, useAuth } from '../auth/AuthContext'
import { useStore } from '../data/store'
import { addDays, occupancyOn } from '../lib/booking'
import { ALL_ROOMS, ROOM_CATEGORIES, ROOMS, roomsByCategory, type RoomConfig } from '../lib/config'
import { monthLabel, parseISO, TODAY_ISO } from '../lib/format'
import { refCardCls } from '../components/styles'
import { KpiCard } from '../components/ui/KpiCard'
import { PageTitle } from '../components/ui/PageTitle'
import { addMonths, fmtDayShort, fmtWeekRange, isValidISO, weekStartOf } from '../components/calendar/dates'
import { MonthGrid } from '../components/calendar/MonthGrid'
import { WeekGrid } from '../components/calendar/WeekGrid'

type View = 'week' | 'month'

/** "All rooms", a category ("Premium") or one room ("Haven"); anything else falls back to All rooms. */
function normFilter(v: string | null): string {
  if (!v) return ALL_ROOMS
  if ((ROOM_CATEGORIES as readonly string[]).includes(v) || ROOMS.some((r) => r.name === v)) return v
  return ALL_ROOMS
}
function roomsForFilter(f: string): RoomConfig[] {
  if (f === ALL_ROOMS) return ROOMS
  if ((ROOM_CATEGORIES as readonly string[]).includes(f)) return ROOMS.filter((r) => r.category === f)
  return ROOMS.filter((r) => r.name === f)
}
const later = (a: string, b: string) => (a > b ? a : b)

const boxBtnCls =
  'inline-flex h-10 shrink-0 items-center sm:h-11 justify-center rounded-xl border border-slate-300 bg-white text-[15px] font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white'

export function Calendar() {
  const { data } = useStore()
  const { user } = useAuth()
  const location = useLocation()
  const [params, setParams] = useSearchParams()

  // View, filter and shown date live in the URL so Back from Room availability returns here unchanged.
  // The shown date is never before today (no navigation to previous weeks / months).
  const view: View = params.get('view') === 'month' ? 'month' : 'week'
  const filter = normFilter(params.get('room'))
  const rawDate = params.get('d')
  const date = isValidISO(rawDate) && rawDate > TODAY_ISO ? rawDate : TODAY_ISO
  const rooms = useMemo(() => roomsForFilter(filter), [filter])
  const linkState = { back: `/calendar${location.search}` }

  const update = (next: { view?: View; room?: string; date?: string }) => {
    const p = new URLSearchParams(params)
    const v = next.view ?? view
    const r = next.room ?? filter
    const d = later(next.date ?? date, TODAY_ISO)
    if (v === 'month') p.set('view', 'month')
    else p.delete('view')
    if (r === ALL_ROOMS) p.delete('room')
    else p.set('room', r)
    if (d > TODAY_ISO) p.set('d', d)
    else p.delete('d')
    setParams(p, { replace: true })
  }

  const weekStart = weekStartOf(date)
  const atStart = view === 'week' ? weekStart === weekStartOf(TODAY_ISO) : date.slice(0, 7) === TODAY_ISO.slice(0, 7)
  const label = view === 'week' ? fmtWeekRange(weekStart) : monthLabel(parseISO(date).getFullYear(), parseISO(date).getMonth())
  const step = (dir: 1 | -1) => update({ date: view === 'week' ? addDays(weekStart, 7 * dir) : addMonths(date, dir) })

  const bookedToday = useMemo(() => {
    const occ = occupancyOn(data.bookings, TODAY_ISO)
    return rooms.filter((r) => occ.has(r.name)).length
  }, [data.bookings, rooms])

  return (
    <>
      <PageTitle
        title="Calendar"
        subtitle={view === 'week' ? 'Click any date to open room availability' : 'B = booked rooms · A = available rooms'}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Calendar view" className="inline-flex h-11 rounded-xl border border-slate-300 bg-white p-0.5">
          {(['week', 'month'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => update({ view: v })}
              className={`rounded-[10px] px-4 text-[15px] font-medium transition-colors ${
                view === v ? 'bg-ink text-white' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {v === 'week' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
        <div className="relative">
          <select
            aria-label="Rooms shown"
            value={filter}
            onChange={(e) => update({ room: e.target.value })}
            className="h-11 w-48 appearance-none rounded-xl border border-slate-300 bg-white pl-3.5 pr-9 text-[15px] text-slate-800 focus:border-ink focus:ring-2 focus:ring-ink/20 focus:outline-none"
          >
            <option value={ALL_ROOMS}>All rooms</option>
            {roomsByCategory().map((g) => (
              <optgroup key={g.category} label={g.category}>
                {g.rooms.length > 1 && <option value={g.category}>All {g.category} ({g.rooms.length})</option>}
                {g.rooms.length === 1 && g.rooms[0].name === g.category
                  ? <option value={g.category}>{g.category}</option>
                  : g.rooms.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        </div>

        <div className="flex w-full items-center gap-1.5 sm:ml-auto sm:w-auto sm:gap-2">
          <button type="button" onClick={() => update({ date: TODAY_ISO })} className={`${boxBtnCls} px-3.5 sm:px-4`}>Today</button>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={atStart}
            aria-label={view === 'week' ? 'Previous week' : 'Previous month'}
            className={`${boxBtnCls} w-10 sm:w-11`}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <div className="nums min-w-0 flex-1 px-1 text-center text-[15px] font-semibold text-dark sm:min-w-[160px] sm:flex-none sm:text-[17px]" aria-live="polite">
            {label}
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={view === 'week' ? 'Next week' : 'Next month'}
            className={`${boxBtnCls} w-10 sm:w-11`}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total rooms" value={rooms.length} sub="Resort rooms" />
        <KpiCard label="Booked today" value={bookedToday} sub={fmtDayShort(TODAY_ISO)} />
        <KpiCard label="Available today" value={rooms.length - bookedToday} sub="Free tonight" />
      </div>

      <div className={`${refCardCls} overflow-hidden`}>
        {view === 'week' ? (
          <div className="overflow-x-auto">
            <WeekGrid
              start={weekStart}
              rooms={rooms}
              bookings={data.bookings}
              canOpen={can(user, 'view_bookings')}
              linkState={linkState}
            />
          </div>
        ) : (
          <MonthGrid month={date} rooms={rooms} bookings={data.bookings} linkState={linkState} />
        )}
      </div>
      {view === 'month' && (
        <p className="mt-3 text-sm text-slate-500">Past dates are dimmed and previous months are not available.</p>
      )}
    </>
  )
}
