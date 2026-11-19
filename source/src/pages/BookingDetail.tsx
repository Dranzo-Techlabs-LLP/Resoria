import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { can, useAuth } from '../auth/AuthContext'
import { useStore } from '../data/store'
import {
  chargesDue, fmtDateTime, fmtDateTimeShort, isCancelled, isCompleted, isInHouse, isPreArrival, refundInfo, roomBalance,
  roomLabel, sourceLine, statusLabel,
} from '../lib/booking'
import { fmtDate, formatINR } from '../lib/format'
import { PageTitle } from '../components/ui/PageTitle'
import { Pill, StatusTag } from '../components/ui/Pill'
import { useToast } from '../components/ui/Toast'
import { CancelBookingModal, DeleteBookingModal } from '../components/booking/BookingModals'
import { outlineBtnCls, outlineDangerBtnCls, refCardCls, solidBtnCls } from '../components/styles'
import { datePart } from '../components/booking-detail/helpers'
import {
  AdditionalExpensesCard, CancelledBanner, GuestInfoCard, LedgerCard, NotesCard, OtherExpensesNotice, StatusTimeline,
  StayDetailsCard, StayHistoryCard,
} from '../components/booking-detail/Sections'
import {
  CancellationSummaryCard, FinalSummaryCard, OtherExpensesCard, RoomChargesCard,
} from '../components/booking-detail/SideCards'
import {
  CollectExpensesModal, CollectRemainingModal, ConfirmModal, RefundModal,
} from '../components/booking-detail/PaymentModals'
import { ExpenseModal } from '../components/booking-detail/ExpenseModal'
import { GuestRatingCard } from '../components/booking-detail/GuestRatingCard'
import { ShareMenu } from '../components/booking-detail/ShareMenu'
import type { Booking, BookingCharge } from '../types'

type Popup =
  | { kind: 'collect' | 'refund' | 'collectExpenses' | 'checkIn' | 'checkOut' | 'cancel' | 'delete' }
  | { kind: 'expense'; charge?: BookingCharge }
  | { kind: 'removeCharge'; charge: BookingCharge }

const enc = encodeURIComponent

function NotFound({ refText }: { refText?: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/bookings" className="mb-4 inline-block text-[15px] text-slate-600 hover:text-dark">← All bookings</Link>
      <div className={`${refCardCls} px-6 py-14 text-center`}>
        <h1 className="font-display text-2xl font-semibold text-dark">Booking not found</h1>
        <p className="mt-2 text-[15px] text-slate-600">
          There's no booking {refText ? <span className="nums font-medium text-dark">{refText}</span> : 'with this reference'}. It may have been removed.
        </p>
        <Link to="/bookings" className={`${outlineBtnCls} mt-6`}>Back to all bookings</Link>
      </div>
    </div>
  )
}

/** "RE-00004 · Booked 4 Nov 2026 · Source: B2B · Nova Travels" (varies with the stay stage). */
function subtitleOf(b: Booking): string {
  const created = datePart(b.createdAt)
  const booked = created ? `Booked ${fmtDate(created)}` : ''
  const parts: string[] = [b.ref]
  if (isCancelled(b)) {
    parts.push(booked, b.cancelledAt ? `Cancelled ${fmtDateTime(b.cancelledAt)}` : '')
  } else if (isCompleted(b) && (b.checkedInAt || b.checkedOutAt)) {
    parts.push(
      b.checkedInAt ? `Checked in ${fmtDateTimeShort(b.checkedInAt)}` : '',
      b.checkedOutAt ? `Checked out ${fmtDateTimeShort(b.checkedOutAt)}` : '',
    )
  } else if ((isInHouse(b) || isCompleted(b)) && b.checkedInAt) {
    parts.push(`Checked in ${fmtDateTime(b.checkedInAt)}`)
  } else {
    parts.push(booked)
  }
  parts.push(`Source: ${sourceLine(b) || '—'}`)
  return parts.filter(Boolean).join(' · ')
}

