import { Fragment, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, X } from 'lucide-react'
import { can, useAuth } from '../auth/AuthContext'
import { useStore } from '../data/store'
import {
  BOOKING_TABS, addDays, bookingTab, byNewest, chargesDue, isCancelled, isCompleted, isInHouse, roomBalance, sourceType,
  type BookingTab,
} from '../lib/booking'
import { bookingHasRoom, bookingRooms, roomCategory, roomsByCategory } from '../lib/config'
import { TODAY_ISO, fmtDate, fmtDateShort, formatINR, parseISO } from '../lib/format'
import { KpiCard } from '../components/ui/KpiCard'
import { PageTitle } from '../components/ui/PageTitle'
import { fieldCls, linkCls, refCardCls, solidBtnCls } from '../components/styles'
import { CancelBookingModal, DeleteBookingModal } from '../components/booking/BookingModals'
import { BookingRow } from '../components/booking/BookingRow'
import { SelectBox } from '../components/booking/FormParts'
import type { Booking } from '../types'

const TAB_SLUG: Record<BookingTab, string> = {
  All: '', Today: 'today', 'In-house': 'in-house', Upcoming: 'upcoming', Completed: 'completed', Cancelled: 'cancelled',
}
const SUBTITLE: Record<BookingTab, string> = {
  All: 'Sorted by most recent booking first',
  Today: 'Check-ins scheduled today · moves to In-house after check-in',
  'In-house': 'Guests currently staying · open a booking for food orders and additional expenses',
  Upcoming: 'Future reservations by check-in date',
  Completed: 'Guests who have checked out · total billed includes additional expenses',
  Cancelled: 'Cancelled bookings with cancellation charges and refund status',
}
const EMPTY: Record<BookingTab, string> = {
  All: 'No bookings yet.',
  Today: 'No check-ins scheduled for today.',
  'In-house': 'No guests are staying right now.',
  Upcoming: 'No upcoming reservations.',
  Completed: 'No completed stays yet.',
  Cancelled: 'No cancelled bookings.',
}
const SOURCE_FILTERS = ['Direct', 'B2B', 'OTA', 'Referral'] as const

