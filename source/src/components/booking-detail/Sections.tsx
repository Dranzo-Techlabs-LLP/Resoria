import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { api, openFile } from '../../lib/api'
import {
  CHECK_IN_TIME, CHECK_OUT_TIME, chargesDue, chargesTotal, fmtDateTime, fmtDateTimeShort, isCancelled, isCompleted,
  isInHouse, nightsOf, paymentType, roomLabel, sourceType,
} from '../../lib/booking'
import { fmtDate, fmtDateShort, formatINR } from '../../lib/format'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { PaymentTypeTag, Pill } from '../ui/Pill'
import { linkCls, refCardCls, solidBtnCls } from '../styles'
import { chargesInOrder, commissionInfo, datePart, receiptsOf, tdCls, thCls, timePart } from './helpers'
import { Dash, DetailCard, Info } from './parts'
import type { Booking, BookingCharge } from '../../types'

const enc = encodeURIComponent

// ---- Status timeline -------------------------------------------------

/** Booked → Check-in → Check-out → Completed; bars filled up to the current stage. */
export function StatusTimeline({ booking: b }: { booking: Booking }) {
  const stage = isCompleted(b) ? 3 : isInHouse(b) ? 1 : 0
  const created = datePart(b.createdAt)
  const steps = [
    { label: 'Booked', sub: created ? fmtDate(created) : '—' },
    {
      label: 'Check-in',
      sub: b.checkedInAt ? fmtDateTimeShort(b.checkedInAt) : stage >= 1 ? fmtDateShort(b.checkIn) : `Scheduled · ${fmtDateShort(b.checkIn)}, ${CHECK_IN_TIME}`,
    },
    {
      label: 'Check-out',
      sub: b.checkedOutAt ? fmtDateTimeShort(b.checkedOutAt) : stage >= 3 ? fmtDateShort(b.checkOut) : `Scheduled · ${fmtDateShort(b.checkOut)}, ${CHECK_OUT_TIME}`,
    },
    {
      label: 'Completed',
      sub: b.completedAt ? fmtDateTimeShort(b.completedAt) : stage >= 3 ? (b.checkedOutAt ? fmtDateTimeShort(b.checkedOutAt) : '—') : 'After checkout',
    },
  ]
  return (
    <div className={`${refCardCls} px-5 py-5 sm:px-6`}>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4" aria-label="Booking status">
        {steps.map((s, i) => (
          <li key={s.label} aria-current={i === stage ? 'step' : undefined}>
            <div className={`h-1.5 rounded-full ${i <= stage ? 'bg-ink' : 'bg-[#e6e1d6]'}`} />
            <div className={`mt-3 text-[15px] font-semibold text-dark ${i === stage ? 'underline underline-offset-2' : ''}`}>{s.label}</div>
            <div className="nums text-sm text-slate-500">{s.sub}</div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---- Cancelled banner ------------------------------------------------

export function CancelledBanner({ booking: b }: { booking: Booking }) {
  const charge = b.cancellationCharge ?? 0
  return (
    <div className="rounded-2xl border border-[#f1cdc8] bg-[#fdf0ee] px-5 py-4 text-[16px] text-slate-700 sm:px-6 sm:text-[17px]">
      <span className="font-semibold text-[#a3261b]">Booking cancelled</span>
      {b.cancelledAt && <> · {fmtDateTime(b.cancelledAt)}</>}
      {' · '}{charge > 0 ? <>Cancellation charges <span className="nums">{formatINR(charge)}</span> applied</> : 'No cancellation charges'}
    </div>
  )
}

// ---- Guest information -------------------------------------------------

function DocumentLinks({ booking: b }: { booking: Booking }) {
  const [error, setError] = useState('')
  const open = (download: boolean) => {
    setError('')
    openFile(api.documentPath(b.ref), download ? b.documentName : undefined)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open the document.'))
  }
  return (
    <>
      <div className="break-all text-sm font-medium text-dark">{b.documentName}</div>
      <div className="mt-1 flex items-center gap-3 text-sm">
        <button type="button" onClick={() => open(false)} className={linkCls}>View</button>
        <button type="button" onClick={() => open(true)} className="inline-flex items-center gap-1 text-slate-600 hover:text-dark" aria-label={`Download ${b.documentName}`}>
          <Download size={14} /> Download
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </>
  )
}

export function GuestInfoCard({ booking: b }: { booking: Booking }) {
  return (
    <DetailCard title="Guest information">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 @lg:grid-cols-4">
        <Info label="Guest name">{b.guest}</Info>
        <Info label="Phone" sub={b.altPhone ? <span className="nums">{b.altPhone}</span> : undefined}>
          {b.phone ? <span className="nums">{b.phone}</span> : <Dash />}
        </Info>
        <Info label="Place">{b.place || <Dash />}</Info>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Attached document</div>
          <div className="mt-1.5">{b.documentName ? <DocumentLinks booking={b} /> : <span className="text-[17px]"><Dash /></span>}</div>
        </div>
      </div>
    </DetailCard>
  )
}

// ---- Stay details ------------------------------------------------------

function SourceInfo({ booking: b }: { booking: Booking }) {
  const { data } = useStore()
  const { user } = useAuth()
  const type = sourceType(b)
  const detail = (b.sourceDetail || '').trim()
  if (type === 'Direct') return <Info label="Booking source" sub="Direct booking" className="col-span-2">Direct</Info>
  if (type === 'OTA') return <Info label="Booking source" sub={detail || '—'} className="col-span-2">OTA</Info>
  if (type === 'B2B') {
    const c = commissionInfo(data, b)
    const canPay = !!c && c.amount > c.paid && !isCancelled(b) && can(user, 'edit_expenses')
    return (
      <Info
        label="Booking source"
        className="col-span-2"
        sub={
          <>
            <span className="block">{detail || '—'}</span>
            {c && (
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <span>Commission <span className="nums font-medium text-dark">{formatINR(c.amount)}</span></span>
                <Pill tone={c.state === 'Paid' ? 'green' : 'amber'}>{c.state}</Pill>
                {canPay && (
                  <Link to={`/expenses?add=b2b&ref=${enc(b.ref)}`} className={linkCls}>Pay commission</Link>
                )}
              </span>
            )}
          </>
        }
      >
        B2B
      </Info>
    )
  }
  if (type === 'Referral') {
    return (
      <Info
        label="Booking source"
        className="col-span-2"
        sub={
          <>
            <span className="block">Referred by {detail || '—'}</span>
            <span className="nums mt-0.5 block">
              Original room amount {b.originalTotal !== undefined ? formatINR(b.originalTotal) : '—'} · Final amount <span className="font-medium text-dark">{formatINR(b.total)}</span>
            </span>
          </>
        }
      >
        Management Referral
      </Info>
    )
  }
  return <Info label="Booking source" className="col-span-2">{b.source || <Dash />}</Info>
}

export function StayDetailsCard({ booking: b }: { booking: Booking }) {
  // Booked dates; the time is the actual one when the guest arrived / left on that day,
  // otherwise the scheduled time plus the actual date and time (early / late check-in or check-out)
  const when = (booked: string, actual: string | undefined, scheduled: string) => {
    if (!actual) return scheduled
    return datePart(actual) === booked ? timePart(actual) : `${scheduled} · actual ${fmtDateShort(datePart(actual))}, ${timePart(actual)}`
  }
  const inDate = b.checkIn
  const outDate = b.checkOut
  const nights = nightsOf(b)
  return (
    <DetailCard title="Stay details">
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 @lg:grid-cols-4">
        <Info label="Room">{roomLabel(b.villa) || <Dash />}</Info>
        <Info label="Check-in" sub={when(inDate, b.checkedInAt, CHECK_IN_TIME)}><span className="nums">{fmtDateShort(inDate)}</span></Info>
        <Info label="Check-out" sub={when(outDate, b.checkedOutAt, CHECK_OUT_TIME)}><span className="nums">{fmtDateShort(outDate)}</span></Info>
        <Info label="Nights"><span className="nums">{nights}</span></Info>
        <Info label="Adults"><span className="nums">{b.adults ?? b.guests}</span></Info>
        <Info label="Kids"><span className="nums">{b.kids ?? 0}</span></Info>
        <SourceInfo booking={b} />
      </div>
    </DetailCard>
  )
}

// ---- Other / additional expenses ---------------------------------------

/** Before check-in: expenses can't be added yet. */
export function OtherExpensesNotice() {
  return (
    <section className="rounded-2xl border border-dashed border-[#d6d0c2] p-5 sm:p-6">
      <h2 className="font-display text-[22px] font-semibold text-slate-500">Other expenses</h2>
      <p className="mt-2 text-[15px] text-slate-600">Additional expenses can be added after guest check-in.</p>
    </section>
  )
}

export function AdditionalExpensesCard({
  booking: b, editable, onAdd, onEdit, onRemove,
}: {
  booking: Booking
  editable: boolean // in-house and allowed to edit
  onAdd: () => void
  onEdit: (c: BookingCharge) => void
  onRemove: (c: BookingCharge) => void
}) {
  const charges = chargesInOrder(b)
  const total = chargesTotal(b)
  const due = chargesDue(b)
  const allPaid = charges.length > 0 && due === 0
  const statusPill = due > 0
    ? <Pill tone="amber">{due < total ? `${formatINR(due)} due at checkout` : 'Due at checkout'}</Pill>
    : allPaid ? <Pill tone="green">Paid</Pill> : null
  const cols = editable ? 7 : 6
  return (
    <DetailCard
      flush
      title="Additional expenses"
      action={editable
        ? <button type="button" onClick={onAdd} className={`${solidBtnCls} !h-10 !px-4 !text-sm`}>+ Add expense</button>
        : allPaid ? <Pill tone="green">Paid</Pill> : null}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className={thCls}>Item</th>
              <th className={thCls}>Category</th>
              <th className={`${thCls} !text-right`}>Qty</th>
              <th className={`${thCls} !text-right`}>Rate</th>
              <th className={thCls}>Date / Time</th>
              <th className={`${thCls} !text-right`}>Total</th>
              {editable && <th className={thCls}><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {charges.map((c) => (
              <tr key={c.id} className="border-t border-[#efece4]">
                <td className={`${tdCls} font-semibold`}>{c.item}</td>
                <td className={tdCls}>{c.category}</td>
                <td className={`${tdCls} nums text-right`}>{c.qty}</td>
                <td className={`${tdCls} nums text-right`}>{formatINR(c.rate)}</td>
                <td className={`${tdCls} nums whitespace-nowrap text-slate-600`}>{fmtDateTimeShort(c.at) || '—'}</td>
                <td className={`${tdCls} nums text-right font-semibold`}>{formatINR(c.total)}</td>
                {editable && (
                  <td className={`${tdCls} whitespace-nowrap text-right text-sm`}>
                    {c.paymentId ? <span className="text-ok">Paid</span> : (
                      <>
                        <button type="button" onClick={() => onEdit(c)} className={linkCls} aria-label={`Edit ${c.item}`}>Edit</button>
                        <span className="px-1 text-slate-400">·</span>
                        <button type="button" onClick={() => onRemove(c)} className="font-medium text-red-700 underline underline-offset-2 hover:text-red-800" aria-label={`Remove ${c.item}`}>Remove</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {charges.length === 0 && (
              <tr className="border-t border-[#efece4]">
                <td colSpan={cols} className="px-6 py-8 text-center text-[15px] text-slate-500">No additional expenses added yet.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#efece4] bg-canvas">
              <td colSpan={5} className={`${tdCls} text-right`}>
                <span className="inline-flex flex-wrap items-center justify-end gap-2 font-semibold">Total additional expenses {statusPill}</span>
              </td>
              <td className={`${tdCls} nums text-right text-[17px] font-semibold`}>{formatINR(total)}</td>
              {editable && <td className={tdCls} />}
            </tr>
          </tfoot>
        </table>
      </div>
    </DetailCard>
  )
}

// ---- Notes ---------------------------------------------------------------

export function NotesCard({ notes }: { notes: string }) {
  return (
    <DetailCard title="Booking notes">
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{notes}</p>
    </DetailCard>
  )
}

// ---- Bills & payment ledger -------------------------------------------------

export function LedgerCard({ booking: b, showDownloadAll, showDue }: { booking: Booking; showDownloadAll: boolean; showDue: boolean }) {
  const rows = receiptsOf(b)
  const due = chargesDue(b)
  const billsTo = `/bookings/${enc(b.ref)}/bills`
  return (
    <DetailCard
      flush
      title="Bills & payment ledger"
      action={showDownloadAll ? <Link to={billsTo} className={`${linkCls} text-sm`}>Download all bills</Link> : undefined}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className={thCls}>Date</th>
              <th className={thCls}>Type</th>
              <th className={thCls}>Method</th>
              <th className={`${thCls} !text-right`}>Amount</th>
              <th className={`${thCls} !text-right`}>Bill / Receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, no }) => {
              const refund = p.kind === 'refund'
              return (
                <tr key={p.id} className="border-t border-[#efece4]">
                  <td className={`${tdCls} nums whitespace-nowrap`}>{fmtDate(p.date)}</td>
                  <td className={tdCls}><PaymentTypeTag type={paymentType(p)} /></td>
                  <td className={tdCls}>{p.method || '—'}</td>
                  <td className={`${tdCls} nums whitespace-nowrap text-right font-semibold ${refund ? 'text-[#a3261b]' : 'text-ok'}`}>
                    {refund ? '−' : '+'}{formatINR(p.amount)}
                  </td>
                  <td className={`${tdCls} text-right`}>
                    <Link to={`${billsTo}?payment=${enc(p.id)}`} className={`${linkCls} whitespace-nowrap text-sm`} aria-label={`Download bill ${no}`}>Download Bill</Link>
                    <div className="nums mt-0.5 whitespace-nowrap text-xs text-slate-500">{no}</div>
                  </td>
                </tr>
              )
            })}
            {showDue && due > 0 && (
              <tr className="border-t border-[#efece4]">
                <td className={`${tdCls} whitespace-nowrap`}>Due at checkout</td>
                <td className={tdCls}><PaymentTypeTag type="Expenses" /></td>
                <td className={`${tdCls} text-slate-400`}>—</td>
                <td className={`${tdCls} nums text-right font-semibold text-due`}>{formatINR(due)}</td>
                <td className={`${tdCls} whitespace-nowrap text-right text-sm text-due`}>Pending · no bill yet</td>
              </tr>
            )}
            {rows.length === 0 && !(showDue && due > 0) && (
              <tr className="border-t border-[#efece4]">
                <td colSpan={5} className="px-6 py-8 text-center text-[15px] text-slate-500">No payments recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DetailCard>
  )
}

// ---- Stay history -----------------------------------------------------------

export function StayHistoryCard({ booking: b }: { booking: Booking }) {
  const events = (b.events ?? []).map((e, i) => ({ e, i })).sort((x, y) => (x.e.at || '').localeCompare(y.e.at || '') || x.i - y.i).map((x) => x.e)
  return (
    <DetailCard title="Stay history">
      {events.length === 0 ? (
        <p className="text-[15px] text-slate-500">No activity recorded yet.</p>
      ) : (
        <ol className="divide-y divide-[#efece4]">
          {events.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <span className="text-[15px] text-dark">{e.text}</span>
              <span className="nums shrink-0 text-sm text-slate-500 sm:text-[15px]">{fmtDateTime(e.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </DetailCard>
  )
}
