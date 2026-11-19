// ------------------------------------------------------------------
//  Resoria API client
//  Talks to the PHP backend under /api (same origin in production).
//  For local `npm run dev` against the live server, set
//  VITE_API_BASE=https://resoriaevora.com/api in a .env.development.local file.
// ------------------------------------------------------------------
import type {
  AppData, AppSettings, Booking, BookingStatus, ChargeCategory, Expense, InventoryData, InventoryItem, InvoiceSettings,
  Payment, Rating, Role, RoomOverride, SettingsKey, User,
} from '../types'

const ENV = (import.meta as unknown as { env?: Record<string, string> }).env ?? {}
const API_BASE = (ENV.VITE_API_BASE || '/api').replace(/\/$/, '')
const TOKEN_KEY = 'resoria.token'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: string
  villa?: string
  rights: string[]
}

/** A file picked in the browser, sent as base64 (no data: prefix). */
export interface FileUpload {
  name: string
  type: string
  data: string
}

/** Fields the New/Edit booking forms send. */
export type BookingWrite = Omit<
  Booking,
  | 'id' | 'ref' | 'payments' | 'createdAt' | 'charges' | 'events' | 'b2bExternal' | 'documentName'
  | 'checkedInAt' | 'checkedOutAt' | 'completedAt' | 'cancelledAt' | 'cancellationCharge'
> & {
  advance?: number
  advanceMethod?: string
  b2bCommission?: number // older forms only: creates the B2B expense right away
  document?: FileUpload | null // new ID proof; null removes it; leave out to keep the current one
}

export interface ChargeWrite {
  category: ChargeCategory
  item: string
  qty: number
  rate: number
}

export interface PurchaseWrite {
  date: string
  supplier: string
  paidAmount: number
  paymentStatus: 'Paid' | 'Unpaid' | 'Partially Paid'
  bill?: FileUpload | null
  lines: { itemId: string; qty: number; rate: number }[]
}
export interface UsageWrite {
  date: string
  department: string
  note?: string
  lines: { itemId: string; qty: number }[]
}
export interface AdjustmentWrite {
  date: string
  itemId: string
  qty: number // signed: +found / −lost or damaged
  note: string
}
export type ItemWrite = Pick<InventoryItem, 'name' | 'category' | 'unit' | 'minStock' | 'openingStock' | 'active' | 'reusable'>
/** Return issued reusable items: `returned` go back to store, `damaged` are written off. */
export interface ReturnWrite {
  date: string
  department: string
  note?: string
  lines: { itemId: string; returned: number; damaged: number }[]
}
export type RatingWrite = Omit<Rating, 'id' | 'createdAt' | 'respondedAt'>

/** Fields the Add/Edit user forms send. Password: required to add, optional to edit. */
export type UserWrite = Pick<User, 'name' | 'email' | 'role' | 'active'> & {
  villa: string // room(s) the user looks after, "" = not assigned
  password?: string
}

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignore */ }
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function req<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0)
  }

  const text = await res.text()
  let data: unknown = {}
  try { data = text ? JSON.parse(text) : {} } catch { /* non-JSON */ }

  if (!res.ok) {
    // A dead/expired session should drop the token so the app returns to login.
    if (res.status === 401) setToken(null)
    const msg = (data as { error?: string })?.error || `Request failed (${res.status})`
    throw new ApiError(msg, res.status)
  }
  return data as T
}

/** Fetch a protected file (ID proof, purchase bill) with the session token, as a Blob. */
async function fetchFile(path: string): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) {
    let msg = `Could not open the file (${res.status})`
    try { msg = (await res.json()).error || msg } catch { /* not JSON */ }
    throw new ApiError(msg, res.status)
  }
  return res.blob()
}

/** Open a protected file in a new tab, or download it under `downloadName`. */
export async function openFile(path: string, downloadName?: string): Promise<void> {
  // Open the tab first (in the click) so pop-up blockers allow it, then load the file into it
  const win = downloadName ? null : window.open('', '_blank')
  try {
    const blob = await fetchFile(path)
    const url = URL.createObjectURL(blob)
    if (downloadName) {
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      a.remove()
    } else if (win) {
      win.location.href = url
    } else {
      window.open(url, '_blank')
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) {
    win?.close()
    throw e
  }
}

/** Read a browser File as a FileUpload (base64). Rejects files over `maxMb`. */
export function readFileUpload(file: File, maxMb = 5): Promise<FileUpload> {
  return new Promise((resolve, reject) => {
    if (file.size > maxMb * 1024 * 1024) {
      reject(new Error(`The file is larger than ${maxMb} MB.`))
      return
    }
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result || '')
      resolve({ name: file.name, type: file.type || 'application/octet-stream', data: s.slice(s.indexOf(',') + 1) })
    }
    r.onerror = () => reject(new Error('Could not read the file.'))
    r.readAsDataURL(file)
  })
}

