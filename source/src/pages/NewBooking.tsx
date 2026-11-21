import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { fmtStay } from '../lib/booking'
import { ROOM_NAMES } from '../lib/config'
import { PageTitle } from '../components/ui/PageTitle'
import { useToast } from '../components/ui/Toast'
import { BookingForm } from '../components/booking/BookingForm'

// The booking page's expense panel and Expenses still import these from here.

/** New booking. Accepts ?room=Haven&checkIn=YYYY-MM-DD (Calendar / Room availability). */
export function NewBooking() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { createBooking } = useStore()
  const toast = useToast()

  const room = params.get('room') ?? ''
  const checkIn = params.get('checkIn') ?? ''

  return (
    <>
      <PageTitle back={{ to: '/bookings', label: 'Back to bookings' }} title="New booking" />
      <BookingForm
        initialRoom={ROOM_NAMES.includes(room) ? room : undefined}
        initialCheckIn={/^\d{4}-\d{2}-\d{2}$/.test(checkIn) ? checkIn : undefined}
        submitLabel="Create booking"
        busyLabel="Creating…"
        onSubmit={async (input) => {
          const ref = await createBooking(input)
          toast.show('Booking created successfully!', `${input.guest} · ${ref} · ${input.villa} · ${fmtStay(input)}`)
          navigate('/bookings') // back to the booking list
        }}
      />
    </>
  )
}
