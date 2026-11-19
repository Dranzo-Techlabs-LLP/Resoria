import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { useStore } from '../../data/store'
import { formatINR } from '../../lib/format'
import { roomReceived } from '../../lib/booking'
import { fieldCls, labelCls, outlineBtnCls, solidBtnCls } from '../styles'
import type { Booking } from '../../types'

/**
 * Cancel a booking with optional cancellation charges. Whatever room money was
 * received beyond the charges becomes a pending refund (paid later with Refund).
 */
export function CancelBookingModal({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone?: () => void }) {
  const { cancelBooking } = useStore()
  const received = roomReceived(booking)
  const [charge, setCharge] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const amount = Math.max(0, Math.round(Number(charge.replace(/[^\d]/g, '')) || 0))
  const refundable = Math.max(0, received - amount)

  async function submit() {
    if (amount > received) { setError(`Cancellation charges can't be more than the ${formatINR(received)} received.`); return }
    setBusy(true)
    setError('')
    try {
      await cancelBooking(booking.ref, amount)
      onDone?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel the booking.')
      setBusy(false)
    }
  }

  return (
    <Modal title="Cancel booking" subtitle={`${booking.guest} · ${booking.ref}`} onClose={() => { if (!busy) onClose() }}>
      <div className="space-y-4">
        <div className="space-y-2 rounded-xl bg-sand px-4 py-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Booking amount</span><span className="nums font-semibold">{formatINR(booking.total)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Amount received</span><span className="nums font-semibold">{formatINR(received)}</span></div>
        </div>
        {received > 0 ? (
          <>
            <div>
              <label className={labelCls} htmlFor="cancel-charge">Cancellation charges</label>
              <input id="cancel-charge" inputMode="numeric" className={fieldCls} value={charge ? `₹${Number(charge.replace(/[^\d]/g, '') || 0).toLocaleString('en-IN')}` : ''}
                onChange={(e) => setCharge(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-[15px]">
              <span className="font-medium">Refund amount (marked pending)</span>
              <span className="nums font-semibold">{formatINR(refundable)}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">No payment was received, so there is nothing to refund.</p>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2.5 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className={`${outlineBtnCls} flex-1`}>Keep booking</button>
          <button type="button" onClick={submit} disabled={busy} className={`${solidBtnCls} flex-[2] !bg-red-700 hover:!bg-red-800`}>
            {busy ? 'Cancelling…' : 'Cancel booking'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Permanently remove a booking (and its payments, charges and history). */
export function DeleteBookingModal({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone?: () => void }) {
  const { deleteBooking } = useStore()
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    await deleteBooking(booking.ref) // failures show in the page's error banner
    setBusy(false)
    onClose()
    onDone?.()
  }
  return (
    <Modal title="Remove booking?" subtitle={`${booking.guest} · ${booking.ref}`} onClose={() => { if (!busy) onClose() }}>
      <p className="text-sm leading-relaxed text-slate-600">
        This permanently removes the booking with its payments, additional expenses, bills and stay history.
        <span className="font-semibold text-dark"> It cannot be undone.</span> To keep the record, cancel the booking instead.
      </p>
      <div className="mt-6 flex gap-2.5">
        <button type="button" onClick={onClose} disabled={busy} className={`${outlineBtnCls} flex-1`}>Keep it</button>
        <button type="button" onClick={submit} disabled={busy} className={`${solidBtnCls} flex-1 !bg-red-700 hover:!bg-red-800`}>
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </Modal>
  )
}
