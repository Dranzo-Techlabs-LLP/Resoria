import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ROOMS } from '../lib/config'
import {
  api, ApiError, setToken, type AdjustmentWrite, type BookingWrite, type ChargeWrite, type ItemWrite, type PurchaseWrite,
  type RatingWrite, type ReturnWrite, type UsageWrite, type UserWrite,
} from '../lib/api'
import { roomBalance, roomPaid } from '../lib/booking'
import { useAuth } from '../auth/AuthContext'
import type { AppData, AppSettings, Booking, BookingStatus, Expense, InventoryData, InvoiceSettings, Payment, RoomOverride, SettingsKey } from '../types'

/** Room money received (payments − refunds; additional-expense collections are kept apart). */
export function paidOf(b: Booking): number {
  return roomPaid(b)
}
/** What the guest still owes for the room: a B2B commission the partner collected externally counts as settled. */
export function balanceOf(b: Booking): number {
  return roomBalance(b)
}
/** Category that represents B2B partner commission (excluded from "operating" expenses). */
export const B2B_CATEGORY = 'B2B Commission'

/** B2B commission the resort pays out itself (not collected externally by the partner). */
export const isPaidOutB2b = (e: Expense) => e.category === B2B_CATEGORY && !e.external

/** A booking's B2B-commission rows. Refs match regardless of letter case, as in the database. */
export function b2bRowsOf(expenses: Expense[], ref: string): Expense[] {
  const r = ref.trim().toLowerCase()
  return expenses.filter((e) => e.category === B2B_CATEGORY && e.bookingRef?.trim().toLowerCase() === r)
}

/** Empty dataset used before bootstrap resolves / after logout. */
function emptyData(): AppData {
  return {
    bookings: [],
    expenses: [],
    users: [],
    roles: [],
    invoice: { prefix: 'RE-', next: 1, padding: 5, terms: '', cancellationPolicy: '' },
    villaOverrides: {},
    settings: emptySettings(),
    inventory: { items: [], movements: [], purchases: [] },
    ratings: [],
  }
}
export function emptySettings(): AppSettings {
  return { agents: [], otaPlatforms: [], referrers: [], menuItems: [], hallRates: [], departments: [] }
}
/** Older servers send bookings without these lists. */
function normalizeBooking(b: Booking): Booking {
  return { ...b, charges: b.charges ?? [], events: b.events ?? [] }
}

interface StoreValue {
  data: AppData
  loading: boolean
  error: string | null
  clearError: () => void
  reload: () => void
  /** Re-fetch everything quietly (no spinner, errors ignored). */
  refresh: () => Promise<void>
  addExpense: (e: Omit<Expense, 'id'>) => Promise<void>
  updateExpense: (id: string, e: Omit<Expense, 'id'>) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  addUser: (u: UserWrite) => Promise<void>
  updateUser: (id: string, u: UserWrite) => Promise<void>
  setUserActive: (id: string, active: boolean) => Promise<void>
  saveRoleRights: (roleId: string, rights: string[]) => Promise<void>
  addRole: (name: string) => Promise<void>
  /** Throws on failure so the Invoice settings page can show the message. */
  saveInvoice: (s: Partial<InvoiceSettings>) => Promise<void>
  createBooking: (input: BookingWrite) => Promise<string>
  updateBooking: (ref: string, fields: Partial<BookingWrite>) => Promise<void>
  deleteBooking: (ref: string) => Promise<void>
  addPayment: (ref: string, p: Omit<Payment, 'id'>) => Promise<void>
  updatePayment: (id: string, p: Omit<Payment, 'id'>) => Promise<void>
  deletePayment: (id: string) => Promise<void>
  setBookingStatus: (ref: string, status: BookingStatus) => Promise<void>
  /** Throws on failure so the Rooms form can show the message. */
  saveVillaOverride: (name: string, data: RoomOverride) => Promise<void>

