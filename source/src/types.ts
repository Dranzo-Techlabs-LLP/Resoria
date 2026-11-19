// ------------------------------------------------------------------
//  Resoria domain types (villa admin)
// ------------------------------------------------------------------

export type BookingStatus =
  | 'enquiry'
  | 'hold'
  | 'confirmed'
  | 'checked in'
  | 'completed'
  | 'cancelled'

export interface Payment {
  id: string
  date: string // ISO
  amount: number
  kind: 'payment' | 'refund'
  method?: string // Cash, UPI, Card, Bank transfer…
  reference?: string // UPI / transaction / cheque ref (optional)
  advance?: boolean // the advance entered while booking (one per booking)
  purpose?: 'room' | 'extras' // extras = collection of the booking's additional expenses (charges)
  createdAt?: string // 'YYYY-MM-DD HH:MM:SS' when it was recorded (empty for older entries)
  receiptNo?: string // RE-00004-R2: fixed when the payment is recorded, never renumbered
}

/** Ledger label for a payment: Advance / Remaining / Expenses / Refund. */
export type PaymentType = 'Advance' | 'Remaining' | 'Expenses' | 'Refund'

/** Booking source types. Older bookings may carry other free-text sources. */
export type BookingSource = 'Direct' | 'B2B' | 'OTA' | 'Management Referral'

/** Additional expense charged to a guest during the stay (food, hall, services). */
export type ChargeCategory = 'Food' | 'Conference Hall' | 'Other Services'
export interface BookingCharge {
  id: string
  category: ChargeCategory
  item: string // Fried Rice · Conference Hall · 1 Hour · description
  qty: number
  rate: number
  total: number // qty × rate
  at: string // 'YYYY-MM-DD HH:MM:SS'
  paymentId?: string | null // set once collected (the Expenses payment that settled it)
}

/** One line of a booking's stay history (read-only, newest last). */
export interface BookingEvent {
  id: string
  at: string // 'YYYY-MM-DD HH:MM:SS'
  text: string
}

export interface Booking {
  id: string
  ref: string // WL-0001
  guest: string
  phone: string
  altPhone?: string // alternate mobile (optional)
  email?: string
  villa: string // one room ("Haven"), a comma list ("Haven, K1"), or "Full Property"
  checkIn: string // ISO date
  checkOut: string // ISO date
  guests: number // total = adults + kids
  adults?: number
  kids?: number
  status: BookingStatus
  total: number
  payments: Payment[]
  source: string // Direct, B2B, OTA…
  notes?: string
  createdAt: string // ISO date the booking was made
  b2bExternal?: number // B2B commission the partner collected externally (derived in the store; counts as settled)

  // ---- Change-sheet fields (all optional: older bookings don't have them) ----
  place?: string
  documentName?: string // attached ID proof file name ('' = none); fetch it with api.documentUrl()
  sourceDetail?: string // B2B agent / OTA platform / management referrer name
  originalTotal?: number // calculated room amount before any manual adjustment
  commission?: number // B2B commission for the agent (pending until paid via Expenses)
  checkedInAt?: string // 'YYYY-MM-DD HH:MM:SS'
  checkedOutAt?: string
  completedAt?: string
  cancelledAt?: string
  cancellationCharge?: number
  charges: BookingCharge[] // additional expenses (In-house)
  events: BookingEvent[] // stay history
  feedbackToken?: string // guest feedback link token ('' until a link is created)
}

export interface Expense {
  id: string
  date: string // ISO
  category: string
  villa: string
  bookingRef?: string
  description: string
  amount: number
  external?: boolean // B2B commission collected externally by the partner (not paid out by the resort)
  sourceRef?: string // e.g. PUR-00003: the inventory purchase that created this expense
}

export interface User {
  id: string
  name: string
  email: string
  password: string // demo only
  role: string
  villa?: string
  active: boolean
  lastLogin?: string
}

export interface Role {
  id: string
  name: string
  system: boolean
  rights: string[]
}

export interface InvoiceSettings {
  prefix: string
  next: number
  padding: number
  terms: string
  showPayments?: boolean // print every payment entry on the invoice
  showB2b?: boolean // print the booking's B2B commission on the invoice
}

/** Per-room settings saved on the Rooms page (capacity only for rooms that allow it). */
export interface RoomOverride {
  baseRate?: number
  notes?: string
  minGuests?: number
  maxGuests?: number
}

