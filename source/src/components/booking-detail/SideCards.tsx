import type { ReactNode } from 'react'
import {
  chargesDue, chargesTotal, extrasCollected, payPercent, payState, refundInfo, refundedOf, roomBalance, roomPaid, roomReceived,
} from '../../lib/booking'
import { formatINR } from '../../lib/format'
import { PayProgress } from '../ui/PayProgress'
import { Pill } from '../ui/Pill'
import { bigPrimaryBtnCls, cardTitleCls, refCardCls } from '../styles'
import { advanceReceived } from './helpers'
import { Dash, DetailCard, SumRow } from './parts'
import type { Booking } from '../../types'

/** "Outstanding balance ₹10,000" headline: label left, big serif amount right. */
function Headline({ label, amount, tone }: { label: string; amount: number; tone: 'due' | 'ok' | 'muted' }) {
  const color = tone === 'due' ? 'text-due' : tone === 'ok' ? 'text-ok' : 'text-slate-400'
  return (
    <div className="flex items-end justify-between gap-3">
      <span className={`pb-1.5 text-[15px] ${tone === 'muted' ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
      <span className={`nums font-display text-[40px] font-semibold leading-none ${color}`}>{formatINR(amount)}</span>
    </div>
  )
}

const Divider = () => <div className="border-t border-[#efece4]" />

/** Right column, before check-in and in-house: the room money. */
export function RoomChargesCard({ booking: b, canCollect, onCollect }: { booking: Booking; canCollect: boolean; onCollect: () => void }) {
  const balance = roomBalance(b)
  const paid = roomPaid(b)
  const advance = advanceReceived(b)
  const other = roomReceived(b) - advance
  const refunded = refundedOf(b)
  const partner = b.b2bExternal ?? 0

  if (balance > 0) {
    const state = payState(b)
    return (
      <DetailCard title="Room charges">
        <div className="space-y-3">
          <SumRow label="Original calculated room amount">{b.originalTotal !== undefined ? formatINR(b.originalTotal) : <Dash />}</SumRow>
          <SumRow label="Final booking amount">{formatINR(b.total)}</SumRow>
          <SumRow label="Advance received">{formatINR(advance)}</SumRow>
          {other > 0 && <SumRow label="Other payments received">{formatINR(other)}</SumRow>}
          {refunded > 0 && <SumRow label="Refunded">−{formatINR(refunded)}</SumRow>}
          {partner > 0 && <SumRow label="Collected by B2B partner">{formatINR(partner)}</SumRow>}
        </div>
        <div className="mt-5">
          <Headline label="Outstanding balance" amount={balance} tone="due" />
          <PayProgress percent={payPercent(b)} settled={false} thick className="mt-3" />
          <p className="nums mt-2 text-sm text-slate-600">
            {state === 'Unpaid' ? 'Unpaid' : 'Partially paid'} · {formatINR(b.total - balance)} of {formatINR(b.total)}
          </p>
        </div>
        {canCollect && (
          <button type="button" onClick={onCollect} className={`${bigPrimaryBtnCls} mt-5`}>
            Collect remaining <span className="nums">{formatINR(balance)}</span>
          </button>
        )}
      </DetailCard>
    )
  }

  return (
    <DetailCard title="Room charges">
      <Headline label="Booking balance" amount={0} tone="ok" />
      <PayProgress percent={100} settled thick className="mt-3" />
      <div className="mt-3"><Pill tone="green">{b.total === 0 ? 'Complimentary' : 'Fully paid'}</Pill></div>
      <div className="mt-4 space-y-3">
        <SumRow label="Total room charges">{formatINR(b.total)}</SumRow>
        <SumRow label="Received (incl. advance)">{formatINR(paid)}</SumRow>
        {partner > 0 && <SumRow label="Collected by B2B partner">{formatINR(partner)}</SumRow>}
      </div>
    </DetailCard>
  )
}

/** Right column, in-house: additional expenses due at checkout (inactive until one is added). */
export function OtherExpensesCard({ booking: b, canCollect, onCollect }: { booking: Booking; canCollect: boolean; onCollect: () => void }) {
  const charges = b.charges ?? []
  const due = chargesDue(b)

  if (charges.length === 0) {
    return (
      <section className={`${refCardCls} p-5 sm:p-6`} aria-disabled="true">
        <h2 className={`${cardTitleCls} !text-slate-400`}>Other expenses</h2>
        <div className="mt-4"><Headline label="Due at checkout" amount={0} tone="muted" /></div>
        <p className="mt-2 text-sm text-slate-400">Activates once an expense is added.</p>
        <button type="button" disabled className={`${bigPrimaryBtnCls} mt-4 !bg-[#c9ccc8]`}>Collect</button>
      </section>
    )
  }

  if (due > 0) {
    return (
      <section className="rounded-2xl border border-[#ecd9b4] bg-[#fffaf1] p-5 sm:p-6">
        <h2 className={cardTitleCls}>Other expenses</h2>
        <div className="mt-4"><Headline label="Due at checkout" amount={due} tone="due" /></div>
        <p className="mt-2 text-sm text-due">Kept separate from room charges.</p>
        {canCollect && (
          <button type="button" onClick={onCollect} className={`${bigPrimaryBtnCls} mt-4`}>
            Collect <span className="nums">{formatINR(due)}</span>
          </button>
        )}
      </section>
    )
  }

  return (
    <DetailCard title="Other expenses">
      <Headline label="Collected" amount={chargesTotal(b)} tone="ok" />
      <div className="mt-3"><Pill tone="green">Paid</Pill></div>
      <p className="mt-2 text-sm text-slate-600">All additional expenses are settled. New ones will be due at checkout.</p>
    </DetailCard>
  )
}

/** Right column, completed: Total billed = room + other expenses; Balance = billed − received. */
export function FinalSummaryCard({ booking: b }: { booking: Booking }) {
  const room = b.total
  const other = chargesTotal(b)
  const billed = room + other
  const received = roomPaid(b) + (b.b2bExternal ?? 0) + extrasCollected(b)
  const balance = Math.max(0, billed - received)
  const settled = balance === 0 && roomBalance(b) === 0 && chargesDue(b) === 0
  const percent = billed > 0 ? Math.round((Math.min(received, billed) / billed) * 100) : 100
  return (
    <DetailCard title="Final summary">
      <Headline label="Balance" amount={balance} tone={settled ? 'ok' : 'due'} />
      <PayProgress percent={percent} settled={settled} thick className="mt-3" />
      <div className="mt-3">{settled ? <Pill tone="green">Everything settled</Pill> : <Pill tone="amber">Balance due</Pill>}</div>
      <div className="mt-4 space-y-3">
        <SumRow label="Room charges">{formatINR(room)}</SumRow>
        <SumRow label="Other expenses">{formatINR(other)}</SumRow>
        <Divider />
        {settled && received === billed ? (
          <SumRow label="Total billed and received">{formatINR(billed)}</SumRow>
        ) : (
          <>
            <SumRow label="Total billed">{formatINR(billed)}</SumRow>
            <SumRow label="Total received">{formatINR(received)}</SumRow>
          </>
        )}
      </div>
    </DetailCard>
  )
}

/** Right column, cancelled: refund button + cancellation summary (Final summary once refunded). */
export function CancellationSummaryCard({ booking: b, canRefund, onRefund }: { booking: Booking; canRefund: boolean; onRefund: () => void }) {
  const info = refundInfo(b)
  const done = info.status === 'Completed'
  const statusPill: ReactNode =
    info.status === 'Pending' ? <Pill tone="amber">Pending</Pill>
    : done ? <Pill tone="green">Refunded</Pill>
    : <Pill tone="grey">No refund</Pill>
  return (
    <section className={`${refCardCls} p-5 sm:p-6`}>
      {info.remaining > 0 && canRefund && (
        <button type="button" onClick={onRefund} className={`${bigPrimaryBtnCls} mb-6`}>Refund</button>
      )}
      <h2 className={`${cardTitleCls} mb-4`}>{done ? 'Final summary' : 'Cancellation summary'}</h2>
      <div className="space-y-3">
        <SumRow label="Original booking amount">{formatINR(b.total)}</SumRow>
        <SumRow label="Amount received">{formatINR(info.received)}</SumRow>
        <SumRow label="Cancellation charges" tone="due">{formatINR(info.charge)}</SumRow>
        <SumRow label={done ? 'Total refund amount' : 'Refund amount'}>{formatINR(info.refundable)}</SumRow>
        <SumRow label="Refunded amount" tone={info.refunded > 0 ? 'ok' : 'dark'}>{formatINR(info.refunded)}</SumRow>
        <div className="flex items-center justify-between gap-4 text-[15px]">
          <span className="text-slate-600">Refund status</span>
          {statusPill}
        </div>
      </div>
    </section>
  )
}