  // ---- Change-sheet actions. All of these THROW on failure (show the message in the form / popup). ----
  /** Record a payment or refund and throw on failure (the older addPayment shows a banner instead). */
  recordPayment: (ref: string, p: Omit<Payment, 'id'>) => Promise<void>
  checkIn: (ref: string) => Promise<void>
  checkOut: (ref: string) => Promise<void>
  cancelBooking: (ref: string, cancellationCharge: number) => Promise<void>
  addCharge: (ref: string, c: ChargeWrite) => Promise<void>
  addCharges: (ref: string, items: ChargeWrite[]) => Promise<void>
  updateCharge: (id: string, c: ChargeWrite) => Promise<void>
  deleteCharge: (id: string) => Promise<void>
  collectCharges: (ref: string, p: { method: string; date: string; reference?: string }) => Promise<void>
  saveSettings: <K extends SettingsKey>(key: K, value: AppSettings[K]) => Promise<void>
  addItem: (i: ItemWrite) => Promise<string>
  updateItem: (id: string, i: Partial<ItemWrite>) => Promise<void>
  /** Returns the purchase reference (PUR-00001). */
  addPurchase: (p: PurchaseWrite) => Promise<string>
  /** Returns the usage reference (USE-00001). */
  addUsage: (u: UsageWrite) => Promise<string>
  /** Returns the adjustment reference (ADJ-00001). */
  addAdjustment: (a: AdjustmentWrite) => Promise<string>
  /** Return issued reusable items (RET-00001). */
  addReturn: (r: ReturnWrite) => Promise<string>
  payPurchase: (ref: string, p: { date: string; amount: number; method: string }) => Promise<void>
  addRating: (r: RatingWrite) => Promise<void>
  updateRating: (id: string, r: Partial<RatingWrite>) => Promise<void>
  deleteRating: (id: string) => Promise<void>
  /** Returns the feedback token (creates it once). */
  feedbackLink: (ref: string) => Promise<string>
  /** Moves an old room name to a current room everywhere; reloads all data. Returns the bookings changed. */
  renameRoom: (from: string, to: string) => Promise<number>
}

