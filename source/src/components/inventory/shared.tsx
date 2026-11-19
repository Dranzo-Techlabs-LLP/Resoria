import { useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Paperclip } from 'lucide-react'
import { api, openFile } from '../../lib/api'
import { formatINR } from '../../lib/format'
import { Pill, type PillTone } from '../ui/Pill'
import { labelCls } from '../styles'
import type { InventoryItem, MovementType, StockMovement, StockPurchase } from '../../types'

// ------------------------------------------------------------------
//  Inventory module helpers (shared by the inventory pages + Inventory Master)
// ------------------------------------------------------------------

const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
/** 1,250 · 2.5 — quantities keep up to two decimals (Kg, Litre). */
export function fmtQty(n: number): string {
  return qtyFmt.format(n)
}
/** +12 / −3 / 0 */
export function fmtSigned(n: number): string {
  if (n > 0) return `+${fmtQty(n)}`
  if (n < 0) return `−${fmtQty(-n)}`
  return '0'
}

/** Parse a typed number; '' → NaN so required fields can be checked. */
export function num(s: string): number {
  return s.trim() === '' ? NaN : Number(s)
}

export function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.'
}

// ---- Stock status ----
export type StockStatus = 'in' | 'low' | 'out'
export const STOCK_STATUS_LABEL: Record<StockStatus, string> = { in: 'In Stock', low: 'Low Stock', out: 'Out of Stock' }
const STOCK_TONE: Record<StockStatus, PillTone> = { in: 'green', low: 'amber', out: 'red' }

/** Out of stock = nothing available; Low stock = at or below the minimum level. */
export function stockStatus(i: Pick<InventoryItem, 'available' | 'minStock'>): StockStatus {
  if (i.available <= 0) return 'out'
  if (i.available <= i.minStock) return 'low'
  return 'in'
}
export function StockStatusPill({ item }: { item: Pick<InventoryItem, 'available' | 'minStock'> }) {
  const s = stockStatus(item)
  return <Pill tone={STOCK_TONE[s]}>{STOCK_STATUS_LABEL[s]}</Pill>
}
export function ActivePill({ active }: { active: boolean }) {
  return <Pill tone={active ? 'green' : 'grey'}>{active ? 'Active' : 'Inactive'}</Pill>
}

/** Value of what the resort owns (in store + reusable items in use), at the last purchase rate. */
export function stockValue(i: Pick<InventoryItem, 'available' | 'inUse' | 'lastRate'>): number {
  return (Math.max(0, i.available) + Math.max(0, i.inUse || 0)) * (i.lastRate || 0)
}
export function ReusablePill() {
  return <Pill tone="blue">Reusable</Pill>
}

// ---- Movements ----
export const MOVEMENT_LABEL: Record<MovementType, string> = {
  in: 'Stock In', out: 'Stock Out', adjust: 'Adjustment', issue: 'Issue', return: 'Return', writeoff: 'Write-off',
}
const MOVEMENT_TONE: Record<MovementType, PillTone> = {
  in: 'green', out: 'blue', adjust: 'amber', issue: 'blue', return: 'green', writeoff: 'red',
}
export function MovementPill({ type }: { type: MovementType }) {
  return <Pill tone={MOVEMENT_TONE[type]}>{MOVEMENT_LABEL[type]}</Pill>
}
/**
 * Signed change a movement made to the STORE balance: +in / +return, −out / −issue,
 * adjustments are already signed, a write-off leaves the store unchanged (it reduces "in use").
 */
export function movementDelta(m: Pick<StockMovement, 'type' | 'qty'>): number {
  switch (m.type) {
    case 'in': case 'return': return Math.abs(m.qty)
    case 'out': case 'issue': return -Math.abs(m.qty)
    case 'writeoff': return 0
    default: return m.qty
  }
}
/** Quantity cell of a movement row: "+12", "−3", or "−2 (in use)" for a write-off. */
export function MovementQty({ m }: { m: Pick<StockMovement, 'type' | 'qty'> }) {
  if (m.type === 'writeoff') {
    return <span className="text-red-700">{fmtSigned(-Math.abs(m.qty))} <span className="font-normal text-slate-500">(in use)</span></span>
  }
  const d = movementDelta(m)
  return <span className={d > 0 ? 'text-ok' : d < 0 ? 'text-red-700' : ''}>{fmtSigned(d)}</span>
}
/** Second line under the movement pill: supplier (in), department (usage / issue / return / write-off), reason (adjust). */
export function movementDetail(m: StockMovement): string | undefined {
  if (m.type === 'in') return m.supplier
  if (m.type === 'adjust') return m.note
  return [m.department, m.note].filter(Boolean).join(' · ') || undefined
}

/**
 * Reusable items still out, per item and department. Issues are matched FIFO: a return / write-off
 * first settles the returning department's own issues, then the oldest issues of other departments
 * (linen often comes back through the laundry rather than the department it was issued to).
 */
