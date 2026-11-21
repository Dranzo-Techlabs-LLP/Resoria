import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, Search, X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { ChoiceChips } from '../ui/Chips'
import { useToast } from '../ui/Toast'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { formatINR } from '../../lib/format'
import { fieldCls, labelCls, outlineBtnCls } from '../styles'
import { amountOf, hallHoursOf, hallItemName, hoursLabel } from './helpers'
import { FormError, MoneyInput, PopupActions } from './parts'
import type { ChargeWrite } from '../../lib/api'
import type { Booking, BookingCharge, ChargeCategory } from '../../types'

const CATEGORIES: readonly ChargeCategory[] = ['Food', 'Conference Hall', 'Other Services']
const MAX_LINES = 50 // the server saves up to 50 items at a time
const MAX_QTY = 1000
const SEARCH_FROM = 7 // show the menu search box from this many items
const smallBtnCls = `${outlineBtnCls} !h-9 shrink-0 !gap-1.5 !px-3 !text-sm`
const stepBtnCls =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'

const itemsText = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`

/** "Not configured yet" note with a link to the right Configuration tab. */
function SetupHint({ what, tab, label }: { what: string; tab: string; label: string }) {
  const { user } = useAuth()
  return (
    <p className="rounded-xl bg-due-soft px-3.5 py-3 text-sm text-due">
      No {what} configured yet.{' '}
      {can(user, 'manage_config')
        ? <>Add them in <Link to={`/configuration?tab=${tab}`} className="font-semibold underline underline-offset-2">Configuration → {label}</Link>.</>
        : <>Ask an administrator to add them in Configuration → {label}.</>}
    </p>
  )
}

/**
 * Additional expenses of an in-house booking. Adding: build a list of items (food from the menu,
 * Conference Hall, other services) and save them together. Editing (`charge`): change one unpaid item.
 */
export function ExpenseModal({ booking, charge, onClose }: { booking: Booking; charge?: BookingCharge; onClose: () => void }) {
  return charge
    ? <EditExpenseModal booking={booking} charge={charge} onClose={onClose} />
    : <AddExpensesModal booking={booking} onClose={onClose} />
}

// ---- Add: menu list + added items -------------------------------------------

interface Line extends ChargeWrite {
  key: string
}

function AddExpensesModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { data, addCharges } = useStore()
  const toast = useToast()

  const menu = data.settings.menuItems.filter((m) => m.active).map((m) => ({ name: m.name, price: m.price }))
  const halls = data.settings.hallRates.filter((h) => h.hours > 0).map((h) => ({ hours: h.hours, price: h.price }))
  halls.sort((a, b) => a.hours - b.hours)

  const [category, setCategory] = useState<ChargeCategory>('Food')
  const [query, setQuery] = useState('')
  const [hours, setHours] = useState('')
  const [description, setDescription] = useState('')
  const [rate, setRate] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [seq, setSeq] = useState(0) // keys for hall / other lines (each one is its own line)
  const [addError, setAddError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const full = lines.length >= MAX_LINES
  const total = lines.reduce((s, l) => s + l.qty * l.rate, 0)
  const q = query.trim().toLowerCase()
  const shownMenu = q ? menu.filter((m) => m.name.toLowerCase().includes(q)) : menu
  const hall = halls.find((h) => String(h.hours) === hours)
  const qtyOf = (name: string) => lines.find((l) => l.key === `food:${name}`)?.qty ?? 0

  function addFood(name: string, price: number) {
    setError('')
    const key = `food:${name}`
    setLines((ls) => {
      if (ls.some((l) => l.key === key)) return ls.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l))
      if (ls.length >= MAX_LINES) return ls
      return [...ls, { key, category: 'Food', item: name, qty: 1, rate: price }]
    })
  }

  function addLine(line: ChargeWrite) {
    setError('')
    setLines((ls) => (ls.length >= MAX_LINES ? ls : [...ls, { ...line, key: `line:${seq}` }]))
    setSeq((n) => n + 1)
  }

  function addHall() {
    if (!hall) { setAddError('Choose the duration.'); return }
    setAddError('')
    addLine({ category: 'Conference Hall', item: hallItemName(hall.hours), qty: 1, rate: hall.price })
    setHours('')
  }

  function addOther() {
    const item = description.trim()
    const value = amountOf(rate)
    if (!item) { setAddError('Enter the service or expense name.'); return }
    if (value < 1) { setAddError('Enter the rate.'); return }
    setAddError('')
    addLine({ category: 'Other Services', item, qty: 1, rate: value })
    setDescription('')
    setRate('')
  }

  const setQty = (key: string, qty: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, qty)) } : l)))
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key))

  async function submit() {
    if (lines.length === 0 || busy) return
    setBusy(true)
    setError('')
    try {
      await addCharges(booking.ref, lines.map(({ category: c, item, qty, rate: r }) => ({ category: c, item, qty, rate: r })))
      const one = lines.length === 1 ? lines[0] : null
      const what = one ? `${one.item}${one.qty > 1 ? ` × ${one.qty}` : ''}` : itemsText(lines.length)
      toast.show('Expenses added', `${what} · ${formatINR(total)}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save the expenses.')
      setBusy(false)
    }
  }

  return (
    <Modal title="Add expense" subtitle={`${booking.guest} · ${booking.ref}`} size="lg" onClose={() => { if (!busy) onClose() }}>
      <div className="space-y-4">
        <ChoiceChips
          options={CATEGORIES}
          value={category}
          onChange={(v) => { if (v) { setCategory(v); setAddError('') } }}
          small
          disabled={busy}
        />

        {category === 'Food' && (menu.length === 0 ? <SetupHint what="menu items" tab="menu" label="Restaurant menu" /> : (
          <div>
            {menu.length >= SEARCH_FROM && (
              <div className="relative mb-2.5">
                <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search menu"
                  placeholder="Search menu"
                  className={`${fieldCls} !pl-10`}
                  value={query}
                  disabled={busy}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
            <ul aria-label="Menu" className="max-h-72 divide-y divide-[#efece4] overflow-y-auto rounded-xl border border-[#e6e1d6]">
              {shownMenu.map((m) => {
                const added = qtyOf(m.name)
                return (
                  <li key={m.name} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="break-words text-[15px] font-medium text-dark">{m.name}</div>
                      <div className="nums text-sm text-slate-500">
                        {formatINR(m.price)}{added > 0 && <span className="text-ok"> · {added} added</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addFood(m.name, m.price)}
                      disabled={busy || (full && added === 0) || added >= MAX_QTY}
                      className={smallBtnCls}
                      aria-label={`Add ${m.name}`}
                    >
                      <Plus size={15} aria-hidden /> Add
                    </button>
                  </li>
                )
              })}
              {shownMenu.length === 0 && (
                <li className="px-3.5 py-4 text-center text-sm text-slate-500">No menu items match “{query.trim()}”.</li>
              )}
            </ul>
          </div>
        ))}

        {category === 'Conference Hall' && (halls.length === 0 ? <SetupHint what="Conference Hall rates" tab="hall" label="Conference Hall" /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="exp-hours">Time / duration</label>
                <select id="exp-hours" className={fieldCls} value={hours} disabled={busy}
                  onChange={(e) => { setHours(e.target.value); setAddError('') }}>
                  <option value="">Select duration</option>
                  {halls.map((h) => (<option key={h.hours} value={String(h.hours)}>{hoursLabel(h.hours)}</option>))}
                </select>
              </div>
              {hall && (
                <div>
                  <label className={labelCls} htmlFor="exp-hall-rate">Rate (configured for duration)</label>
                  <input id="exp-hall-rate" className={`${fieldCls} nums`} value={formatINR(hall.price)} disabled readOnly />
                </div>
              )}
            </div>
            <button type="button" onClick={addHall} disabled={busy || full} className={smallBtnCls}
              aria-label={hall ? `Add ${hallItemName(hall.hours)}` : 'Add Conference Hall'}>
              <Plus size={15} aria-hidden /> Add
            </button>
          </div>
        ))}

        {category === 'Other Services' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
              <div>
                <label className={labelCls} htmlFor="exp-desc">Description</label>
                <input id="exp-desc" className={fieldCls} value={description} disabled={busy} maxLength={120}
                  placeholder="e.g. Extra bed linen" onChange={(e) => { setDescription(e.target.value); setAddError('') }} />
              </div>
              <div>
                <label className={labelCls} htmlFor="exp-rate">Rate (₹)</label>
                <MoneyInput id="exp-rate" value={rate} onChange={(v) => { setRate(v); setAddError('') }} disabled={busy} />
              </div>
            </div>
            <button type="button" onClick={addOther} disabled={busy || full} className={smallBtnCls}
              aria-label={description.trim() ? `Add ${description.trim()}` : 'Add service'}>
              <Plus size={15} aria-hidden /> Add
            </button>
          </div>
        )}

        {addError && <p role="alert" className="text-[13px] text-red-700">{addError}</p>}
        {full && <p className="text-[13px] text-slate-500">Up to {MAX_LINES} items can be saved at a time. Save these first, then add more.</p>}

        {lines.length > 0 && (
          <section aria-labelledby="exp-added-title" className="rounded-2xl bg-sand px-4 py-3.5">
            <h3 id="exp-added-title" className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Added items <span className="nums">({lines.length})</span>
            </h3>
            <ul className="mt-1 divide-y divide-[#e0dbcf]">
              {lines.map((l) => (
                <li key={l.key} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-words text-[15px] font-medium text-dark">{l.item}</div>
                      <div className="nums text-[13px] text-slate-500">{l.category} · {formatINR(l.rate)}{l.qty > 1 ? ' each' : ''}</div>
                    </div>
                    <button type="button" onClick={() => remove(l.key)} disabled={busy}
                      className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-red-700 disabled:opacity-40"
                      aria-label={`Remove ${l.item}`}>
                      <X size={16} aria-hidden />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {l.category === 'Food' ? (
                      <div className="flex items-center gap-2" role="group" aria-label={`Quantity of ${l.item}`}>
                        <button type="button" onClick={() => setQty(l.key, l.qty - 1)} disabled={busy || l.qty <= 1} className={stepBtnCls}
                          aria-label={`Decrease quantity of ${l.item}`}>
                          <Minus size={14} aria-hidden />
                        </button>
                        <span className="nums min-w-[2ch] text-center text-[15px] font-semibold text-dark" aria-live="polite">{l.qty}</span>
                        <button type="button" onClick={() => setQty(l.key, l.qty + 1)} disabled={busy || l.qty >= MAX_QTY} className={stepBtnCls}
                          aria-label={`Increase quantity of ${l.item}`}>
                          <Plus size={14} aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <span className="nums text-sm text-slate-500">Qty 1</span>
                    )}
                    <span className="nums text-[15px] font-semibold text-dark">{formatINR(l.qty * l.rate)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between border-t border-[#e0dbcf] pt-3">
              <span className="text-[15px] font-semibold text-dark">Total</span>
              <span className="nums font-display text-[26px] font-semibold text-dark">{formatINR(total)}</span>
            </div>
          </section>
        )}

        <FormError>{error}</FormError>
        <PopupActions
          onCancel={onClose}
          onSubmit={() => void submit()}
          label={lines.length > 0 ? `Save ${itemsText(lines.length)}` : 'Save items'}
          busyLabel="Saving…"
          busy={busy}
          disabled={lines.length === 0}
        />
      </div>
    </Modal>
  )
}

// ---- Edit one unpaid item ---------------------------------------------------

function EditExpenseModal({ booking, charge, onClose }: { booking: Booking; charge: BookingCharge; onClose: () => void }) {
  const { data, updateCharge } = useStore()
  const toast = useToast()
  const was = (c: ChargeCategory) => (charge.category === c ? charge : undefined)

  // Food: active menu items (plus the edited item if it has since left the menu)
  const menu = data.settings.menuItems.filter((m) => m.active).map((m) => ({ name: m.name, price: m.price }))
  const oldFood = was('Food')
  if (oldFood && !menu.some((m) => m.name === oldFood.item)) menu.unshift({ name: oldFood.item, price: oldFood.rate })
  // Conference Hall: configured durations (plus the edited one if it's no longer configured)
  const halls = data.settings.hallRates.filter((h) => h.hours > 0).map((h) => ({ hours: h.hours, price: h.price }))
  const oldHall = was('Conference Hall')
  const oldHours = oldHall ? hallHoursOf(oldHall.item) : null
  if (oldHall && oldHours && !halls.some((h) => h.hours === oldHours)) halls.push({ hours: oldHours, price: oldHall.rate })
  halls.sort((a, b) => a.hours - b.hours)
  const oldOther = was('Other Services')

  const [category, setCategory] = useState<ChargeCategory>(charge.category)
  const [food, setFood] = useState(oldFood?.item ?? menu[0]?.name ?? '')
  const [qty, setQty] = useState(String(oldFood?.qty ?? 1))
  const [hours, setHours] = useState(String(oldHours ?? halls[0]?.hours ?? ''))
  const [description, setDescription] = useState(oldOther?.item ?? '')
  const [rate, setRate] = useState(oldOther ? String(oldOther.rate) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Rates: an unchanged item keeps the rate it was charged at; otherwise the configured price
  const menuItem = menu.find((m) => m.name === food)
  const foodRate = oldFood && food === oldFood.item ? oldFood.rate : menuItem?.price ?? 0
  const foodQty = Math.max(0, Math.floor(Number(qty) || 0))
  const hall = halls.find((h) => String(h.hours) === hours)
  const hallRate = oldHall && hall && hall.hours === oldHours ? oldHall.rate : hall?.price ?? 0
  const otherRate = amountOf(rate)

  const line: ChargeWrite | null =
    category === 'Food' ? (menuItem ? { category, item: menuItem.name, qty: foodQty, rate: foodRate } : null)
    : category === 'Conference Hall' ? (hall ? { category, item: hallItemName(hall.hours), qty: 1, rate: hallRate } : null)
    : { category, item: description.trim(), qty: 1, rate: otherRate }
  const total = line ? line.qty * line.rate : 0
  const unavailable = (category === 'Food' && menu.length === 0) || (category === 'Conference Hall' && halls.length === 0)

  async function submit() {
    if (!line) { setError(category === 'Food' ? 'Choose a menu item.' : 'Choose the duration.'); return }
    if (category === 'Food' && line.qty < 1) { setError('Enter a quantity of at least 1.'); return }
    if (category === 'Other Services' && !line.item) { setError('Enter the service or expense name.'); return }
    if (category === 'Other Services' && line.rate < 1) { setError('Enter the rate.'); return }
    setBusy(true)
    setError('')
    try {
      await updateCharge(charge.id, line)
      toast.show('Expense updated', `${line.item}${line.qty > 1 ? ` × ${line.qty}` : ''} · ${formatINR(total)}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save the expense.')
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit expense" subtitle={`${booking.guest} · ${booking.ref}`} onClose={() => { if (!busy) onClose() }}>
      <div className="space-y-4">
        <ChoiceChips
          options={CATEGORIES}
          value={category}
          onChange={(v) => { if (v) { setCategory(v); setError('') } }}
          small
          disabled={busy}
        />

        {category === 'Food' && (menu.length === 0 ? <SetupHint what="menu items" tab="menu" label="Restaurant menu" /> : (
          <>
            <div>
              <label className={labelCls} htmlFor="exp-item">Item</label>
              <select id="exp-item" className={fieldCls} value={food} disabled={busy} onChange={(e) => setFood(e.target.value)}>
                {menu.map((m) => (<option key={m.name} value={m.name}>{m.name}</option>))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="exp-qty">Quantity</label>
                <input id="exp-qty" inputMode="numeric" className={`${fieldCls} nums`} value={qty} disabled={busy}
                  onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="exp-food-rate">Rate (from menu)</label>
                <input id="exp-food-rate" className={`${fieldCls} nums`} value={formatINR(foodRate)} disabled readOnly />
              </div>
            </div>
          </>
        ))}

        {category === 'Conference Hall' && (halls.length === 0 ? <SetupHint what="Conference Hall rates" tab="hall" label="Conference Hall" /> : (
          <>
            <div>
              <label className={labelCls} htmlFor="exp-hours">Time / duration</label>
              <select id="exp-hours" className={fieldCls} value={hours} disabled={busy} onChange={(e) => setHours(e.target.value)}>
                {halls.map((h) => (<option key={h.hours} value={String(h.hours)}>{hoursLabel(h.hours)}</option>))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="exp-hall-rate">Rate (configured for duration)</label>
              <input id="exp-hall-rate" className={`${fieldCls} nums`} value={formatINR(hallRate)} disabled readOnly />
            </div>
          </>
        ))}

        {category === 'Other Services' && (
          <>
            <div>
              <label className={labelCls} htmlFor="exp-desc">Description</label>
              <input id="exp-desc" className={fieldCls} value={description} disabled={busy} maxLength={120}
                placeholder="e.g. Extra bed linen" onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="exp-rate">Rate (₹)</label>
              <MoneyInput id="exp-rate" value={rate} onChange={setRate} disabled={busy} />
            </div>
          </>
        )}

        {!unavailable && (
          <div className="flex items-baseline justify-between border-t border-[#e6e1d6] pt-3">
            <span className="text-[15px] text-slate-600">Total</span>
            <span className="nums font-display text-[28px] font-semibold text-dark">{formatINR(total)}</span>
          </div>
        )}

        <FormError>{error}</FormError>
        <PopupActions
          onCancel={onClose}
          onSubmit={() => void submit()}
          label="Save changes"
          busyLabel="Saving…"
          busy={busy}
          disabled={unavailable}
        />
      </div>
    </Modal>
  )
}
