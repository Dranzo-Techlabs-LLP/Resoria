import { useMemo, useState } from 'react'
import { B2B_CATEGORY, useStore } from '../data/store'
import { FULL_PROPERTY, isFullProperty, primaryRoom, ROOM_NAMES, ROOM_OPTIONS } from '../lib/config'
import { amountForRoom, bookingUnits } from '../lib/managementReport'
import type { Booking, Expense } from '../types'
import { formatINR, TODAY, TODAY_ISO, toISO } from '../lib/format'
import { inputCls, refCardCls, selectCls, thCls, thRightCls } from '../components/styles'
import { PageTitle } from '../components/ui/PageTitle'
import { VillaDot } from '../components/ui/VillaDot'

const GENERAL_ROW = 'General (no room)'

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'green' | 'orange' | 'red' }) {
  const color = tone === 'green' ? 'text-emerald-700' : tone === 'red' ? 'text-red-600' : 'text-amber-600'
  return (
    <div className={`${refCardCls} p-5`}>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`nums mt-2 text-[22px] font-semibold tracking-tight ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  )
}

export function Accounting() {
  const { data } = useStore()
  const [villa, setVilla] = useState('All rooms')
  const [from, setFrom] = useState(toISO(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1)))
  const [to, setTo] = useState(TODAY_ISO)
  // Stay month: money of the bookings whose check-in is in the period. Cash date: money by the date it was paid.
  const [basis, setBasis] = useState<'stay' | 'cash'>('stay')

  const model = useMemo(() => {
    const inRange = (d: string) => (!from || d >= from) && (!to || d <= to)
    const stayRefs = new Set(data.bookings.filter((b) => inRange(b.checkIn)).map((b) => b.ref.toLowerCase()))
    const knownRefs = new Set(data.bookings.map((b) => b.ref.toLowerCase()))
    const payOk = (b: { checkIn: string }, date: string) => (basis === 'stay' ? inRange(b.checkIn) : inRange(date))
    // B2B follows its booking on the stay basis (an entry with no known booking is counted by its own date)
    const b2bOk = (e: { bookingRef?: string; date: string }) => {
      const r = e.bookingRef?.trim().toLowerCase()
      return basis === 'stay' && r && knownRefs.has(r) ? stayRefs.has(r) : inRange(e.date)
    }
    const hasFull = data.bookings.some((b) => isFullProperty(b.villa)) || data.expenses.some((e) => isFullProperty(e.villa))
    const villaList = villa === 'All rooms' ? (hasFull ? [...ROOM_NAMES, FULL_PROPERTY] : ROOM_NAMES) : [villa]

    const byRef = new Map(data.bookings.map((b) => [b.ref.toLowerCase(), b]))
    const unitsCache = new Map<Booking, ReturnType<typeof bookingUnits>>()
    const units = (b: Booking) => {
      let u = unitsCache.get(b)
      if (!u) { u = bookingUnits(b, data); unitsCache.set(b, u) }
      return u
    }
    const linked = (e: Expense) => (e.bookingRef ? byRef.get(e.bookingRef.trim().toLowerCase()) : undefined)

    /**
     * Money of the bookings and expenses that `part` gives a share of: part(b, amount) is the booking's amount that
     * counts here (all of it, a room's share, or 0 = not counted); `expenseOk` picks the expenses by their room.
     */
    const figures = (part: (b: Booking, amount: number) => number, inScopeB: (b: Booking) => boolean, b2bPart: (e: Expense) => number, expenseOk: (e: Expense) => boolean) => {
      let roomCollected = 0
      let extrasCollected = 0
      let refunded = 0
      let contracted = 0
      let bookings = 0
      for (const b of data.bookings) {
        if (!inScopeB(b)) continue
        // All money received counts as revenue: room payments and additional-expense collections (purpose 'extras')
        let room = 0
        let extras = 0
        let back = 0
        for (const p of b.payments) {
          if (!payOk(b, p.date)) continue
          if (p.kind === 'refund') back += p.amount
          else if (p.kind === 'payment') {
            if (p.purpose === 'extras') extras += p.amount
            else room += p.amount
          }
        }
        roomCollected += part(b, room)
        extrasCollected += part(b, extras)
        refunded += part(b, back)
        if (b.status !== 'cancelled' && inRange(b.checkIn)) {
          contracted += part(b, b.total)
          bookings += 1
        }
      }
      let b2b = 0 // paid out by the resort
      let b2bExt = 0 // collected by the partner
      let operating = 0
      for (const e of data.expenses) {
        if (e.category === B2B_CATEGORY) {
          if (!b2bOk(e)) continue
          const amt = b2bPart(e)
          if (e.external) b2bExt += amt
          else b2b += amt
        } else if (expenseOk(e) && inRange(e.date)) operating += e.amount
      }
      const collected = roomCollected + extrasCollected
      const revenue = collected - refunded - b2b
      return { collected, roomCollected, extrasCollected, refunded, b2b, b2bExt, operating, bookings, contracted, revenue, profit: revenue - operating }
    }

    // Per room: a group booking counts in each of its rooms with that room's share of its money (by the nightly
    // rates when booked); a whole-property booking counts under Full Property
    const perVilla = villaList.map((v) => ({
      villa: v,
      ...figures(
        (b, amount) => amountForRoom(amount, units(b), v),
        (b) => units(b).some((u) => u.room === v),
        (e) => { const bk = linked(e); return bk ? amountForRoom(e.amount, units(bk), v) : primaryRoom(e.villa) === v ? e.amount : 0 },
        (e) => primaryRoom(e.villa) === v,
      ),
    }))

    // Expenses with no room (stock purchases, repairs, salaries…) belong to the whole resort: under
    // All rooms they get a row of their own, so the totals and the profit include them.
    const listed = new Set(villaList)
    if (villa === 'All rooms') {
      const general = data.expenses
        .filter((e) => !listed.has(primaryRoom(e.villa)) && e.category !== B2B_CATEGORY && inRange(e.date))
        .reduce((s, e) => s + e.amount, 0)
      if (general > 0) {
        perVilla.push({ villa: GENERAL_ROW, collected: 0, roomCollected: 0, extrasCollected: 0, refunded: 0, b2b: 0, b2bExt: 0, operating: general, bookings: 0, contracted: 0, revenue: 0, profit: -general })
      }
    }

    // Totals: All rooms counts every booking and expense once, in full (as before the split, general expenses
    // included); one room is its row
    const all = villa === 'All rooms'
      ? figures(
        (_b, amount) => amount,
        (b) => listed.has(primaryRoom(b.villa)),
        (e) => (listed.has(primaryRoom(e.villa)) ? e.amount : 0),
        () => true,
      )
      : perVilla[0]
    const { collected, extrasCollected, refunded, b2b, b2bExt, operating } = all
    // Contracted value for All rooms is every booking checking in (rooms from the older list included)
    const contracted = villa === 'All rooms'
      ? data.bookings.filter((b) => b.status !== 'cancelled' && inRange(b.checkIn)).reduce((s, b) => s + b.total, 0)
      : all.contracted
    // Total revenue always includes the B2B amount: what was collected plus what the partner collected externally.
    // Net revenue takes all the B2B off; money the partner kept was never collected, so it isn't taken off twice.
    const totalRevenue = collected - refunded + b2bExt
    const netRevenue = collected - refunded - b2b
    const profit = netRevenue - operating
    // What guests still owe for their rooms (refunds are room money; B2B collected externally is settled).
    // Additional-expense collections pay for extras, not the room, so they don't reduce it.
    const outstanding = contracted - (all.roomCollected - refunded) - b2bExt
    return { perVilla, collected, extrasCollected, refunded, b2b, b2bExt, operating, totalRevenue, netRevenue, profit, contracted, outstanding }
  }, [data, villa, from, to, basis])

  return (
    <>
      <PageTitle title="Financial Overview" subtitle="Revenue, commission, expenses and profit for the period." />

      <div className={`${refCardCls} mb-4 flex flex-wrap items-end gap-4 p-4`}>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">Room</span><select value={villa} onChange={(e) => setVilla(e.target.value)} className={selectCls}><option>All rooms</option>{ROOM_OPTIONS.map((v) => (<option key={v}>{v}</option>))}</select></label>
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-500">Period basis</span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            <button onClick={() => setBasis('stay')} className={`rounded-md px-3 py-1.5 text-sm font-medium ${basis === 'stay' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Stay month</button>
            <button onClick={() => setBasis('cash')} className={`rounded-md px-3 py-1.5 text-sm font-medium ${basis === 'cash' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Cash date</button>
          </div>
        </div>
        <p className="basis-full text-xs text-slate-400">
          {basis === 'stay'
            ? 'Stay month: payments, refunds and B2B commission of bookings whose check-in is in the period. Expenses are counted by their own date.'
            : 'Cash date: payments, refunds and expenses counted by the date they were paid.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Collected" value={formatINR(model.collected)} sub={model.extrasCollected > 0 ? `received from guests · incl. ${formatINR(model.extrasCollected)} additional expenses` : 'received from guests'} tone="green" />
        <Kpi label="Refunded" value={formatINR(model.refunded)} sub="paid back" tone="red" />
        <Kpi label="B2B Commission" value={formatINR(model.b2b + model.b2bExt)} sub={model.b2bExt > 0 ? `${formatINR(model.b2b)} paid out · ${formatINR(model.b2bExt)} collected externally` : 'paid to partners'} tone="orange" />
        <Kpi label="Total Revenue" value={formatINR(model.totalRevenue)} sub="collected − refunds + B2B collected externally (incl. B2B)" tone="green" />
        <Kpi label="Net Revenue" value={formatINR(model.netRevenue)} sub="total revenue − B2B commission" tone="green" />
        <Kpi label="Expenses" value={formatINR(model.operating)} sub="operating (excl. B2B)" tone="orange" />
        <Kpi label="Profit" value={formatINR(model.profit)} sub="net revenue − expenses" tone="green" />
        <Kpi label="Contracted Value" value={formatINR(model.contracted)} sub="booking totals in period" tone="green" />
        <Kpi label="Outstanding" value={formatINR(model.outstanding)} sub="room balance: contracted − room payments + refunds − B2B collected externally" tone="orange" />
      </div>

      <div className={`${refCardCls} mt-4 overflow-hidden`}>
        <h2 className="px-5 py-4 font-display text-[22px] font-semibold text-dark">Per-room breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="border-y border-slate-200 bg-slate-50">
              <tr>
                <th className={thCls}>Room</th>
                <th className={thRightCls}>Revenue</th>
                <th className={thRightCls}>Expenses</th>
                <th className={thRightCls}>Profit</th>
                <th className={thRightCls}>Bookings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {model.perVilla.map((r) => (
                <tr key={r.villa} className="hover:bg-slate-50">
                  <td className="px-5 py-3"><span className="inline-flex items-center gap-2 font-medium text-slate-900">{r.villa !== GENERAL_ROW && <VillaDot villa={r.villa} />}{r.villa}</span></td>
                  <td className="nums px-5 py-3 text-right font-semibold text-emerald-700">{formatINR(r.revenue)}</td>
                  <td className="nums px-5 py-3 text-right text-amber-600">{formatINR(r.operating)}</td>
                  <td className="nums px-5 py-3 text-right font-semibold text-emerald-700">{formatINR(r.profit)}</td>
                  <td className="nums px-5 py-3 text-right text-slate-700">{r.bookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
