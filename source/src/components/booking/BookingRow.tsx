// One row of the Bookings table (change sheet 3.0 rows 30–35).
import { Link, useNavigate } from 'react-router-dom'
import {
  chargesDue, chargesTotal, extrasCollected, fmtStay, isCancelled, isCompleted, isInHouse, isPreArrival, nightsOf,
  payPercent, payState, refundInfo, roomBalance, roomPaid, sourceLabel,
} from '../../lib/booking'
import { TODAY_ISO, fmtDateShort, formatINR } from '../../lib/format'
import { KebabMenu, type KebabItem } from '../ui/KebabMenu'
import { PayProgress } from '../ui/PayProgress'
import { Pill } from '../ui/Pill'
import type { Booking } from '../../types'

const tdCls = 'px-5 py-3.5 align-middle'
const subCls = 'nums mt-0.5 text-[13px] text-slate-500'
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function BookingRow({ booking: b, canEdit, canCancel, onCancel, onRemove }: {
  booking: Booking
  canEdit: boolean
  canCancel: boolean
  onCancel: (b: Booking) => void
  onRemove: (b: Booking) => void
}) {
  const navigate = useNavigate()
  const to = `/bookings/${encodeURIComponent(b.ref)}`
  const src = sourceLabel(b)
  const nights = nightsOf(b)
  const overdue = isPreArrival(b) && b.checkIn < TODAY_ISO

  // Completed: read-only. In-house: no cancel / remove. Cancelled: remove only.
  let items: KebabItem[]
  if (isCompleted(b)) {
    items = [
      { label: 'View booking', onClick: () => navigate(to) },
      { label: 'Bills & receipts', onClick: () => navigate(`${to}/bills`) },
    ]
  } else if (isCancelled(b)) {
    items = [{ label: 'Remove', danger: true, hidden: !canCancel, onClick: () => onRemove(b) }]
  } else {
    items = [
      // In-house: manage the stay (food orders, hall, services) straight from the list
      { label: 'Add expense', hidden: !canEdit || !isInHouse(b), onClick: () => navigate(`${to}?add=expense`) },
      { label: 'Collect / check-out', hidden: !isInHouse(b), onClick: () => navigate(to) },
      { label: 'Edit', hidden: !canEdit, onClick: () => navigate(`${to}/edit`) },
      { label: 'Cancel', hidden: !canCancel || isInHouse(b), onClick: () => onCancel(b) },
      { label: 'Remove', danger: true, hidden: !canCancel || isInHouse(b), onClick: () => onRemove(b) },
    ]
  }

  return (
    <tr onClick={() => navigate(to)} className="cursor-pointer border-t border-[#efece4] transition-colors hover:bg-[#faf8f3]">
      <td className={tdCls}>
        <Link to={to} onClick={(e) => e.stopPropagation()} className="font-semibold text-dark hover:underline">{b.guest}</Link>
        <div className={subCls}>{b.phone} · {b.ref}</div>
      </td>
      <td className={tdCls}>
        <div className="font-semibold text-dark">{b.villa}</div>
        <div className={subCls}>{plural(b.guests, 'guest', 'guests')}</div>
      </td>
      <td className={`${tdCls} whitespace-nowrap`}>
        <div className="nums text-dark" title={fmtStay(b)}>{fmtDateShort(b.checkIn)} → {fmtDateShort(b.checkOut)}</div>
        <div className={subCls}>{plural(nights, 'night', 'nights')}</div>
        {overdue && <div className="mt-0.5 text-[13px] font-medium text-due">Arrival overdue</div>}
      </td>
      <td className={tdCls}>
        <div className="font-semibold text-dark">{src.name}</div>
        {src.kind && <div className="text-[13px] text-slate-500">{src.kind}</div>}
      </td>
      <td className={tdCls}><PaymentCell b={b} /></td>
      <td className={`${tdCls} text-right`} onClick={(e) => e.stopPropagation()}>
        <KebabMenu items={items} label={`Actions for ${b.guest} (${b.ref})`} />
      </td>
    </tr>
  )
}

/** Payment column: room payment progress; billed total for completed stays; refund state for cancellations. */
function PaymentCell({ b }: { b: Booking }) {
  if (isCancelled(b)) {
    const r = refundInfo(b)
    return (
      <div className="w-[270px]">
        <div className="flex items-start justify-between gap-3">
          <span className="nums font-semibold text-dark">Received {formatINR(r.received)}</span>
          {r.status === 'Pending' ? <Pill tone="amber">Refund pending</Pill> : r.status === 'Completed' ? <Pill tone="green">Refunded</Pill> : <Pill tone="grey">No refund</Pill>}
        </div>
        {r.received > 0 ? (
          <div className="nums mt-1 space-y-0.5 text-[13px] text-slate-600">
            <div>Cancellation charges {formatINR(r.charge)}</div>
            <div>Refund amount (eligible) {formatINR(r.refundable)}</div>
            <div className="font-medium text-ok">Refunded {formatINR(r.refunded)}</div>
          </div>
        ) : (
          <div className="mt-1 text-[13px] text-slate-500">No payment was received</div>
        )}
      </div>
    )
  }

  if (isCompleted(b)) {
    const other = chargesTotal(b)
    const billed = b.total + other
    const balance = roomBalance(b) + chargesDue(b)
    const received = roomPaid(b) + extrasCollected(b)
    return (
      <div className="w-[270px]">
        <div className="flex items-center justify-between gap-3">
          <span className="nums font-semibold text-dark">Billed {formatINR(billed)}</span>
          <Pill tone={balance > 0 ? 'amber' : 'green'}>Balance {formatINR(balance)}</Pill>
        </div>
        <PayProgress percent={billed > 0 ? ((billed - balance) / billed) * 100 : 100} settled={balance <= 0} className="mt-2" />
        <div className="nums mt-1.5 text-[13px] text-slate-500">
          Received {formatINR(received)} · Room {formatINR(b.total)} + Other {formatINR(other)}
        </div>
      </div>
    )
  }

  const state = payState(b)
  const balance = roomBalance(b)
  const extras = isInHouse(b) ? chargesDue(b) : 0
  return (
    <div className="w-[270px]">
      <div className="flex items-center justify-between gap-3">
        <span className="nums font-semibold text-dark">{formatINR(Math.max(0, b.total - balance))} of {formatINR(b.total)}</span>
        {state === 'Settled'
          ? <Pill tone="green">Settled</Pill>
          : <Pill tone="amber">{state === 'Unpaid' ? 'Unpaid' : `${formatINR(balance)} due`}</Pill>}
      </div>
      <PayProgress percent={payPercent(b)} settled={state === 'Settled'} className="mt-2" />
      {extras > 0 && <div className="nums mt-1.5 text-[13px] font-medium text-due">Additional expenses due {formatINR(extras)}</div>}
    </div>
  )
}
