import { useState, type FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { ChoiceChips } from '../ui/Chips'
import { useToast } from '../ui/Toast'
import { useStore } from '../../data/store'
import { PAY_METHODS } from '../../lib/booking'
import { fmtDate, formatINR, TODAY_ISO } from '../../lib/format'
import type { StockPurchase } from '../../types'
import { capsLabelCls, fieldCls, labelCls, outlineBtnCls, solidBtnCls } from '../styles'
import { errMsg, FieldError, FormError, num, purchaseDue } from './shared'

type Method = (typeof PAY_METHODS)[number]

/** Pay a supplier later for an Unpaid / Partially Paid purchase (Inventory → Supplier dues). */
export function PayPurchaseModal({ purchase, onClose }: { purchase: StockPurchase; onClose: () => void }) {
  const { payPurchase } = useStore()
  const toast = useToast()
  const due = purchaseDue(purchase)
  const [amount, setAmount] = useState(String(due))
  const [date, setDate] = useState(TODAY_ISO)
  const [method, setMethod] = useState<Method | ''>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const supplier = (purchase.supplier ?? '').trim()
  const earlier = purchase.payments ?? []

  async function submit(e: FormEvent) {
    e.preventDefault()
    const a = num(amount)
    const errs: Record<string, string> = {}
    if (!Number.isFinite(a) || a <= 0) errs.amount = 'Enter the amount paid.'
    else if (a > due + 0.005) errs.amount = `The amount can’t be more than the ${formatINR(due)} due.`
    if (!date) errs.date = 'Choose the payment date.'
    else if (date > TODAY_ISO) errs.date = 'The payment date can’t be in the future.'
    else if (purchase.date && date < purchase.date) errs.date = `The payment can’t be before the purchase (${fmtDate(purchase.date)}).`
    if (!method) errs.method = 'Choose the payment method.'
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      await payPurchase(purchase.ref, { date, amount: Math.round(a * 100) / 100, method })
      toast.show('Supplier payment recorded', `${purchase.ref} · ${formatINR(a)} (${method})${supplier ? ` to ${supplier}` : ''}`)
      onClose()
    } catch (err) {
      setFormError(errMsg(err))
      setSaving(false)
    }
  }

  const close = () => { if (!saving) onClose() }

  return (
    <Modal title="Record supplier payment" subtitle={`${supplier || 'Supplier not named'} · ${purchase.ref}`} onClose={close}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="rounded-xl bg-sand px-4 py-3.5">
          <div className={`${capsLabelCls} !mb-1`}>Due to supplier</div>
          <div className="nums font-display text-[36px] font-semibold leading-tight text-due">{formatINR(due)}</div>
          <div className="nums text-sm text-slate-600">
            {formatINR(purchase.total)} total − {formatINR(purchase.paidAmount)} paid · purchased {fmtDate(purchase.date)}
          </div>
          {earlier.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-[#e0dbcf] pt-3 text-sm">
              {earlier.map((p, i) => (
                <li key={`${p.createdAt}-${i}`} className="flex justify-between gap-3">
                  <span className="text-slate-600">{fmtDate(p.date)} · {p.method}</span>
                  <span className="nums font-medium text-dark">{formatINR(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pp-amount" className={labelCls}>Amount*</label>
            <input
              id="pp-amount" type="number" min={0} max={due} step="any" inputMode="decimal" className={fieldCls} value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="₹0" disabled={saving}
              aria-invalid={!!errors.amount} aria-describedby={errors.amount ? 'pp-amount-error' : undefined}
            />
            <FieldError id="pp-amount-error">{errors.amount}</FieldError>
          </div>
          <div>
            <label htmlFor="pp-date" className={labelCls}>Payment date*</label>
            <input
              id="pp-date" type="date" min={purchase.date || undefined} max={TODAY_ISO} className={fieldCls} value={date}
              onChange={(e) => setDate(e.target.value)} disabled={saving}
              aria-invalid={!!errors.date} aria-describedby={errors.date ? 'pp-date-error' : undefined}
            />
            <FieldError id="pp-date-error">{errors.date}</FieldError>
          </div>
        </div>
        <div>
          <span className={capsLabelCls} id="pp-method-label">Payment method*</span>
          <div role="group" aria-labelledby="pp-method-label">
            <ChoiceChips options={PAY_METHODS} value={method} onChange={setMethod} small disabled={saving} />
          </div>
          <FieldError>{errors.method}</FieldError>
        </div>
        <p className="text-[13px] text-slate-500">
          The purchase was already recorded as an expense in full, so this payment only updates what is owed to the supplier.
        </p>
        <FormError>{formError}</FormError>
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} className={outlineBtnCls}>Cancel</button>
          <button type="submit" disabled={saving} className={solidBtnCls}>{saving ? 'Saving…' : 'Record payment'}</button>
        </div>
      </form>
    </Modal>
  )
}
