import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { can, useAuth } from '../auth/AuthContext'
import { useStore } from '../data/store'
import { RESORT } from '../lib/config'
import { addDays, byNewest, occupancyOn, TOTAL_ROOMS } from '../lib/booking'
import { fmtDateShort, TODAY, TODAY_ISO, toISO } from '../lib/format'
import { cardTitleCls, refCardCls } from '../components/styles'
import { KpiCard } from '../components/ui/KpiCard'
import { PageTitle } from '../components/ui/PageTitle'
import { RoomBoard } from '../components/ui/RoomBoard'
import { fmtDayLong, fmtFullDate, MONTHS_LONG } from '../components/calendar/dates'
import { useRoomCanClick, useRoomClick } from '../components/calendar/useRoomClick'
import { formatLakh, monthMoney } from '../components/dashboard/finance'
import { RevenueExpenseChart, type MonthPoint } from '../components/dashboard/RevenueExpenseChart'
import { SourceDonut } from '../components/dashboard/SourceDonut'

const navBtnCls =
  'inline-flex h-10 items-center gap-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50'

/** The month `back` months before the current one. */
function monthOf(back: number) {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - back, 1)
  return { key: toISO(d).slice(0, 7), short: MONTHS_LONG[d.getMonth()].slice(0, 3), long: MONTHS_LONG[d.getMonth()], year: d.getFullYear() }
}

const oneDecimal = (n: number) => n.toFixed(1).replace(/\.0$/, '')

/** "Today Room Status": today and upcoming nights only (no previous dates). */
function RoomStatusCard() {
  const { data } = useStore()
  const [date, setDate] = useState(TODAY_ISO)
  const onRoom = useRoomClick(date)
  const canClick = useRoomCanClick()
  return (
    <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="room-status-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="room-status-title" className={cardTitleCls}>Today Room Status</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="nums mr-1 text-[15px] font-medium text-dark" aria-live="polite">{fmtDayLong(date)}</span>
          {date !== TODAY_ISO && (
            <button type="button" onClick={() => setDate(TODAY_ISO)} className={navBtnCls}>Today</button>
          )}
          <button type="button" onClick={() => setDate((d) => addDays(d, 1))} className={navBtnCls}>
            Next day <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <RoomBoard bookings={data.bookings} date={date} onRoom={onRoom} canClick={canClick} />
    </section>
  )
}

/** The 5 most recently made bookings (shown to users who can view bookings). */
function RecentBookings() {
  const { data } = useStore()
  const recent = useMemo(() => [...data.bookings].sort(byNewest).slice(0, 5), [data.bookings])
  return (
    <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="recent-title">
      <h2 id="recent-title" className={`${cardTitleCls} mb-3`}>Recent bookings</h2>
      {recent.length === 0 && <p className="py-6 text-sm text-slate-500">No bookings yet.</p>}
      <ul className="divide-y divide-[#ece8df]">
        {recent.map((b) => (
          <li key={b.id}>
            <Link
              to={`/bookings/${encodeURIComponent(b.ref)}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[#f7f5f0]"
            >
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-dark">{b.guest}</div>
                <div className="truncate text-sm text-slate-500">
                  {b.villa} · {b.guests} {b.guests === 1 ? 'guest' : 'guests'}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="nums text-[15px] text-slate-600">{fmtDateShort(b.checkIn)}</div>
                {b.status === 'cancelled' && <div className="text-xs font-medium text-red-700">Cancelled</div>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Dashboard() {
  const { user } = useAuth()
  const { data } = useStore()
  const showMoney = can(user, 'view_accounting')
  const showBookings = can(user, 'view_bookings')

  const occupied = useMemo(() => occupancyOn(data.bookings, TODAY_ISO).size, [data.bookings])

  const money = useMemo(() => {
    const months = [5, 4, 3, 2, 1, 0].map(monthOf)
    const points: MonthPoint[] = months.map((m) => {
      const mm = monthMoney(data, m.key)
      return { key: m.key, label: m.short, long: `${m.long} ${m.year}`, revenue: mm.revenue, expenses: mm.expenses }
    })
    const current = monthMoney(data, months[5].key)
    const previous = monthMoney(data, months[4].key)
    return { points, current, previous, month: months[5], prevMonth: months[4] }
  }, [data])

  const { current, previous, month, prevMonth } = money
  const change = previous.revenue > 0 ? Math.round(((current.revenue - previous.revenue) / previous.revenue) * 100) : null
  const margin = current.revenue > 0 ? Math.round((current.profit / current.revenue) * 100) : null

  return (
    <>
      <PageTitle title="Dashboard" subtitle={`${fmtFullDate(TODAY_ISO)} · ${RESORT.name}`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Occupied rooms"
          value={`${occupied} / ${TOTAL_ROOMS}`}
          sub={`${oneDecimal((occupied / TOTAL_ROOMS) * 100)}% occupancy`}
        />
        {showMoney && (
          <>
            <KpiCard
              label={`Revenue · ${month.short}`}
              value={formatLakh(current.revenue)}
              sub={change === null ? 'This month' : `${change >= 0 ? '+' : '−'}${Math.abs(change)}% vs ${prevMonth.long}`}
            />
            <KpiCard label={`Expenses · ${month.short}`} value={formatLakh(current.expenses)} sub="This month" />
            <KpiCard
              label="Net profit"
              value={formatLakh(current.profit)}
              sub={margin === null ? 'No revenue yet this month' : `${margin}% margin`}
            />
          </>
        )}
      </div>

      <div className={`mt-5 grid grid-cols-1 gap-5 ${showBookings ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
        <RoomStatusCard />
        {showBookings && <RecentBookings />}
      </div>

      {showMoney && (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="rev-exp-title">
            <h2 id="rev-exp-title" className={`${cardTitleCls} mb-4`}>Revenue &amp; Expenses · last 6 months</h2>
            <RevenueExpenseChart data={money.points} />
          </section>
          <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="by-source-title">
            <h2 id="by-source-title" className={`${cardTitleCls} mb-5`}>Revenue by source · {month.long}</h2>
            <SourceDonut bySource={current.bySource} total={current.revenue} month={month.long} />
          </section>
        </div>
      )}
    </>
  )
}
