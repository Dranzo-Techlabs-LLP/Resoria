import { roomsByCategory } from '../../lib/config'
import { occupancyOn } from '../../lib/booking'
import type { Booking } from '../../types'

/**
 * Rooms grouped by category for one night (Dashboard "Today Room Status",
 * Calendar "Room availability"). Booked: dark green card with the guest's first
 * name; free: white card with a thin dark-green border and "Free".
 */
export function RoomBoard({
  bookings, date, onRoom, canClick, compact = false,
}: {
  bookings: Booking[]
  date: string // ISO night
  onRoom?: (room: string, booking?: Booking) => void
  /** Per-card gate (e.g. the user may open bookings but not create them). Default: every card when onRoom is set. */
  canClick?: (room: string, booking?: Booking) => boolean
  compact?: boolean
}) {
  const occ = occupancyOn(bookings, date)
  const groups = roomsByCategory()
  // Dormitory and Party Hall are short; show them side by side like the reference
  const wide = groups.filter((g) => g.rooms.length > 2)
  const small = groups.filter((g) => g.rooms.length <= 2)
  const card = (room: string) => {
    const b = occ.get(room)
    const first = b ? b.guest.trim().split(/\s+/)[0] : 'Free'
    return (
      <button
        key={room}
        type="button"
        onClick={() => onRoom?.(room, b)}
        disabled={!onRoom || (canClick ? !canClick(room, b) : false)}
        title={b ? `${room} · ${b.guest} · ${b.ref}` : `${room} · Free`}
        className={`flex min-w-0 flex-col items-center justify-center rounded-2xl border px-2 text-center transition-colors ${compact ? 'h-16' : 'h-[84px]'} ${
          b ? 'border-ink bg-ink text-white hover:bg-ink-hover' : 'border-ink/80 bg-white text-dark hover:bg-[#f3f6f4]'
        } disabled:cursor-default`}
      >
        <span className="truncate text-[15px] font-semibold">{room}</span>
        <span className={`truncate text-sm ${b ? 'text-white/85' : 'text-slate-600'}`}>{first}</span>
      </button>
    )
  }
  const label = (category: string, n: number) => (
    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
      {category} · {n} {n === 1 ? 'room' : 'rooms'}
    </div>
  )
  return (
    <div className="space-y-5">
      {wide.map((g) => (
        <div key={g.category}>
          {label(g.category, g.rooms.length)}
          {/* One row per category from sm up (as in the reference); 3 per row on phones */}
          <div
            className="grid grid-cols-3 gap-2.5 sm:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"
            style={{ ['--n' as string]: g.rooms.length }}
          >
            {g.rooms.map((r) => card(r.name))}
          </div>
        </div>
      ))}
      {small.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          {small.map((g) => (
            <div key={g.category}>
              {label(g.category, g.rooms.length)}
              <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${g.rooms.length}, minmax(0, 1fr))` }}>
                {g.rooms.map((r) => card(r.name))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