// ---- Configuration lists (Configuration page) ----
export interface Agent {
  id: string
  name: string
  commissionType: 'percent' | 'flat' // percent of the booking amount, or a flat amount per booking
  commissionValue: number
  phone?: string
  active: boolean
}
export interface NamedOption {
  id: string
  name: string
  active: boolean
}
export interface MenuItem {
  id: string
  name: string
  price: number
  active: boolean
}
export interface HallRate {
  hours: number // 1, 2, 3…
  price: number
}
export interface AppSettings {
  agents: Agent[]
  otaPlatforms: NamedOption[]
  referrers: NamedOption[] // management members who can refer bookings
  menuItems: MenuItem[]
  hallRates: HallRate[] // Conference Hall pricing by duration
  departments: string[] // inventory usage departments
}
export type SettingsKey = keyof AppSettings

// ---- Inventory ----
export const INVENTORY_CATEGORIES = [
  'Guest Supplies', 'Housekeeping', 'Linen & Laundry', 'Maintenance', 'Pool & Outdoor', 'Office Supplies',
] as const
export const INVENTORY_UNITS = ['Pcs', 'Kg', 'Litre', 'Pack', 'Box', 'Bottle', 'Roll', 'Set', 'Pair'] as const

export interface InventoryItem {
  id: string // INV-0001
  name: string
  category: string
  unit: string
  minStock: number
  openingStock: number
  available: number // current quantity (server-computed from movements)
  lastRate: number // last purchase rate per unit (for stock value)
  active: boolean
  createdAt: string
  /** Reusable items (towels, bedsheets): usage is an issue that comes back with a return. */
  reusable: boolean
  /** Reusable items: issued and not yet returned or written off. 0 for consumables. */
  inUse: number
}
/**
 * in: purchase (store +) · out: consumed (store −) · adjust: physical correction (store ±)
 * issue: reusable item sent to a department (store −, in use +) · return: back to store (store +, in use −)
 * writeoff: issued item damaged / lost (in use −, store unchanged)
 */
export type MovementType = 'in' | 'out' | 'adjust' | 'issue' | 'return' | 'writeoff'
export interface StockMovement {
  id: string
  ref: string // PUR-00001 / USE-00001 / ADJ-00001
  itemId: string
  type: MovementType
  qty: number // positive for in/out; signed for adjust
  rate?: number // purchase rate per unit (in)
  amount?: number // qty × rate (in)
  date: string // ISO date of the purchase / usage / adjustment
  department?: string // usage
  supplier?: string // purchase
  note?: string
  prevBalance: number
  balance: number
  createdAt: string
}
export interface StockPurchase {
  ref: string // PUR-00001
  date: string
  supplier: string
  billName?: string
  total: number
  paidAmount: number
  paymentStatus: 'Paid' | 'Unpaid' | 'Partially Paid'
  expenseId?: string
  /** Later payments to the supplier (the first payment is part of paidAmount at purchase time). */
  payments: { date: string; amount: number; method: string; createdAt: string }[]
}
export interface InventoryData {
  items: InventoryItem[]
  movements: StockMovement[]
  purchases: StockPurchase[]
}

// ---- Guest ratings ----
export const RATING_ASPECTS = ['rooms', 'cleanliness', 'food', 'service', 'value'] as const
export type RatingAspect = (typeof RATING_ASPECTS)[number]
export const RATING_ASPECT_LABELS: Record<RatingAspect, string> = {
  rooms: 'Rooms', cleanliness: 'Cleanliness', food: 'Food', service: 'Service', value: 'Value for money',
}
/** Where a rating came from. 'Guest feedback link' = submitted by the guest through the shared link. */
export const RATING_SOURCES = [
  'Guest feedback link', 'Phone / WhatsApp', 'In person', 'Google', 'Booking.com', 'Agoda', 'MakeMyTrip', 'Airbnb', 'TripAdvisor', 'Other',
] as const
export interface Rating {
  id: string
  bookingRef?: string // linked stay (optional for public reviews)
  guest: string
  overall: number // 1–5
  aspects: Partial<Record<RatingAspect, number>> // 1–5 each, optional
  comment?: string
  source: string // one of RATING_SOURCES
  date: string // ISO date of the review
  createdAt: string
  response?: string // the resort's reply / follow-up note
  respondedAt?: string
}

/** The full client dataset. */
export interface AppData {
  bookings: Booking[]
  expenses: Expense[]
  users: User[]
  roles: Role[]
  invoice: InvoiceSettings
  villaOverrides: Record<string, RoomOverride>
  settings: AppSettings
  inventory: InventoryData
  ratings: Rating[]
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
}
