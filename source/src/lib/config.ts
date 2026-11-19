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

/** Room categories, in display order (Dashboard room status, Calendar, Room availability). */
export const ROOM_CATEGORIES = ['Premium', 'Suite Rooms', 'Dormitory', 'Party Hall'] as const
export type RoomCategory = (typeof ROOM_CATEGORIES)[number]

export interface RoomConfig {
  id: string
  name: string
  slug: string
  code: string
  category: RoomCategory
  color: string
  minGuests: number
  maxGuests: number
  baseRate: number
  status: 'Active' | 'Inactive'
  editableCapacity?: boolean // capacity can be changed in Configuration → Rooms (stored as an override)
}

// The rooms, grouped as in the change sheet: Premium 5, Suite Rooms 6,
// Dormitory 2, Party Hall 1. Base rates and capacity are starting values;
// both can be changed in Configuration → Rooms (stored as overrides).
export const ROOMS: RoomConfig[] = [
  // Premium
  { id: 'r1', name: 'Haven', slug: 'haven', code: 'P01', category: 'Premium', color: '#0b241e', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r2', name: 'Elysian', slug: 'elysian', code: 'P02', category: 'Premium', color: '#0b241e', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r3', name: 'Solace', slug: 'solace', code: 'P03', category: 'Premium', color: '#0b241e', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r4', name: 'Sylvane', slug: 'sylvane', code: 'P04', category: 'Premium', color: '#0b241e', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r5', name: 'Zephyr', slug: 'zephyr', code: 'P05', category: 'Premium', color: '#0b241e', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  // Suite rooms
  { id: 'r6', name: 'S1', slug: 's1', code: 'S1', category: 'Suite Rooms', color: '#1e5039', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r7', name: 'S2', slug: 's2', code: 'S2', category: 'Suite Rooms', color: '#1e5039', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r8', name: 'S3', slug: 's3', code: 'S3', category: 'Suite Rooms', color: '#1e5039', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r9', name: 'S4', slug: 's4', code: 'S4', category: 'Suite Rooms', color: '#1e5039', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r10', name: 'S5', slug: 's5', code: 'S5', category: 'Suite Rooms', color: '#1e5039', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r11', name: 'S6', slug: 's6', code: 'S6', category: 'Suite Rooms', color: '#1e5039', minGuests: 1, maxGuests: 4, baseRate: 0, status: 'Active', editableCapacity: true },
  // Dormitory
  { id: 'r12', name: 'Dorm 1', slug: 'dorm-1', code: 'D1', category: 'Dormitory', color: '#475569', minGuests: 1, maxGuests: 20, baseRate: 0, status: 'Active', editableCapacity: true },
  { id: 'r13', name: 'Dorm 2', slug: 'dorm-2', code: 'D2', category: 'Dormitory', color: '#475569', minGuests: 1, maxGuests: 20, baseRate: 0, status: 'Active', editableCapacity: true },
  // Party hall
  { id: 'r14', name: 'Party Hall', slug: 'party-hall', code: 'PH', category: 'Party Hall', color: '#a16207', minGuests: 1, maxGuests: 200, baseRate: 0, status: 'Active', editableCapacity: true },
]

/** Rooms grouped by category, in ROOM_CATEGORIES order. */
export function roomsByCategory(): { category: RoomCategory; rooms: RoomConfig[] }[] {
  return ROOM_CATEGORIES.map((category) => ({ category, rooms: ROOMS.filter((r) => r.category === category) }))
}
export function roomCategory(name: string): RoomCategory | undefined {
  return ROOMS.find((r) => r.name === name)?.category
}

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