const enc = encodeURIComponent

export const api = {
  login: (email: string, password: string) =>
    req<{ token: string; user: SessionUser }>('/login', { method: 'POST', body: { email, password } }),
  me: () => req<{ user: SessionUser }>('/me'),
  logout: () => req<{ ok: boolean }>('/logout', { method: 'POST' }),
  bootstrap: () => req<AppData>('/bootstrap'),

  createBooking: (input: BookingWrite) =>
    req<{ ref: string; booking: Booking }>('/bookings', { method: 'POST', body: input }),
  updateBooking: (ref: string, fields: BookingWrite) =>
    req<{ booking: Booking }>(`/bookings/${encodeURIComponent(ref)}`, { method: 'PUT', body: fields }),
  deleteBooking: (ref: string) =>
    req<{ ok: boolean }>(`/bookings/${encodeURIComponent(ref)}`, { method: 'DELETE' }),
  setBookingStatus: (ref: string, status: BookingStatus) =>
    req<{ booking: Booking }>(`/bookings/${encodeURIComponent(ref)}`, { method: 'PATCH', body: { status } }),
  addPayment: (ref: string, p: Omit<Payment, 'id'>) =>
    req<{ booking: Booking }>(`/bookings/${encodeURIComponent(ref)}/payments`, { method: 'POST', body: p }),
  updatePayment: (id: string, p: Omit<Payment, 'id'>) =>
    req<{ booking: Booking }>(`/payments/${encodeURIComponent(id)}`, { method: 'PUT', body: p }),
  deletePayment: (id: string) =>
    req<{ booking: Booking }>(`/payments/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  addExpense: (e: Omit<Expense, 'id'>) =>
    req<{ expense: Expense }>('/expenses', { method: 'POST', body: e }),
  updateExpense: (id: string, e: Omit<Expense, 'id'>) =>
    req<{ expense: Expense }>(`/expenses/${encodeURIComponent(id)}`, { method: 'PUT', body: e }),
  deleteExpense: (id: string) =>
    req<{ ok: boolean }>(`/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  addUser: (u: UserWrite) =>
    req<{ user: User }>('/users', { method: 'POST', body: u }),
  updateUser: (id: string, u: UserWrite) =>
    req<{ user: User }>(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: u }),
  setUserActive: (id: string, active: boolean) =>
    req<{ user: User }>(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: { active } }),

  addRole: (name: string) =>
    req<{ role: Role }>('/roles', { method: 'POST', body: { name } }),
  saveRoleRights: (roleId: string, rights: string[]) =>
    req<{ ok: boolean }>(`/roles/${encodeURIComponent(roleId)}`, { method: 'PATCH', body: { rights } }),

  saveInvoice: (s: Partial<InvoiceSettings>) =>
    req<{ invoice: InvoiceSettings }>('/invoice', { method: 'PUT', body: s }),
  saveVillaOverride: (name: string, data: RoomOverride) =>
    req<{ ok: boolean; override?: RoomOverride }>(`/rooms/${encodeURIComponent(name)}/override`, { method: 'PUT', body: data }),

  // ---- Booking lifecycle (each returns the updated booking, with its stay history) ----
  checkIn: (ref: string) =>
    req<{ booking: Booking }>(`/bookings/${enc(ref)}/check-in`, { method: 'POST', body: {} }),
  checkOut: (ref: string) =>
    req<{ booking: Booking }>(`/bookings/${enc(ref)}/check-out`, { method: 'POST', body: {} }),
  /** Cancel with cancellation charges (₹0 = none); the rest of the room money received becomes a pending refund. */
  cancelBooking: (ref: string, cancellationCharge: number) =>
    req<{ booking: Booking }>(`/bookings/${enc(ref)}/cancel`, { method: 'POST', body: { cancellationCharge } }),

  // ---- Additional expenses (In-house) ----
  addCharge: (ref: string, c: ChargeWrite) =>
    req<{ booking: Booking }>(`/bookings/${enc(ref)}/charges`, { method: 'POST', body: c }),
  updateCharge: (id: string, c: ChargeWrite) =>
    req<{ booking: Booking }>(`/charges/${enc(id)}`, { method: 'PUT', body: c }),
  deleteCharge: (id: string) =>
    req<{ booking: Booking }>(`/charges/${enc(id)}`, { method: 'DELETE' }),
  /** Collect every unpaid additional expense in one payment (generates the Additional Expenses bill). */
  collectCharges: (ref: string, p: { method: string; date: string; reference?: string }) =>
    req<{ booking: Booking }>(`/bookings/${enc(ref)}/charges/collect`, { method: 'POST', body: p }),

  /** ID proof: '/bookings/{ref}/document' for openFile(). */
  documentPath: (ref: string) => `/bookings/${enc(ref)}/document`,

  // ---- Configuration lists ----
  saveSettings: <K extends SettingsKey>(key: K, value: AppSettings[K]) =>
    req<{ settings: AppSettings }>(`/settings/${enc(key)}`, { method: 'PUT', body: { value } }),

  // ---- Inventory (each returns the whole inventory, already recalculated) ----
  addItem: (i: ItemWrite) =>
    req<{ inventory: InventoryData; item: InventoryItem }>('/inventory/items', { method: 'POST', body: i }),
  updateItem: (id: string, i: Partial<ItemWrite>) =>
    req<{ inventory: InventoryData }>(`/inventory/items/${enc(id)}`, { method: 'PUT', body: i }),
  addPurchase: (p: PurchaseWrite) =>
    req<{ inventory: InventoryData; ref: string; expense: Expense }>('/inventory/purchases', { method: 'POST', body: p }),
  addUsage: (u: UsageWrite) =>
    req<{ inventory: InventoryData; ref: string }>('/inventory/usage', { method: 'POST', body: u }),
  addAdjustment: (a: AdjustmentWrite) =>
    req<{ inventory: InventoryData; ref: string }>('/inventory/adjustments', { method: 'POST', body: a }),
  /** Purchase bill: '/inventory/purchases/{ref}/bill' for openFile(). */
  billPath: (ref: string) => `/inventory/purchases/${enc(ref)}/bill`,
  /** Usage of a reusable item is recorded as an issue automatically (same addUsage call). */
  addReturn: (r: ReturnWrite) =>
    req<{ inventory: InventoryData; ref: string }>('/inventory/returns', { method: 'POST', body: r }),
  /** Pay a supplier later for an Unpaid / Partially Paid purchase. */
  payPurchase: (ref: string, p: { date: string; amount: number; method: string }) =>
    req<{ inventory: InventoryData }>(`/inventory/purchases/${enc(ref)}/payments`, { method: 'POST', body: p }),

  // ---- Guest ratings ----
  addRating: (r: RatingWrite) =>
    req<{ rating: Rating }>('/ratings', { method: 'POST', body: r }),
  updateRating: (id: string, r: Partial<RatingWrite>) =>
    req<{ rating: Rating }>(`/ratings/${enc(id)}`, { method: 'PUT', body: r }),
  deleteRating: (id: string) =>
    req<{ ok: boolean }>(`/ratings/${enc(id)}`, { method: 'DELETE' }),
  /** Creates (once) the booking's guest feedback link token; the link is <site>/feedback?t=<token>. */
  feedbackLink: (ref: string) =>
    req<{ token: string; booking: Booking }>(`/bookings/${enc(ref)}/feedback-link`, { method: 'POST', body: {} }),

  // ---- Rooms from older bookings ----
  /** Move every booking / expense / user / room setting from an old room name to one of the current rooms. */
  renameRoom: (from: string, to: string) =>
    req<{ ok: boolean; bookings: number }>('/rooms/rename', { method: 'POST', body: { from, to } }),
}

/** Public guest feedback (no login): used by the website's /feedback page. */
export const publicFeedback = {
  get: (token: string) =>
    req<{ guest: string; rooms: string; checkIn: string; checkOut: string; submitted: boolean }>(`/feedback/${enc(token)}`),
  submit: (token: string, r: { overall: number; aspects: Partial<Record<string, number>>; comment: string }) =>
    req<{ ok: boolean }>(`/feedback/${enc(token)}`, { method: 'POST', body: r }),
}
