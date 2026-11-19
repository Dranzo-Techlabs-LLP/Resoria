import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../ui/Modal'
import { ChoiceChips } from '../ui/Chips'
import { useToast } from '../ui/Toast'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { formatINR } from '../../lib/format'
import { fieldCls, labelCls } from '../styles'
import { amountOf, hallHoursOf, hallItemName, hoursLabel } from './helpers'
import { FormError, MoneyInput, PopupActions } from './parts'
import type { ChargeWrite } from '../../lib/api'
import type { Booking, BookingCharge, ChargeCategory } from '../../types'

const CATEGORIES: readonly ChargeCategory[] = ['Food', 'Conference Hall', 'Other Services']

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
 * Add an additional expense (Food / Conference Hall / Other Services) to an in-house booking,
 * or edit one that hasn't been collected yet (`charge`).
 */
export function ExpenseModal({ booking, charge, onClose }: { booking: Booking; charge?: BookingCharge; onClose: () => void }) {
  const { data, addCharge, updateCharge } = useStore()
  const toast = useToast()
  const editing = !!charge
  const was = (c: ChargeCategory) => (charge?.category === c ? charge : undefined)

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

  const [category, setCategory] = useState<ChargeCategory>(charge?.category ?? 'Food')
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
      if (charge) await updateCharge(charge.id, line)
      else await addCharge(booking.ref, line)
      toast.show(editing ? 'Expense updated' : 'Expense added', `${line.item}${line.qty > 1 ? ` × ${line.qty}` : ''} · ${formatINR(total)}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save the expense.')
      setBusy(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit expense' : 'Add expense'} subtitle={`${booking.guest} · ${booking.ref}`} onClose={() => { if (!busy) onClose() }}>
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
        {category === 'Food' && menu.length > 0 && !editing && (
          <p className="rounded-xl bg-sand px-3.5 py-2.5 text-sm text-slate-600">Add more food items as separate entries.</p>
        )}

        <FormError>{error}</FormError>
        <PopupActions
          onCancel={onClose}
          onSubmit={submit}
          label={editing ? 'Save changes' : 'Add item'}
          busyLabel="Saving…"
          busy={busy}
          disabled={unavailable}
        />
      </div>
    </Modal>
  )
}
