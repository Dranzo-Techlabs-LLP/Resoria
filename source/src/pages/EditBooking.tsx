import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { isCancelled, isCompleted, statusLabel } from '../lib/booking'
import { PageTitle } from '../components/ui/PageTitle'
import { StatusTag } from '../components/ui/Pill'
import { useToast } from '../components/ui/Toast'
import { refCardCls } from '../components/styles'
import { BookingForm } from '../components/booking/BookingForm'

/** Edit booking. Completed and cancelled bookings are read-only (back to their details page). */
export function EditBooking() {
  const { ref = '' } = useParams<{ ref: string }>()
  const navigate = useNavigate()
  const { data, updateBooking } = useStore()
  const toast = useToast()
  const booking = data.bookings.find((b) => b.ref === ref)

  if (!booking) {
    return (
      <>
        <PageTitle back={{ to: '/bookings', label: 'Back to bookings' }} title="Edit booking" />
        <div className={`${refCardCls} px-6 py-14 text-center text-[15px] text-slate-500`}>Booking not found.</div>
      </>
    )
  }
  const detailsTo = `/bookings/${encodeURIComponent(booking.ref)}`
  if (isCompleted(booking) || isCancelled(booking)) return <Navigate to={detailsTo} replace />

  return (
    <>
      <PageTitle
        back={{ to: detailsTo, label: 'Back to booking' }}
        title="Edit booking"
        subtitle={`${booking.guest} · ${booking.ref}`}
        tag={<StatusTag label={statusLabel(booking)} />}
      />
      <BookingForm
        key={booking.ref}
        booking={booking}
        submitLabel="Save changes"
        busyLabel="Saving…"
        onSubmit={async (input) => {
          await updateBooking(booking.ref, input)
          toast.show('Booking updated', `${input.guest} · ${booking.ref}`)
          navigate(detailsTo)
        }}
      />
    </>
  )
}
