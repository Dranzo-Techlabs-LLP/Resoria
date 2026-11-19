// ------------------------------------------------------------------
//  CONFIGURE THIS (per property)
// ------------------------------------------------------------------
export const PROPERTY_NAME = 'Resoria'
export const PROPERTY_TAGLINE = 'Evora · Rooms Admin'

/** The resort's details for printed invoices. Leave a field empty ('' / []) to keep it off the invoice. */
export const RESORT = {
  name: 'Resoria Evora',
  address: [] as string[], // TODO: the resort's postal address
  phone: '+91 89765 67890', // bookings and enquiries; the same number takes WhatsApp
  phoneHref: 'tel:+918976567890',
  whatsappHref: 'https://wa.me/918976567890',
  email: '', // TODO: bookings email
  instagram: '', // TODO: e.g. '@resoria.evora'
  instagramHref: '',
  website: 'resoriaevora.com',
  websiteHref: 'https://resoriaevora.com/',
}

export const CURRENCY = { symbol: '₹', locale: 'en-IN', code: 'INR' as const }

export const INVOICE_PREFIX_DEFAULT = 'RE-'

/** Sentinel used by every "All rooms" filter. */
export const ALL_ROOMS = 'All rooms'

/** Special room value: books the entire property (all rooms at once). */
export const FULL_PROPERTY = 'Full Property'

export interface RoomConfig {
  id: string
  name: string
  slug: string
  code: string
  color: string
  minGuests: number
  maxGuests: number
  baseRate: number
  status: 'Active' | 'Inactive'
  editableCapacity?: boolean // capacity can be changed on the Rooms page (stored as an override)
}

// Capacities are starting values: every room's can be changed on the Rooms page
// (stored as an override), and the full names are seeded there as notes
// (source/server/install.php).
export const ROOMS: RoomConfig[] = [
  // Villas
  { id: 'r1', name: 'Haven', slug: 'haven', code: 'V01', color: '#1e5039', minGuests: 2, maxGuests: 6, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r2', name: 'Solace', slug: 'solace', code: 'V02', color: '#2a6447', minGuests: 2, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  // Waterfall view suites
  { id: 'r3', name: 'Elysian', slug: 'elysian', code: 'S01', color: '#0f766e', minGuests: 2, maxGuests: 3, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r4', name: 'Sylvane', slug: 'sylvane', code: 'S02', color: '#3b7a5a', minGuests: 2, maxGuests: 3, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r5', name: 'Zephyr', slug: 'zephyr', code: 'S03', color: '#5d9878', minGuests: 2, maxGuests: 3, baseRate: 0, status: 'Active', editableCapacity: true },
  // Single rooms above the kitchen
  { id: 'r6', name: 'K1', slug: 'k1', code: 'K1', color: '#a16207', minGuests: 1, maxGuests: 2, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r7', name: 'K2', slug: 'k2', code: 'K2', color: '#b45309', minGuests: 1, maxGuests: 2, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r8', name: 'K3', slug: 'k3', code: 'K3', color: '#92400e', minGuests: 1, maxGuests: 2, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r9', name: 'K4', slug: 'k4', code: 'K4', color: '#a88a4e', minGuests: 1, maxGuests: 2, baseRate: 0, status: 'Active', editableCapacity: true },
  // Single rooms on the reception side
  { id: 'r10', name: 'R1', slug: 'r1', code: 'R1', color: '#9a3412', minGuests: 1, maxGuests: 2, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r11', name: 'R2', slug: 'r2', code: 'R2', color: '#c2410c', minGuests: 1, maxGuests: 2, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r12', name: 'R3', slug: 'r3', code: 'R3', color: '#7c2d12', minGuests: 1, maxGuests: 2, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r13', name: 'Cave Room', slug: 'cave-room', code: 'CAVE', color: '#57534e', minGuests: 2, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r14', name: 'Dormitory', slug: 'dormitory', code: 'DORM', color: '#475569', minGuests: 10, maxGuests: 60, baseRate: 0, status: 'Active', editableCapacity: true },
  // Event spaces
  { id: 'r15', name: 'DJ Hall', slug: 'dj-hall', code: 'DJ', color: '#be185d', minGuests: 10, maxGuests: 100, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r16', name: 'Conference Hall', slug: 'conference-hall', code: 'CONF', color: '#9f1239', minGuests: 10, maxGuests: 100, baseRate: 0, status: 'Active', editableCapacity: true },
]

export const ROOM_NAMES: string[] = ROOMS.map((r) => r.name)

/** Options for room dropdowns (filters, expense room): every room plus Full Property. */
export const ROOM_OPTIONS: string[] = [...ROOM_NAMES, FULL_PROPERTY]

const BY_NAME = new Map(ROOMS.map((r) => [r.name, r]))

/** Color for a single room, a comma list (uses the first room), or FULL_PROPERTY. */
export function roomColor(name: string): string {
  if (name === FULL_PROPERTY) return '#7c2d12'
  const first = name.includes(',') ? name.split(',')[0].trim() : name
  return BY_NAME.get(first)?.color ?? '#64748b'
}
export function roomCapacity(name: string): { min: number; max: number } {
  const r = BY_NAME.get(name)
  return { min: r?.minGuests ?? 1, max: r?.maxGuests ?? 20 }
}

// ---- Multi-room helpers ---------------------------------------------------
// A booking's `villa` field holds one room ("Haven"), a comma list ("Haven, K1"),
// or the sentinel FULL_PROPERTY (the whole property).
export function bookingRooms(villa: string): string[] {
  if (!villa) return []
  if (villa === FULL_PROPERTY) return ROOM_NAMES.slice()
  return villa.split(',').map((s) => s.trim()).filter(Boolean)
}
export function isFullProperty(villa: string): boolean {
  return villa === FULL_PROPERTY
}
export function bookingHasRoom(villa: string, room: string): boolean {
  return villa === FULL_PROPERTY || bookingRooms(villa).includes(room)
}
/** Single bucket for calendar color / per-room accounting: first room, or FULL_PROPERTY. */
export function primaryRoom(villa: string): string {
  if (villa === FULL_PROPERTY) return FULL_PROPERTY
  return bookingRooms(villa)[0] ?? villa
}
