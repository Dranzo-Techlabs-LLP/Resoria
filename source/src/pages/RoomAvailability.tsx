import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../data/store'
import { addDays, occupancyOn, TOTAL_ROOMS } from '../lib/booking'
import { TODAY_ISO } from '../lib/format'
import { outlineBtnCls, refCardCls } from '../components/styles'
import { KpiCard } from '../components/ui/KpiCard'
import { PageTitle } from '../components/ui/PageTitle'
import { RoomBoard } from '../components/ui/RoomBoard'
import { fmtDayLong, fmtDayShort, isValidISO } from '../components/calendar/dates'
import { useRoomCanClick, useRoomClick } from '../components/calendar/useRoomClick'

const arrowBtnCls =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white'

/** The calendar view the user came from (passed as link state), else the default calendar. */
function backTarget(state: unknown): string {
  const back = (state as { back?: unknown } | null)?.back
  return typeof back === 'string' && back.startsWith('/calendar') ? back : '/calendar'
}

/** Room availability for one night (/calendar/:date): today and upcoming dates only. */
export function RoomAvailability() {
  const { date = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { data } = useStore()
  const onRoom = useRoomClick(date)
  const canClick = useRoomCanClick()
  const back = backTarget(location.state)

  const valid = isValidISO(date)
  if (!valid || date < TODAY_ISO) {
    return (
      <>
        <PageTitle title="Room availability" back={{ to: back, label: 'Back to calendar' }} />
        <div className={`${refCardCls} px-6 py-10 text-center`}>
          <p className="text-[17px] font-semibold text-dark">{valid ? 'This date has passed' : 'That date isn’t valid'}</p>
          <p className="mt-1.5 text-[15px] text-slate-600">
            Room availability is shown for today and upcoming dates.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <Link to={`/calendar/${TODAY_ISO}`} state={location.state} className={outlineBtnCls}>See today’s availability</Link>
            <Link to={back} className={outlineBtnCls}>Back to calendar</Link>
          </div>
        </div>
      </>
    )
  }

  // Day navigation replaces the history entry, so the browser's Back still returns to the calendar.
  const go = (iso: string) => {
    if (isValidISO(iso) && iso >= TODAY_ISO) navigate(`/calendar/${iso}`, { replace: true, state: location.state })
  }
  const booked = occupancyOn(data.bookings, date).size

  return (
    <>
      <PageTitle
        title="Room availability"
        back={{ to: back, label: 'Back to calendar' }}
        actions={date !== TODAY_ISO && (
          <button type="button" onClick={() => go(TODAY_ISO)} className={outlineBtnCls}>Today</button>
        )}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 sm:gap-5">
          <button type="button" onClick={() => go(addDays(date, -1))} disabled={date <= TODAY_ISO} aria-label="Previous day" className={arrowBtnCls}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h2 className="nums min-w-[190px] text-center font-display text-[22px] font-semibold text-dark sm:min-w-[230px] sm:text-[26px]" aria-live="polite">
            {fmtDayLong(date)}
          </h2>
          <button type="button" onClick={() => go(addDays(date, 1))} aria-label="Next day" className={arrowBtnCls}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:ml-auto">
          Go to date
          <input
            type="date"
            min={TODAY_ISO}
            value={date}
            onChange={(e) => go(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-900 focus:border-ink focus:ring-2 focus:ring-ink/20 focus:outline-none"
          />
        </label>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard label="Booked" value={booked} sub={`of ${TOTAL_ROOMS} rooms · ${fmtDayShort(date)}`} />
        <KpiCard label="Available" value={TOTAL_ROOMS - booked} sub="Free that night" />
      </div>

      <section className={`${refCardCls} p-5 sm:p-6`} aria-label={`Rooms on ${fmtDayLong(date)}`}>
        <RoomBoard bookings={data.bookings} date={date} onRoom={onRoom} canClick={canClick} />
      </section>
    </>
  )
}