const SORTS: Record<BookingTab, (a: Booking, b: Booking) => number> = {
  All: byNewest,
  Today: (a, b) => a.checkIn.localeCompare(b.checkIn) || byNewest(a, b),
  'In-house': (a, b) => a.checkOut.localeCompare(b.checkOut) || byNewest(a, b),
  Upcoming: (a, b) => a.checkIn.localeCompare(b.checkIn) || byNewest(a, b),
  Completed: (a, b) => (b.completedAt || b.checkedOutAt || b.checkOut).localeCompare(a.completedAt || a.checkedOutAt || a.checkOut) || byNewest(a, b),
  Cancelled: (a, b) => (b.cancelledAt || b.createdAt).localeCompare(a.cancelledAt || a.createdAt) || byNewest(a, b),
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Upcoming group header: "Tomorrow · Wed 11 Nov", "Thu 12 Nov". */
function dayLabel(iso: string): string {
  const label = `${WEEKDAYS[parseISO(iso).getDay()]} ${fmtDateShort(iso)}`
  return iso === addDays(TODAY_ISO, 1) ? `Tomorrow · ${label}` : label
}
const digitsOf = (s?: string) => (s ?? '').replace(/\D/g, '')

type Param = 'tab' | 'q' | 'room' | 'date' | 'source'

export function Bookings() {
  const { user } = useAuth()
  const { data } = useStore()
  const [params, setParams] = useSearchParams()
  const [modal, setModal] = useState<{ kind: 'cancel' | 'remove'; booking: Booking } | null>(null)

  const canEdit = can(user, 'edit_bookings')
  const canCancel = can(user, 'cancel_bookings')

  // Tab and filters live in the URL so Back from a booking returns to them
  const tab = BOOKING_TABS.find((t) => TAB_SLUG[t] === (params.get('tab') ?? '')) ?? 'All'
  const q = params.get('q') ?? ''
  const room = params.get('room') ?? ''
  const date = params.get('date') ?? ''
  const source = params.get('source') ?? ''
  const filtersActive = !!(q.trim() || room || date || source)

  function update(patch: Partial<Record<Param, string>>) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      return next
    }, { replace: true })
  }
  const setTab = (t: BookingTab) => update({ tab: TAB_SLUG[t] })

  // ---- KPIs (whole property, not filtered) ----
  const kpi = useMemo(() => {
    const today = TODAY_ISO
    const arriving = data.bookings.filter((b) => !isCancelled(b) && b.checkIn === today)
    const departing = data.bookings.filter((b) => (isInHouse(b) || isCompleted(b)) && b.checkOut === today)
    let collected = 0
    for (const b of data.bookings) {
      for (const p of b.payments) {
        if ((p.date ?? '').slice(0, 10) === today) collected += p.kind === 'refund' ? -p.amount : p.amount
      }
    }
    const open = new Set([...arriving.filter((b) => !isCompleted(b)), ...data.bookings.filter(isInHouse)])
    let pending = 0
    for (const b of open) pending += roomBalance(b) + chargesDue(b)
    return { checkIns: arriving.length, checkOuts: departing.length, collected, pending }
  }, [data.bookings])

  // ---- Filters (search, rooms, date, source), then tabs ----
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    const queryDigits = /^[\d\s+-]+$/.test(query) ? digitsOf(query) : ''
    const category = room.startsWith('cat:') ? room.slice(4) : ''
    return data.bookings.filter((b) => {
      if (query) {
        const text = `${b.guest} ${b.ref} ${b.phone} ${b.altPhone ?? ''}`.toLowerCase()
        const phoneHit = queryDigits.length >= 3 && (digitsOf(b.phone).includes(queryDigits) || digitsOf(b.altPhone).includes(queryDigits))
        if (!text.includes(query) && !phoneHit) return false
      }
      if (category && !bookingRooms(b.villa).some((r) => roomCategory(r) === category)) return false
      if (room && !category && !bookingHasRoom(b.villa, room)) return false
      if (date && !(b.checkIn <= date && date <= b.checkOut)) return false
      if (source && sourceType(b) !== source) return false
      return true
    })
  }, [data.bookings, q, room, date, source])

  const counts = useMemo(() => {
    const c: Record<BookingTab, number> = { All: filtered.length, Today: 0, 'In-house': 0, Upcoming: 0, Completed: 0, Cancelled: 0 }
    for (const b of filtered) c[bookingTab(b)]++
    return c
  }, [filtered])

  const rows = useMemo(
    () => (tab === 'All' ? filtered.slice() : filtered.filter((b) => bookingTab(b) === tab)).sort(SORTS[tab]),
    [filtered, tab],
  )

  const kpiValue = (v: string | number) => <span className="text-[28px] sm:text-[34px]">{v}</span>

  return (
    <>
      <PageTitle
        title="Bookings"
        subtitle={SUBTITLE[tab]}
        actions={canEdit ? <Link to="/bookings/new" className={solidBtnCls}>+ New booking</Link> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Today's check-ins" value={kpiValue(kpi.checkIns)} sub="Arriving today" onClick={() => setTab('Today')} />
        <KpiCard label="Today's check-outs" value={kpiValue(kpi.checkOuts)} sub="Departing today" onClick={() => setTab('In-house')} />
        <KpiCard label="Today's collections" value={kpiValue(formatINR(kpi.collected))} sub="Received today" />
        <KpiCard label="Today's pending" value={kpiValue(formatINR(kpi.pending))} sub="Outstanding today" tone="due" />
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-col gap-3 md:flex-row">
        <input
          type="search"
          aria-label="Search guest, phone or booking ID"
          placeholder="Search guest, phone or booking ID"
          className={`${fieldCls} md:flex-1`}
          value={q}
          onChange={(e) => update({ q: e.target.value })}
        />
        <div className="grid grid-cols-3 gap-2.5 md:flex md:gap-3">
          <SelectBox ariaLabel="Rooms" value={room} onChange={(v) => update({ room: v === 'all' ? '' : v })} className="md:w-40">
            <option value="" hidden>Rooms</option>
            <option value="all">All rooms</option>
            {roomsByCategory().map(({ category, rooms }) => (
              <optgroup key={category} label={category}>
                {rooms.length > 1 && <option value={`cat:${category}`}>All {category}</option>}
                {rooms.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
              </optgroup>
            ))}
          </SelectBox>
          <DateFilter value={date} onChange={(v) => update({ date: v })} className="md:w-44" />
          <SelectBox ariaLabel="Source" value={source} onChange={(v) => update({ source: v === 'all' ? '' : v })} className="md:w-40">
            <option value="" hidden>Source</option>
            <option value="all">All sources</option>
            {SOURCE_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectBox>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Booking status" className="mt-5 flex gap-6 overflow-x-auto border-b border-[#e6e1d6] sm:gap-8">
        {BOOKING_TABS.map((t) => {
          const active = t === tab
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={`relative shrink-0 pt-1 pb-3 text-[15px] whitespace-nowrap transition-colors ${
                active ? 'font-semibold text-dark after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink' : 'text-slate-600 hover:text-dark'
              }`}
            >
              {t}
              <span className={`nums ml-1.5 text-[13px] font-normal ${active ? 'text-slate-500' : 'text-slate-400'}`}>{counts[t]}</span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className={`${refCardCls} mt-4`}>
        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-display text-xl font-semibold text-dark">{filtersActive ? 'No bookings match these filters.' : EMPTY[tab]}</p>
            {filtersActive ? (
              <button type="button" onClick={() => update({ q: '', room: '', date: '', source: '' })} className={`${linkCls} mt-3 text-[15px]`}>Clear filters</button>
            ) : tab === 'All' && canEdit ? (
              <Link to="/bookings/new" className={`${linkCls} mt-3 inline-block text-[15px]`}>Create the first booking</Link>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl xl:overflow-visible">
            <table className="w-full min-w-[900px] border-collapse text-left text-[15px]">
              <thead>
                <tr className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                  <th scope="col" className="px-5 py-3.5 font-semibold">Guest</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Room</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Stay</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Source</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Payment</th>
                  <th scope="col" className="w-16 px-5 py-3.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b, i) => (
                  <Fragment key={b.id}>
                    {tab === 'Upcoming' && b.checkIn !== rows[i - 1]?.checkIn && (
                      <tr className="border-t border-[#e6e1d6] bg-sand">
                        <td colSpan={6} className="px-5 py-2.5 text-sm font-medium text-slate-600">{dayLabel(b.checkIn)}</td>
                      </tr>
                    )}
                    <BookingRow
                      booking={b}
                      canEdit={canEdit}
                      canCancel={canCancel}
                      onCancel={(bk) => setModal({ kind: 'cancel', booking: bk })}
                      onRemove={(bk) => setModal({ kind: 'remove', booking: bk })}
                    />
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.kind === 'cancel' && <CancelBookingModal booking={modal.booking} onClose={() => setModal(null)} />}
      {modal?.kind === 'remove' && <DeleteBookingModal booking={modal.booking} onClose={() => setModal(null)} />}
    </>
  )
}

/** "Date" filter: bookings whose stay covers the day (check-in ≤ day ≤ check-out). */
function DateFilter({ value, onChange, className = '' }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={`relative h-11 min-w-0 ${className}`}>
      <input
        type="date"
        aria-label="Date: bookings staying on this day"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* older browsers open their own picker */ } }}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <div className={`pointer-events-none flex h-11 items-center rounded-xl border border-slate-300 bg-white pr-9 pl-3.5 text-[15px] peer-focus-visible:border-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink/20 ${value ? 'text-dark' : 'text-slate-500'}`}>
        <span className="truncate">
          {value ? <><span className="md:hidden">{fmtDateShort(value)}</span><span className="hidden md:inline">{fmtDate(value)}</span></> : 'Date'}
        </span>
      </div>
      {value ? (
        <button type="button" aria-label="Clear date" onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-dark">
          <X size={15} />
        </button>
      ) : (
        <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500" />
      )}
    </div>
  )
}
