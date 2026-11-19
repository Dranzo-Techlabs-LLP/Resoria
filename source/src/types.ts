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
}
export type MovementType = 'in' | 'out' | 'adjust'
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
}
export interface InventoryData {
  items: InventoryItem[]
  movements: StockMovement[]
  purchases: StockPurchase[]
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
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
}