const StoreContext = createContext<StoreValue | undefined>(undefined)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const [data, setData] = useState<AppData>(emptyData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return api.bootstrap()
      .then((d) => setData({
        ...emptyData(), ...d,
        settings: { ...emptySettings(), ...(d.settings ?? {}) },
        ratings: d.ratings ?? [],
        bookings: (d.bookings ?? []).map(normalizeBooking),
      }))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          setToken(null)
          logout()
        } else {
          setError(e instanceof Error ? e.message : 'Failed to load data.')
        }
      })
      .finally(() => setLoading(false))
  }, [logout])

  const refresh = useCallback(async () => {
    try {
      const d = await api.bootstrap()
      setData({
        ...emptyData(), ...d,
        settings: { ...emptySettings(), ...(d.settings ?? {}) },
        ratings: d.ratings ?? [],
        bookings: (d.bookings ?? []).map(normalizeBooking),
      })
    } catch { /* keep what's on screen; the next refresh or action will retry */ }
  }, [])

  // Several staff use the app at once: pick up their bookings, payments and changes when the
  // window comes back into focus and every minute while it's visible.
  useEffect(() => {
    if (!user) return
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const timer = window.setInterval(onVisible, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.clearInterval(timer)
    }
  }, [user, refresh])

  // Load everything once the user is authenticated; clear on logout.
  useEffect(() => {
    if (!user) {
      setData(emptyData())
      setError(null)
      setLoading(false)
      return
    }
    load()
  }, [user, load])

  // Wrap a mutation so a failure surfaces in the error banner instead of
  // bubbling up as an unhandled promise rejection (callers don't await).
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }, [])

  // An older server saves the expense but doesn't know "collected externally"
  const OLD_SERVER_EXTERNAL = "The B2B commission was saved, but not the 'collected externally' option. The server needs the latest update (api/index.php and api/lib.php)."

  const addExpense = useCallback((e: Omit<Expense, 'id'>) => guard(async () => {
    const { expense } = await api.addExpense(e)
    setData((d) => ({ ...d, expenses: [expense, ...d.expenses] }))
    if (e.external && expense.external === undefined) throw new Error(OLD_SERVER_EXTERNAL)
  }), [guard])

  const updateExpense = useCallback((id: string, e: Omit<Expense, 'id'>) => guard(async () => {
    const { expense } = await api.updateExpense(id, e)
    setData((d) => ({ ...d, expenses: d.expenses.map((x) => (x.id === id ? expense : x)) }))
    if (e.external !== undefined && expense.external === undefined) throw new Error(OLD_SERVER_EXTERNAL)
  }), [guard])

  const deleteExpense = useCallback((id: string) => guard(async () => {
    await api.deleteExpense(id)
    setData((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== id) }))
  }), [guard])

  // Users: failures are thrown, not bannered, so the form can show them.
  const addUser = useCallback(async (u: UserWrite) => {
    const { user: created } = await api.addUser(u)
    setData((d) => ({ ...d, users: [...d.users, created] }))
  }, [])

  const updateUser = useCallback(async (id: string, u: UserWrite) => {
    const { user: updated } = await api.updateUser(id, u)
    setData((d) => ({ ...d, users: d.users.map((x) => (x.id === id ? updated : x)) }))
  }, [])

  const setUserActive = useCallback((id: string, active: boolean) => guard(async () => {
    const { user: updated } = await api.setUserActive(id, active)
    setData((d) => ({ ...d, users: d.users.map((x) => (x.id === id ? updated : x)) }))
  }), [guard])

  const saveRoleRights = useCallback((roleId: string, rights: string[]) => guard(async () => {
    await api.saveRoleRights(roleId, rights)
    setData((d) => ({ ...d, roles: d.roles.map((r) => (r.id === roleId ? { ...r, rights } : r)) }))
  }), [guard])

  const addRole = useCallback((name: string) => guard(async () => {
    const { role } = await api.addRole(name)
    setData((d) => ({ ...d, roles: [...d.roles, role] }))
  }), [guard])

  const saveInvoice = useCallback(async (s: Partial<InvoiceSettings>) => {
    const { invoice } = await api.saveInvoice(s)
    setData((d) => ({ ...d, invoice: { ...d.invoice, ...invoice } }))
    // An older server saves the rest but doesn't know the "show on invoice" options
    if ((s.showPayments !== undefined && invoice.showPayments === undefined) || (s.showB2b !== undefined && invoice.showB2b === undefined)) {
      throw new Error("The settings were saved, but not the 'Show on invoice' options. The server needs the latest update (api/index.php and api/lib.php).")
    }
  }, [])

  const replaceBooking = (raw: Booking) => {
    const booking = normalizeBooking(raw)
    setData((d) => ({ ...d, bookings: d.bookings.map((b) => (b.ref === booking.ref ? booking : b)) }))
  }

  const addPayment = useCallback((ref: string, p: Omit<Payment, 'id'>) => guard(async () => {
    const { booking } = await api.addPayment(ref, p)
    replaceBooking(booking)
  }), [guard])

  const updatePayment = useCallback((id: string, p: Omit<Payment, 'id'>) => guard(async () => {
    const { booking } = await api.updatePayment(id, p)
    replaceBooking(booking)
  }), [guard])

  const deletePayment = useCallback((id: string) => guard(async () => {
    const { booking } = await api.deletePayment(id)
    replaceBooking(booking)
  }), [guard])

  const setBookingStatus = useCallback((ref: string, status: BookingStatus) => guard(async () => {
    replaceBooking((await api.setBookingStatus(ref, status)).booking)
  }), [guard])

  // Rooms: show what the server stored. An older server doesn't send it back
  // and only saves the base rate and notes, so a capacity change is reported.
  const saveVillaOverride = useCallback(async (name: string, patch: RoomOverride) => {
    const res = await api.saveVillaOverride(name, patch)
    if (res.override) {
      const saved = res.override
      setData((d) => ({ ...d, villaOverrides: { ...d.villaOverrides, [name]: saved } }))
      return
    }
    const { minGuests, maxGuests, ...rest } = patch
    setData((d) => ({ ...d, villaOverrides: { ...d.villaOverrides, [name]: { ...d.villaOverrides[name], ...rest } } }))
    if (minGuests !== undefined || maxGuests !== undefined) {
      throw new Error("Base rate and notes were saved, but the capacity wasn't. The server needs the latest update (api/index.php and api/lib.php).")
    }
  }, [])

  /** Throws on failure (the form shows the message). Returns the new booking's ref. */
  const createBooking = useCallback(async (input: BookingWrite) => {
    const { ref, booking } = await api.createBooking(input)
    setData((d) => ({ ...d, bookings: [normalizeBooking(booking), ...d.bookings], invoice: { ...d.invoice, next: d.invoice.next + 1 } }))
    await load() // pull in linked expenses before the booking page opens
    return ref
  }, [load])

  /** Throws on failure (the form shows the message). */
  const updateBooking = useCallback(async (ref: string, fields: Partial<BookingWrite>) => {
    const { booking } = await api.updateBooking(ref, fields)
    setData((d) => ({ ...d, bookings: d.bookings.map((b) => (b.ref === ref ? normalizeBooking(booking) : b)) }))
    await load() // refresh payments/expenses (B2B commission) before the booking page opens
  }, [load])

  // ---- Change-sheet actions (throw on failure) ----
  const recordPayment = useCallback(async (ref: string, p: Omit<Payment, 'id'>) => {
    replaceBooking((await api.addPayment(ref, p)).booking)
  }, [])
  const checkIn = useCallback(async (ref: string) => { replaceBooking((await api.checkIn(ref)).booking) }, [])
  const checkOut = useCallback(async (ref: string) => { replaceBooking((await api.checkOut(ref)).booking) }, [])
  const cancelBooking = useCallback(async (ref: string, charge: number) => {
    replaceBooking((await api.cancelBooking(ref, charge)).booking)
  }, [])
  const addCharge = useCallback(async (ref: string, c: ChargeWrite) => { replaceBooking((await api.addCharge(ref, c)).booking) }, [])
  const addCharges = useCallback(async (ref: string, items: ChargeWrite[]) => { replaceBooking((await api.addCharges(ref, items)).booking) }, [])
  const updateCharge = useCallback(async (id: string, c: ChargeWrite) => { replaceBooking((await api.updateCharge(id, c)).booking) }, [])
  const deleteCharge = useCallback(async (id: string) => { replaceBooking((await api.deleteCharge(id)).booking) }, [])
  const collectCharges = useCallback(async (ref: string, p: { method: string; date: string; reference?: string }) => {
    replaceBooking((await api.collectCharges(ref, p)).booking)
  }, [])
  const saveSettings = useCallback(async <K extends SettingsKey>(key: K, value: AppSettings[K]) => {
    const { settings } = await api.saveSettings(key, value)
    setData((d) => ({ ...d, settings: { ...emptySettings(), ...settings } }))
  }, [])
  const setInventory = (inventory: InventoryData) => setData((d) => ({ ...d, inventory }))
  const addItem = useCallback(async (i: ItemWrite) => {
    const r = await api.addItem(i)
    setInventory(r.inventory)
    return r.item.id
  }, [])
  const updateItem = useCallback(async (id: string, i: Partial<ItemWrite>) => { setInventory((await api.updateItem(id, i)).inventory) }, [])
  const addPurchase = useCallback(async (p: PurchaseWrite) => {
    const r = await api.addPurchase(p)
    setData((d) => ({ ...d, inventory: r.inventory, expenses: r.expense ? [r.expense, ...d.expenses] : d.expenses }))
    return r.ref
  }, [])
  const addUsage = useCallback(async (u: UsageWrite) => {
    const r = await api.addUsage(u)
    setInventory(r.inventory)
    return r.ref
  }, [])
  const addAdjustment = useCallback(async (a: AdjustmentWrite) => {
    const r = await api.addAdjustment(a)
    setInventory(r.inventory)
    return r.ref
  }, [])
  const addReturn = useCallback(async (x: ReturnWrite) => {
    const r = await api.addReturn(x)
    setInventory(r.inventory)
    return r.ref
  }, [])
  const payPurchase = useCallback(async (ref: string, p: { date: string; amount: number; method: string }) => {
    setInventory((await api.payPurchase(ref, p)).inventory)
  }, [])
  const addRating = useCallback(async (r: RatingWrite) => {
    const { rating } = await api.addRating(r)
    setData((d) => ({ ...d, ratings: [rating, ...d.ratings] }))
    if (r.bookingRef) await load() // the booking's stay history gains a line
  }, [load])
  const updateRating = useCallback(async (id: string, r: Partial<RatingWrite>) => {
    const { rating } = await api.updateRating(id, r)
    setData((d) => ({ ...d, ratings: d.ratings.map((x) => (x.id === id ? rating : x)) }))
  }, [])
  const deleteRating = useCallback(async (id: string) => {
    const r = await api.deleteRating(id)
    setData((d) => ({ ...d, ratings: d.ratings.filter((x) => x.id !== id) }))
    if (r.booking) replaceBooking(r.booking) // the stay history records the deletion
  }, [])
  const feedbackLink = useCallback(async (ref: string) => {
    const r = await api.feedbackLink(ref)
    replaceBooking(r.booking)
    return r.token
  }, [])
  const renameRoom = useCallback(async (from: string, to: string) => {
    const r = await api.renameRoom(from, to)
    await load()
    return r.bookings
  }, [load])

  const deleteBooking = useCallback((ref: string) => guard(async () => {
    await api.deleteBooking(ref)
    // the server also removes the booking's B2B commission entries
    setData((d) => ({
      ...d,
      bookings: d.bookings.filter((b) => b.ref !== ref),
      expenses: d.expenses.filter((e) => !b2bRowsOf([e], ref).length),
    }))
  }), [guard])

  const clearError = useCallback(() => setError(null), [])

  // Every booking carries the B2B commission its partner collected externally, so balanceOf() is right everywhere
  const view = useMemo<AppData>(() => {
    const external = new Map<string, number>()
    for (const e of data.expenses) {
      if (e.category === B2B_CATEGORY && e.external && e.bookingRef) {
        const k = e.bookingRef.trim().toLowerCase()
        external.set(k, (external.get(k) ?? 0) + e.amount)
      }
    }
    if (external.size === 0) return data
    return { ...data, bookings: data.bookings.map((b) => ({ ...b, b2bExternal: external.get(b.ref.toLowerCase()) ?? 0 })) }
  }, [data])

  const value = useMemo<StoreValue>(() => ({
    data: view, loading, error, clearError, reload: load, refresh,
    addExpense, updateExpense, deleteExpense, addUser, updateUser, setUserActive, saveRoleRights, addRole,
    saveInvoice, createBooking, updateBooking, deleteBooking, addPayment, updatePayment, deletePayment, setBookingStatus, saveVillaOverride,
    recordPayment, checkIn, checkOut, cancelBooking, addCharge, addCharges, updateCharge, deleteCharge, collectCharges, saveSettings,
    addItem, updateItem, addPurchase, addUsage, addAdjustment, addReturn, payPurchase,
    addRating, updateRating, deleteRating, feedbackLink, renameRoom,
  }), [view, loading, error, clearError, load, refresh, addExpense, updateExpense, deleteExpense, addUser, updateUser, setUserActive, saveRoleRights, addRole, saveInvoice, createBooking, updateBooking, deleteBooking, addPayment, updatePayment, deletePayment, setBookingStatus, saveVillaOverride,
    recordPayment, checkIn, checkOut, cancelBooking, addCharge, addCharges, updateCharge, deleteCharge, collectCharges, saveSettings,
    addItem, updateItem, addPurchase, addUsage, addAdjustment, addReturn, payPurchase,
    addRating, updateRating, deleteRating, feedbackLink, renameRoom])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within a StoreProvider')
  return ctx
}

export function effectiveRate(villaName: string, data: AppData): number {
  const base = ROOMS.find((v) => v.name === villaName)?.baseRate ?? 0
  return data.villaOverrides[villaName]?.baseRate ?? base
}
export function roleMemberCount(data: AppData, roleName: string): number {
  return data.users.filter((u) => u.role === roleName).length
}