export function BookingDetail() {
  const { ref } = useParams<{ ref: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, checkIn, checkOut, deleteCharge } = useStore()
  const toast = useToast()
  const [popup, setPopup] = useState<Popup | null>(null)
  const close = () => setPopup(null)

  const booking = data.bookings.find((b) => b.ref === ref) ?? data.bookings.find((b) => b.ref.toLowerCase() === (ref ?? '').toLowerCase())
  if (!booking) return <NotFound refText={ref} />
  const b = booking

  const canEdit = can(user, 'edit_bookings')
  const canCancel = can(user, 'cancel_bookings')
  const canRecord = can(user, 'record_payments')

  const pre = isPreArrival(b)
  const inHouse = isInHouse(b)
  const done = isCompleted(b)
  const cancelled = isCancelled(b)
  const balance = roomBalance(b)
  const due = chargesDue(b)
  const refund = refundInfo(b)
  const label = statusLabel(b)
  const billsTo = `/bookings/${enc(b.ref)}/bills`
  const guestRef = `${b.guest} · ${b.ref}`
  const showExpenses = inHouse || done || (b.charges ?? []).length > 0

  // ---- Header actions (by stage and rights) ----
  let actions: ReactNode = null
  let note: ReactNode = null
  if (pre) {
    actions = (
      <>
        {canEdit && <Link to={`/bookings/${enc(b.ref)}/edit`} className={outlineBtnCls}>Edit</Link>}
        {canCancel && <button type="button" onClick={() => setPopup({ kind: 'cancel' })} className={outlineDangerBtnCls}>Cancel</button>}
        {canCancel && <button type="button" onClick={() => setPopup({ kind: 'delete' })} className={outlineDangerBtnCls}>Delete</button>}
        {canEdit && (
          <button type="button" onClick={() => setPopup({ kind: 'checkIn' })} disabled={balance > 0} className={solidBtnCls}
            title={balance > 0 ? 'Check-in unlocks once the full booking amount is received' : undefined}>
            Check-in
          </button>
        )}
      </>
    )
    if (canEdit) {
      note = balance > 0
        ? <span className="text-due">Check-in unlocks when the <span className="nums">{formatINR(balance)}</span> balance is received</span>
        : <span className="text-ok">Fully paid · ready for check-in</span>
    }
  } else if (inHouse) {
    const blocked = due > 0 || balance > 0
    actions = (
      <>
        {canEdit && <Link to={`/bookings/${enc(b.ref)}/edit`} className={outlineBtnCls}>Edit</Link>}
        {canEdit && (
          <button type="button" onClick={() => setPopup({ kind: 'checkOut' })} disabled={blocked} className={solidBtnCls}>Check-out</button>
        )}
      </>
    )
    if (canEdit) {
      const owed = [
        balance > 0 ? `${formatINR(balance)} room balance` : '',
        due > 0 ? `${formatINR(due)} other expenses` : '',
      ].filter(Boolean).join(' and ')
      note = blocked
        ? <span className="nums text-due">Collect {owed} to enable check-out</span>
        : <span className="text-ok">No outstanding payments · ready for check-out</span>
    }
  } else if (done) {
    actions = <Link to={billsTo} className={solidBtnCls}>Download all bills</Link>
  } else if (cancelled) {
    if (refund.remaining > 0) {
      if (canRecord) actions = <button type="button" onClick={() => setPopup({ kind: 'refund' })} className={solidBtnCls}>Refund</button>
      note = <span className="nums text-due">Refund of {formatINR(refund.remaining)} is pending</span>
    } else if (b.payments.length > 0) {
      actions = <Link to={billsTo} className={solidBtnCls}>Download all bills</Link>
    }
  }

  // Share (WhatsApp / copy) comes first, for every stage except cancelled
  const share = cancelled ? null : <ShareMenu booking={b} />
  const headerActions = share || actions ? <>{share}{actions}</> : null

  const tag = pre && balance === 0 && b.total > 0
    ? <Pill tone="green">{label} · Fully paid</Pill>
    : <StatusTag label={label} />

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        back={{ to: '/bookings', label: 'All bookings' }}
        title={b.guest}
        tag={tag}
        subtitle={<span className="nums">{subtitleOf(b)}</span>}
        actions={headerActions}
        actionsNote={note}
      />

      <div className="space-y-5">
        {cancelled ? <CancelledBanner booking={b} /> : <StatusTimeline booking={b} />}

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          {/* Right column first on small screens so the money and its actions sit near the top */}
          <aside className="space-y-5 xl:order-2">
            {(pre || inHouse) && (
              <RoomChargesCard booking={b} canCollect={canRecord} onCollect={() => setPopup({ kind: 'collect' })} />
            )}
            {inHouse && (
              <OtherExpensesCard booking={b} canCollect={canRecord} onCollect={() => setPopup({ kind: 'collectExpenses' })} />
            )}
            {done && <FinalSummaryCard booking={b} />}
            {cancelled && (
              <CancellationSummaryCard booking={b} canRefund={canRecord} onRefund={() => setPopup({ kind: 'refund' })} />
            )}
          </aside>

          <div className="min-w-0 space-y-5 xl:order-1">
            <GuestInfoCard booking={b} />
            <StayDetailsCard booking={b} />
            {pre && <OtherExpensesNotice />}
            {showExpenses && (
              <AdditionalExpensesCard
                booking={b}
                editable={inHouse && canEdit}
                onAdd={() => setPopup({ kind: 'expense' })}
                onEdit={(charge) => setPopup({ kind: 'expense', charge })}
                onRemove={(charge) => setPopup({ kind: 'removeCharge', charge })}
              />
            )}
            {b.notes?.trim() && <NotesCard notes={b.notes.trim()} />}
            <LedgerCard
              booking={b}
              showDownloadAll={(done || (cancelled && refund.status !== 'Pending')) && b.payments.length > 0}
              showDue={!cancelled}
            />
            {(inHouse || done) && can(user, 'view_ratings') && <GuestRatingCard booking={b} />}
            <StayHistoryCard booking={b} />
          </div>
        </div>
      </div>

      {popup?.kind === 'collect' && <CollectRemainingModal booking={b} onClose={close} />}
      {popup?.kind === 'refund' && <RefundModal booking={b} onClose={close} />}
      {popup?.kind === 'collectExpenses' && <CollectExpensesModal booking={b} onClose={close} />}
      {popup?.kind === 'expense' && <ExpenseModal booking={b} charge={popup.charge} onClose={close} />}
      {popup?.kind === 'cancel' && (
        <CancelBookingModal booking={b} onClose={close} onDone={() => toast.show('Booking cancelled', guestRef)} />
      )}
      {popup?.kind === 'delete' && (
        <DeleteBookingModal booking={b} onClose={close} onDone={() => navigate('/bookings')} />
      )}
      {popup?.kind === 'checkIn' && (
        <ConfirmModal
          title="Check in guest"
          subtitle={guestRef}
          confirmLabel="Check-in"
          busyLabel="Checking in…"
          onClose={close}
          onConfirm={async () => {
            await checkIn(b.ref)
            toast.show('Guest checked in', `${guestRef} · ${roomLabel(b.villa)}`)
          }}
        >
          Check <span className="font-semibold text-dark">{b.guest}</span> in to <span className="font-semibold text-dark">{roomLabel(b.villa)}</span> now?
          The booking moves to In-house and additional expenses can be added during the stay.
        </ConfirmModal>
      )}
      {popup?.kind === 'checkOut' && (
        <ConfirmModal
          title="Check out guest"
          subtitle={guestRef}
          confirmLabel="Check-out"
          busyLabel="Checking out…"
          onClose={close}
          onConfirm={async () => {
            await checkOut(b.ref)
            toast.show('Guest checked out', `${guestRef} · booking completed`)
          }}
        >
          Check <span className="font-semibold text-dark">{b.guest}</span> out of <span className="font-semibold text-dark">{roomLabel(b.villa)}</span> now?
          The booking will be marked Completed and becomes read-only.
        </ConfirmModal>
      )}
      {popup?.kind === 'removeCharge' && (
        <ConfirmModal
          title="Remove expense?"
          subtitle={guestRef}
          confirmLabel="Remove"
          busyLabel="Removing…"
          danger
          onClose={close}
          onConfirm={async () => {
            await deleteCharge(popup.charge.id)
            toast.show('Expense removed', `${popup.charge.item} · ${formatINR(popup.charge.total)}`)
          }}
        >
          Remove <span className="font-semibold text-dark">{popup.charge.item}</span>
          {popup.charge.qty > 1 && <> × {popup.charge.qty}</>} (<span className="nums">{formatINR(popup.charge.total)}</span>) from this booking?
          The removal is recorded in the stay history.
        </ConfirmModal>
      )}
    </div>
  )
}
