import { useEffect, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { useStore } from '../data/store'
import { RESORT } from '../lib/config'
import {
  chargesDue, chargesTotal, extrasCollected, fmtDateTime, fmtDateTimeShort, fmtStay, isCancelled, isCompleted, nightsOf,
  paymentType, refundInfo, roomBalance, roomLabel, roomPaid, sourceLine,
} from '../lib/booking'
import { TODAY_ISO, fmtDate, formatINR } from '../lib/format'
import { outlineBtnCls, refCardCls, solidBtnCls } from '../components/styles'
import { chargesInOrder, ledgerOrder, receiptsOf } from '../components/booking-detail/helpers'
import type { Booking, BookingCharge, Payment } from '../types'

const enc = encodeURIComponent
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
type ReceiptRow = { p: Payment; no: string }

// ---- Building blocks -------------------------------------------------------

/** One printable sheet. Every sheet after the first starts on a new page. */
function Sheet({ children, first }: { children: ReactNode; first: boolean }) {
  return (
    <article
      className={`${refCardCls} p-6 sm:p-10 print:rounded-none print:border-0 print:p-0 ${first ? '' : 'print:break-before-page'}`}
    >
      {children}
    </article>
  )
}

function ResortHeader({ title, number, date }: { title: string; number: string; date: string }) {
  const contacts = [RESORT.phone, RESORT.email, RESORT.website].filter(Boolean)
  return (
    <header className="flex flex-col gap-5 border-b border-[#e6e1d6] pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <img src={`${import.meta.env.BASE_URL}resoria-logo.png`} alt="" className="h-14 w-14 shrink-0 rounded-full" />
        <div>
          <div className="font-display text-2xl font-semibold text-dark">{RESORT.name}</div>
          <div className="mt-1 text-sm leading-snug text-slate-500">
            {RESORT.address.map((line) => (<div key={line}>{line}</div>))}
            {contacts.length > 0 && <div>{contacts.join(' · ')}</div>}
          </div>
        </div>
      </div>
      <div className="sm:text-right">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ok">{title}</div>
        <div className="nums mt-1 text-lg font-semibold text-dark">{number}</div>
        <div className="nums text-sm text-slate-500">{date}</div>
      </div>
    </header>
  )
}

function Caps({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{children}</div>
}

/** Guest and stay block shared by every bill. */
function GuestStay({ booking: b, guestLabel }: { booking: Booking; guestLabel: string }) {
  const nights = nightsOf(b)
  const adults = b.adults ?? b.guests
  return (
    <div className="grid grid-cols-1 gap-6 py-6 sm:grid-cols-2">
      <div>
        <Caps>{guestLabel}</Caps>
        <div className="mt-1.5 font-semibold text-dark">{b.guest}</div>
        {b.phone && <div className="nums text-sm text-slate-600">{b.phone}</div>}
        {b.place && <div className="text-sm text-slate-600">{b.place}</div>}
      </div>
      <div className="sm:text-right">
        <Caps>Booking {b.ref}</Caps>
        <div className="mt-1.5 text-sm text-dark">{roomLabel(b.villa)}</div>
        <div className="nums text-sm text-slate-600">{fmtStay(b)} · {plural(nights, 'night')}</div>
        <div className="text-sm text-slate-600">{plural(adults, 'adult')}, {plural(b.kids ?? 0, 'kid')}</div>
      </div>
    </div>
  )
}

function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-6 border-b border-[#efece4] py-2.5 text-[15px] last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className="nums text-right font-medium text-dark">{children}</span>
    </div>
  )
}

type TotalRow = { label: string; value: string; strong?: boolean; tone?: string }

function Totals({ rows }: { rows: TotalRow[] }) {
  return (
    <div className="ml-auto mt-4 w-full max-w-xs space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className={`flex justify-between gap-4 text-[15px] ${r.strong ? 'border-t border-[#e6e1d6] pt-2 font-semibold text-dark' : 'text-slate-600'}`}>
          <span>{r.label}</span>
          <span className={`nums ${r.tone ?? ''}`}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

/** A titled part of the combined bill (Advance bill, Remaining bill, …). */
function BillSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 print:break-inside-avoid">
      <h2 className="font-display text-xl font-semibold text-dark">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** The cancellation policy from Configuration → Invoice (nothing when it's blank). */
function PolicyBlock({ text }: { text: string }) {
  if (!text.trim()) return null
  return (
    <div className="mt-6 rounded-2xl border border-[#e6e1d6] px-5 py-4 print:break-inside-avoid">
      <Caps>Cancellation policy</Caps>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{text.trim()}</p>
    </div>
  )
}

const th = 'border-b border-[#e6e1d6] py-2 pr-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 last:pr-0'
const td = 'border-b border-[#efece4] py-2.5 pr-3 text-sm text-dark last:pr-0'

function ChargesTable({ charges, paidBy }: { charges: BookingCharge[]; paidBy?: (c: BookingCharge) => ReactNode }) {
  const total = charges.reduce((s, c) => s + c.total, 0)
  const cols = paidBy ? 7 : 6
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${paidBy ? 'min-w-[620px]' : 'min-w-[520px]'} border-collapse`}>
        <thead>
          <tr>
            <th className={th}>Item</th>
            <th className={th}>Category</th>
            <th className={`${th} !text-right`}>Qty</th>
            <th className={`${th} !text-right`}>Rate</th>
            <th className={th}>Date / Time</th>
            <th className={`${th} !text-right`}>Total</th>
            {paidBy && <th className={`${th} !text-right`}>Paid</th>}
          </tr>
        </thead>
        <tbody>
          {charges.map((c) => (
            <tr key={c.id}>
              <td className={`${td} font-medium`}>{c.item}</td>
              <td className={td}>{c.category}</td>
              <td className={`${td} nums text-right`}>{c.qty}</td>
              <td className={`${td} nums text-right`}>{formatINR(c.rate)}</td>
              <td className={`${td} nums whitespace-nowrap`}>{fmtDateTimeShort(c.at) || '—'}</td>
              <td className={`${td} nums text-right font-medium`}>{formatINR(c.total)}</td>
              {paidBy && <td className={`${td} nums whitespace-nowrap text-right`}>{paidBy(c)}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className="pt-3 pr-3 text-right text-[15px] font-semibold text-dark">Total additional expenses</td>
            <td className="nums pt-3 text-right text-[15px] font-semibold text-dark">{formatINR(total)}</td>
            {cols === 7 && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** Receipts of one kind: receipt no., date, method, reference, amount. */
function ReceiptTable({ rows }: { rows: ReceiptRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr>
            <th className={th}>Receipt</th>
            <th className={th}>Date</th>
            <th className={th}>Method</th>
            <th className={th}>Reference</th>
            <th className={`${th} !text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, no }) => (
            <tr key={p.id}>
              <td className={`${td} nums whitespace-nowrap`}>{no}</td>
              <td className={`${td} nums whitespace-nowrap`}>{fmtDate(p.date)}</td>
              <td className={td}>{p.method || '—'}</td>
              <td className={`${td} break-all`}>{p.reference || '—'}</td>
              <td className={`${td} nums whitespace-nowrap text-right font-medium ${p.kind === 'refund' ? 'text-[#a3261b]' : ''}`}>
                {p.kind === 'refund' ? '−' : ''}{formatINR(p.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Footer({ note }: { note: string }) {
  return (
    <footer className="mt-10 border-t border-[#e6e1d6] pt-4 text-center text-xs leading-relaxed text-slate-500 print:break-inside-avoid">
      <div>{note}</div>
      <div className="mt-1">Thank you for staying with {RESORT.name}. {RESORT.phone && <>Questions? Call or WhatsApp {RESORT.phone}.</>}</div>
    </footer>
  )
}

// ---- Room money as of one payment (Remaining bill) ----------------------------

const isRoom = (p: Payment) => p.purpose !== 'extras'

/**
 * The room balance around one Remaining payment, from the payments recorded before it in ledger order,
 * so a receipt printed again later still shows the balance as it was at that payment.
 */
function roomStatementAt(b: Booking, payment: Payment) {
  const ledger = ledgerOrder(b)
  const idx = ledger.findIndex((x) => x.id === payment.id)
  const before = idx >= 0 ? ledger.slice(0, idx) : ledger.filter((x) => x.id !== payment.id)
  const advance = before.filter((x) => isRoom(x) && x.kind === 'payment' && x.advance).reduce((s, x) => s + x.amount, 0)
  const earlier = before.filter((x) => isRoom(x) && x.kind === 'payment' && !x.advance).reduce((s, x) => s + x.amount, 0)
  const refunded = before.filter((x) => isRoom(x) && x.kind === 'refund').reduce((s, x) => s + x.amount, 0)
  const partner = b.b2bExternal ?? 0
  const balance = Math.max(0, b.total - advance - earlier + refunded - partner - payment.amount)
  return { advance, earlier, refunded, partner, balance }
}

// ---- One payment receipt ----------------------------------------------------

function Receipt({ booking: b, payment: p, no, first, policy }: { booking: Booking; payment: Payment; no: string; first: boolean; policy: string }) {
  const type = paymentType(p)
  const refund = p.kind === 'refund'
  const charges = type === 'Expenses' ? chargesInOrder(b).filter((c) => c.paymentId === p.id) : []
  const info = refund ? refundInfo(b) : null
  const room = type === 'Remaining' ? roomStatementAt(b, p) : null
  return (
    <Sheet first={first}>
      <ResortHeader title={refund ? 'Refund receipt' : `${type === 'Expenses' ? 'Additional expenses' : type} bill`} number={no} date={fmtDate(p.date)} />
      <GuestStay booking={b} guestLabel={refund ? 'Refunded to' : 'Received from'} />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-start">
        <div>
          <KeyValue label="Receipt no.">{no}</KeyValue>
          <KeyValue label="Date">{fmtDate(p.date)}</KeyValue>
          <KeyValue label="Booking">{b.ref}</KeyValue>
          <KeyValue label="Type">{type}{type === 'Expenses' ? ' (additional expenses)' : refund ? '' : ' (room charges)'}</KeyValue>
          <KeyValue label="Payment method">{p.method || '—'}</KeyValue>
          <KeyValue label="Reference">{p.reference || '—'}</KeyValue>
          {p.createdAt && <KeyValue label="Recorded">{fmtDateTime(p.createdAt)}</KeyValue>}
        </div>
        <div className="rounded-2xl bg-sand px-5 py-4 print:border print:border-[#e6e1d6]">
          <Caps>{refund ? 'Amount refunded' : 'Amount received'}</Caps>
          <div className={`nums mt-1 font-display text-[34px] font-semibold leading-tight ${refund ? 'text-[#a3261b]' : 'text-dark'}`}>
            {formatINR(p.amount)}
          </div>
        </div>
      </div>

      {type === 'Advance' && (
        <div className="mt-8 print:break-inside-avoid">
          <Caps>Room charges</Caps>
          <div className="mt-2">
            <KeyValue label="Room amount">{formatINR(b.total)}</KeyValue>
            <KeyValue label="Advance received">{formatINR(p.amount)}</KeyValue>
            <KeyValue label="Balance payable">{formatINR(Math.max(0, b.total - p.amount))}</KeyValue>
          </div>
        </div>
      )}
      {type === 'Advance' && <PolicyBlock text={policy} />}

      {room && (
        <div className="mt-8 print:break-inside-avoid">
          <Caps>Payment summary</Caps>
          <div className="mt-2">
            <KeyValue label="Room amount">{formatINR(b.total)}</KeyValue>
            <KeyValue label="Advance paid">{formatINR(room.advance)}</KeyValue>
            {room.earlier > 0 && <KeyValue label="Earlier payments">{formatINR(room.earlier)}</KeyValue>}
            {room.refunded > 0 && <KeyValue label="Refunded">−{formatINR(room.refunded)}</KeyValue>}
            {room.partner > 0 && <KeyValue label="Collected by booking partner">{formatINR(room.partner)}</KeyValue>}
            <KeyValue label="This payment">{formatINR(p.amount)}</KeyValue>
            <div className="flex justify-between gap-6 pt-2.5 text-[15px] font-semibold text-dark">
              <span>Balance remaining</span>
              <span className={`nums ${room.balance > 0 ? 'text-due' : ''}`}>{formatINR(room.balance)}</span>
            </div>
          </div>
        </div>
      )}

      {info && (
        <div className="mt-8 print:break-inside-avoid">
          <Caps>Cancellation</Caps>
          <div className="mt-2">
            <KeyValue label="Amount received">{formatINR(info.received)}</KeyValue>
            <KeyValue label="Cancellation charges">{formatINR(info.charge)}</KeyValue>
            <KeyValue label="Total refundable">{formatINR(info.refundable)}</KeyValue>
            <KeyValue label="Refunded to date">{formatINR(info.refunded)}</KeyValue>
          </div>
        </div>
      )}

      {type === 'Expenses' && (
        <div className="mt-8">
          <h2 className="font-display text-xl font-semibold text-dark">Additional Expenses Bill</h2>
          <div className="mt-3">
            {charges.length > 0
              ? <ChargesTable charges={charges} />
              : <p className="text-sm text-slate-500">The itemised expenses for this payment aren't available.</p>}
          </div>
        </div>
      )}

      <Footer note="This is a computer-generated receipt and needs no signature." />
    </Sheet>
  )
}

// ---- One bill: advance, remaining and expense bills together -------------------

function OneBill({ booking: b, receipts, policy }: { booking: Booking; receipts: ReceiptRow[]; policy: string }) {
  const cancelled = isCancelled(b)
  const charges = chargesInOrder(b)
  const partner = b.b2bExternal ?? 0
  const title = isCompleted(b) ? 'Final bill' : cancelled ? 'Cancellation statement' : 'Booking bill'
  const nights = nightsOf(b)

  const advances = receipts.filter((r) => paymentType(r.p) === 'Advance')
  const remaining = receipts.filter((r) => paymentType(r.p) === 'Remaining')
  const expenseReceipts = receipts.filter((r) => paymentType(r.p) === 'Expenses')
  const refunds = receipts.filter((r) => r.p.kind === 'refund')
  const noOf = new Map(receipts.map((r) => [r.p.id, r.no]))

  const advancePaid = advances.reduce((s, r) => s + r.p.amount, 0)
  const remainingPaid = remaining.reduce((s, r) => s + r.p.amount, 0)
  const roomRefunded = refunds.filter((r) => isRoom(r.p)).reduce((s, r) => s + r.p.amount, 0)

  let totals: TotalRow[]
  if (cancelled) {
    const info = refundInfo(b)
    totals = [
      { label: 'Original booking amount', value: formatINR(b.total) },
      { label: 'Amount received', value: formatINR(info.received) },
      { label: 'Cancellation charges', value: formatINR(info.charge) },
      { label: 'Total refundable', value: formatINR(info.refundable) },
      { label: 'Refunded', value: formatINR(info.refunded) },
      { label: info.remaining > 0 ? 'Refund pending' : 'Refund status', value: info.remaining > 0 ? formatINR(info.remaining) : info.status === 'Completed' ? 'Refunded' : 'No refund', strong: true },
    ]
  } else {
    const billed = b.total + chargesTotal(b)
    const received = roomPaid(b) + partner + extrasCollected(b)
    totals = [
      { label: 'Room charges', value: formatINR(b.total) },
      { label: 'Other expenses', value: formatINR(chargesTotal(b)) },
      { label: 'Total billed', value: formatINR(billed), strong: true },
      { label: 'Total received', value: formatINR(received) },
      { label: 'Balance due', value: formatINR(Math.max(0, billed - received)), strong: true, tone: billed - received > 0 ? 'text-due' : '' },
    ]
  }

  const showRemaining = remaining.length > 0 || (!cancelled && b.total > 0)
  const due = chargesDue(b)

  return (
    <Sheet first>
      <ResortHeader title={title} number={b.ref} date={`Issued ${fmtDate(TODAY_ISO)}`} />
      <GuestStay booking={b} guestLabel="Billed to" />

      {cancelled && (
        <p className="mb-4 rounded-xl bg-[#fdf0ee] px-4 py-3 text-sm text-slate-700">
          <span className="font-semibold text-[#a3261b]">Booking cancelled</span>
          {b.cancelledAt && <> · {fmtDateTime(b.cancelledAt)}</>}
          {' · '}{(b.cancellationCharge ?? 0) > 0 ? `Cancellation charges ${formatINR(b.cancellationCharge ?? 0)} applied` : 'No cancellation charges'}
        </p>
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Description</th>
            <th className={`${th} !text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>
              Room charges · {roomLabel(b.villa)} · {plural(nights, 'night')}
              <div className="text-xs text-slate-500">{fmtStay(b)} · Source: {sourceLine(b)}{cancelled ? ' · not charged (cancelled)' : ''}</div>
            </td>
            <td className={`${td} nums text-right font-medium ${cancelled ? 'text-slate-400 line-through' : ''}`}>{formatINR(b.total)}</td>
          </tr>
          {charges.length > 0 && (
            <tr>
              <td className={td}>Additional expenses · {plural(charges.length, 'item')} <span className="text-slate-500">(itemised below)</span></td>
              <td className={`${td} nums text-right font-medium`}>{formatINR(chargesTotal(b))}</td>
            </tr>
          )}
        </tbody>
      </table>

      {advances.length > 0 && (
        <BillSection title="Advance bill">
          <ReceiptTable rows={advances} />
          <PolicyBlock text={policy} />
        </BillSection>
      )}

      {showRemaining && (
        <BillSection title="Remaining bill">
          {remaining.length > 0
            ? <ReceiptTable rows={remaining} />
            : <p className="text-sm text-slate-500">No remaining payment received yet.</p>}
          {!cancelled && (
            <Totals rows={[
              { label: 'Room amount', value: formatINR(b.total) },
              { label: 'Advance paid', value: formatINR(advancePaid) },
              { label: 'Remaining paid', value: formatINR(remainingPaid) },
              ...(partner > 0 ? [{ label: 'Collected by booking partner', value: formatINR(partner) }] : []),
              ...(roomRefunded > 0 ? [{ label: 'Refunded', value: `−${formatINR(roomRefunded)}` }] : []),
              { label: 'Room balance', value: formatINR(roomBalance(b)), strong: true, tone: roomBalance(b) > 0 ? 'text-due' : '' },
            ]} />
          )}
        </BillSection>
      )}

      {charges.length > 0 && (
        <BillSection title="Additional expenses bill">
          <ChargesTable
            charges={charges}
            paidBy={(c) => (c.paymentId
              ? <span className="text-slate-600">{noOf.get(c.paymentId) ?? 'Paid'}</span>
              : <span className="text-due">Due at checkout</span>)}
          />
          {expenseReceipts.length > 0 && (
            <div className="mt-4">
              <Caps>Collected</Caps>
              <div className="mt-2"><ReceiptTable rows={expenseReceipts} /></div>
            </div>
          )}
          {due > 0 && !cancelled && (
            <p className="mt-3 text-right text-sm font-medium text-due">{formatINR(due)} due at checkout</p>
          )}
        </BillSection>
      )}

      {refunds.length > 0 && (
        <BillSection title="Refunds">
          <ReceiptTable rows={refunds} />
        </BillSection>
      )}

      <div className="mt-6 print:break-inside-avoid">
        <Totals rows={totals} />
      </div>
      <Footer note="This is a computer-generated bill and needs no signature." />
    </Sheet>
  )
}

// ---- Page --------------------------------------------------------------------

/** Printable bills: one receipt (?payment=<id>), or one bill with the advance, remaining and expense bills together. */
export function BookingBills() {
  const { ref = '' } = useParams<{ ref: string }>()
  const [params] = useSearchParams()
  const paymentId = params.get('payment')
  const { data } = useStore()
  const policy = data.invoice.cancellationPolicy ?? ''
  const booking = data.bookings.find((b) => b.ref === ref) ?? data.bookings.find((b) => b.ref.toLowerCase() === ref.toLowerCase())

  const receipts = booking ? receiptsOf(booking) : []
  const single = paymentId ? receipts.find((r) => r.p.id === paymentId) : undefined

  // The page title is the default file name for "Save as PDF"
  const docTitle = single ? `Receipt ${single.no}` : `Bill ${booking?.ref ?? ref}`
  useEffect(() => {
    const previous = document.title
    document.title = `${docTitle} · ${RESORT.name}`
    return () => { document.title = previous }
  }, [docTitle])

  const backTo = booking ? `/bookings/${enc(booking.ref)}` : '/bookings'
  const toolbar = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link to={backTo} className="text-[15px] text-slate-600 hover:text-dark">← {booking ? 'Back to booking' : 'All bookings'}</Link>
      {booking && (
        <div className="flex flex-wrap gap-2.5">
          {paymentId && receipts.length > 1 && <Link to={`/bookings/${enc(booking.ref)}/bills`} className={outlineBtnCls}>One bill</Link>}
          {(!paymentId || single) && (
            <button type="button" onClick={() => window.print()} className={solidBtnCls}><Printer size={17} /> Print / Save as PDF</button>
          )}
        </div>
      )}
    </div>
  )

  const message = (title: string, text: ReactNode) => (
    <div className="mx-auto max-w-3xl">
      {toolbar}
      <div className={`${refCardCls} px-6 py-14 text-center`}>
        <h1 className="font-display text-2xl font-semibold text-dark">{title}</h1>
        <p className="mt-2 text-[15px] text-slate-600">{text}</p>
      </div>
    </div>
  )

  if (!booking) return message('Booking not found', <>There's no booking <span className="nums font-medium text-dark">{ref}</span>. It may have been removed.</>)
  if (paymentId && !single) return message('Receipt not found', <>This payment is no longer on booking <span className="nums font-medium text-dark">{booking.ref}</span>. Open the booking to see its current bills.</>)

  return (
    <div className="mx-auto max-w-3xl">
      {toolbar}
      <h1 className="sr-only">{docTitle}</h1>
      {single
        ? <Receipt booking={booking} payment={single.p} no={single.no} first policy={policy} />
        : <OneBill booking={booking} receipts={receipts} policy={policy} />}
    </div>
  )
}