export function inUseByDepartment(movements: StockMovement[]): Map<string, Map<string, number>> {
  const lots = new Map<string, { dept: string; qty: number }[]>()
  const ordered = movements
    .filter((m) => m.type === 'issue' || m.type === 'return' || m.type === 'writeoff')
    .sort((a, b) => -newestFirst(a, b))
  for (const m of ordered) {
    const list = lots.get(m.itemId) ?? []
    lots.set(m.itemId, list)
    const dept = m.department?.trim() || 'Unassigned'
    if (m.type === 'issue') {
      list.push({ dept, qty: Math.abs(m.qty) })
      continue
    }
    let left = Math.abs(m.qty)
    for (const own of [true, false]) {
      for (const lot of list) {
        if (left <= 0) break
        if ((lot.dept === dept) !== own || lot.qty <= 0) continue
        const take = Math.min(lot.qty, left)
        lot.qty -= take
        left -= take
      }
    }
  }
  const out = new Map<string, Map<string, number>>()
  for (const [itemId, list] of lots) {
    const byDept = new Map<string, number>()
    for (const lot of list) if (lot.qty > 0.0001) byDept.set(lot.dept, Math.round(((byDept.get(lot.dept) ?? 0) + lot.qty) * 100) / 100)
    if (byDept.size) out.set(itemId, byDept)
  }
  return out
}

// ---- Supplier dues ----
/** Still owed to the supplier for a purchase. */
export function purchaseDue(p: Pick<StockPurchase, 'total' | 'paidAmount'>): number {
  return Math.max(0, Math.round((p.total - (p.paidAmount || 0)) * 100) / 100)
}
export function isPurchaseDue(p: StockPurchase): boolean {
  return p.paymentStatus !== 'Paid' && purchaseDue(p) > 0
}
/** "Due ₹4,500" next to an unpaid / partly paid purchase reference. */
export function DuePill({ purchase }: { purchase?: StockPurchase }) {
  if (!purchase || !isPurchaseDue(purchase)) return null
  return <Pill tone="amber">Due {formatINR(purchaseDue(purchase))}</Pill>
}

/** Newest first: by transaction date, then by when it was recorded. */
export function newestFirst(a: StockMovement, b: StockMovement): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/** Options for a select: the standard list plus any legacy value already stored. */
export function withCurrent(list: readonly string[], current: string): string[] {
  return current && !list.includes(current) ? [...list, current] : [...list]
}
/** Same name (trimmed, case-insensitive) and same unit = duplicate item. */
export function findDuplicateItem(items: InventoryItem[], name: string, unit: string, exceptId?: string): InventoryItem | undefined {
  const n = name.trim().toLowerCase()
  const u = unit.trim().toLowerCase()
  return items.find((i) => i.id !== exceptId && i.name.trim().toLowerCase() === n && i.unit.trim().toLowerCase() === u)
}

// ---- Reference-style table ----
export const tableWrapCls = 'overflow-hidden rounded-2xl border border-[#e6e1d6] bg-white'
export const thCls = 'whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'
export const thNumCls = `${thCls} !text-right`
export const trCls = 'border-t border-[#eeeae1]'
export const tdCls = 'px-4 py-3.5 align-middle text-[15px] text-dark'
export const tdNumCls = `${tdCls} nums text-right`
/** Small outline button used inside table rows (Edit / View). */
export const rowBtnCls =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-dark transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
/** Inline error under a form / popup. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{children}</div>
}
/** Small field-level error text. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  if (!children) return null
  return <p id={id} className="mt-1.5 text-sm text-red-700">{children}</p>
}

export type SortDir = 'asc' | 'desc'
/** Clickable, accessible sortable column header. */
export function SortTh<K extends string>({
  label, k, sort, onSort, numeric = false,
}: {
  label: string
  k: K
  sort: { key: K; dir: SortDir }
  onSort: (k: K) => void
  numeric?: boolean
}) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={numeric ? thNumCls : thCls}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1.5 uppercase tracking-[0.12em] hover:text-dark ${active ? 'text-dark' : ''}`}
      >
        {label}
        <Icon size={13} aria-hidden className={active ? '' : 'opacity-50'} />
      </button>
    </th>
  )
}

/** Read-only, auto-filled value shown like a field (Item ID, Category, Remaining…). */
export function AutoField({ label, value, tone }: { label: string; value?: string; tone?: 'strong' | 'bad' }) {
  return (
    <div className="min-w-0">
      <div className={labelCls}>{label}</div>
      <div className={`nums flex h-11 items-center truncate rounded-xl px-3.5 text-[15px] ${
        tone === 'bad' ? 'bg-red-50 font-semibold text-red-700' : tone === 'strong' ? 'bg-sand font-semibold text-dark' : 'bg-sand text-slate-700'
      }`}
      >
        {value ?? <span className="font-normal text-slate-400">Auto-filled</span>}
      </div>
    </div>
  )
}

/** Label / value line of a summary card (inside a <dl>). */
export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="nums min-w-0 truncate text-right font-medium text-dark">{value}</dd>
    </div>
  )
}

/** Opens a purchase's attached supplier bill (protected file). */
export function BillLink({ purchaseRef }: { purchaseRef: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function open(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    setBusy(true)
    setError('')
    try {
      await openFile(api.billPath(purchaseRef))
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button" onClick={open} disabled={busy} aria-label={`Open the bill for ${purchaseRef}`}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-dark underline underline-offset-2 hover:text-ink-hover disabled:opacity-50"
      >
        <Paperclip size={12} aria-hidden /> {busy ? 'Opening…' : 'Bill'}
      </button>
      {error && <span role="alert" className="text-[12px] text-red-700">{error}</span>}
    </span>
  )
}
