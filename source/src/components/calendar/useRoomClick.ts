import { useNavigate } from 'react-router-dom'
import { can, useAuth } from '../../auth/AuthContext'
import type { Booking } from '../../types'

/**
 * Room card click on the Dashboard room status and Room availability:
 * a booked room opens its booking (view_bookings), a free room starts a new
 * booking for that room and night (edit_bookings). Returns undefined when the
 * user has neither right, so the cards render as plain, non-clickable tiles.
 */
export function useRoomClick(date: string): ((room: string, booking?: Booking) => void) | undefined {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canView = can(user, 'view_bookings')
  const canEdit = can(user, 'edit_bookings')
  if (!canView && !canEdit) return undefined
  return (room, booking) => {
    if (booking) {
      if (canView) navigate(`/bookings/${encodeURIComponent(booking.ref)}`)
    } else if (canEdit) {
      navigate(`/bookings/new?room=${encodeURIComponent(room)}&checkIn=${date}`)
    }
  }
}

/** Which room cards the user can act on: booked → view_bookings, free → edit_bookings. */
export function useRoomCanClick(): (room: string, booking?: Booking) => boolean {
  const { user } = useAuth()
  const canView = can(user, 'view_bookings')
  const canEdit = can(user, 'edit_bookings')
  return (_room, booking) => (booking ? canView : canEdit)
}
