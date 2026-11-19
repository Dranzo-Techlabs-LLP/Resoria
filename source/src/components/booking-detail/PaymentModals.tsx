import { useState, type ReactNode } from 'react'
import { Modal } from '../ui/Modal'
import { ChoiceChips } from '../ui/Chips'
import { useToast } from '../ui/Toast'
import { useStore } from '../../data/store'
import { formatINR } from '../../lib/format'
import { PAY_METHODS, chargesDue, refundInfo, roomBalance, roomPaid, unpaidCharges } from '../../lib/booking'
import { capsLabelCls, fieldCls, labelCls } from '../styles'
import { advanceReceived, amountOf, chargesInOrder, todayISO } from './helpers'
import { FormError, MoneyInput, PopupActions, SandBox } from './parts'
import type { Booking } from '../../types'

type Method = (typeof PAY_METHODS)[number]
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)
const subtitleOf = (b: Booking) => `${b.guest} · ${b.ref}`

function MethodField({ label, value, onChange, disabled }: { label: string; value: Method | ''; onChange: (m: Method | '') => void; disabled: boolean }) {
  return (
    <div>
      <span className={capsLabelCls}>{label}</span>
      <ChoiceChips options={PAY_METHODS} value={value} onChange={onChange} small disabled={disabled} />
    </div>
  )
}

function DateField({ id, label, value, onChange, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <input id={id} type="date" className={fieldCls} value={value} max={todayISO()} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function ReferenceField({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>Reference <span className="font-normal text-slate-400">(optional)</span></label>
      <input id={id} className={fieldCls} value={value} disabled={disabled} placeholder="UPI / transaction / cheque no." onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/** Collect the room balance (in full or in part). */
export function CollectRemainingModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { recordPayment } = useStore()
  const toast = useToast()
  const balance = roomBalance(booking)
  const paid = roomPaid(booking)
  const [amount, setAmount] = useState(String(balance))
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState<Method | ''>('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const value = amountOf(amount)

  async function submit() {
    if (value < 1) { setError('Enter the amount received.'); return }
    if (value > balance) { setError(`The amount can't be more than the ${formatINR(balance)} balance.`); return }
    if (!date) { setError('Choose the payment date.'); return }
    if (!method) { setError('Choose the payment method.'); return }
    setBusy(true)
    setError('')
    try {
      await recordPayment(booking.ref, { date, amount: value, kind: 'payment', method, reference: reference.trim(), purpose: 'room' })
      toast.show('Payment recorded', `${formatINR(value)} (${method}) · ${subtitleOf(booking)}`)
      onClose()
    } catch (e) {
      setError(errText(e, 'Could not record the payment.'))
      setBusy(false)
    }
  }

  return (
    <Modal title="Collect remaining payment" subtitle={subtitleOf(booking)} onClose={() => { if (!busy) onClose() }}>
      <div className="space-y-4">
        <SandBox>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Remaining balance</div>
          <div className="nums mt-1 font-display text-[40px] font-semibold leading-tight text-dark">{formatINR(balance)}</div>
          <div className="nums text-sm text-slate-600">
            {formatINR(booking.total)} total − {formatINR(booking.total - balance)} {paid > 0 && paid === advanceReceived(booking) ? 'advance' : 'received'}
          </div>
        </SandBox>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="collect-amount">Amount</label>
            <MoneyInput id="collect-amount" value={amount} onChange={setAmount} disabled={busy} />
          </div>
          <DateField id="collect-date" label="Payment date" value={date} onChange={setDate} disabled={busy} />
        </div>
        <MethodField label="Payment method" value={method} onChange={setMethod} disabled={busy} />
        <ReferenceField id="collect-ref" value={reference} onChange={setReference} disabled={busy} />
        <FormError>{error}</FormError>
        <PopupActions onCancel={onClose} onSubmit={submit} label="Submit" busyLabel="Saving…" busy={busy} />
      </div>
    </Modal>
  )
}

/** Collect every unpaid additional expense in one payment (creates the Additional Expenses Bill). */
export function CollectExpensesModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { collectCharges } = useStore()
  const toast = useToast()
  const due = chargesDue(booking)
  const unpaidIds = new Set(unpaidCharges(booking).map((c) => c.id))
  const items = chargesInOrder(booking).filter((c) => unpaidIds.has(c.id))
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState<Method | ''>('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!date) { setError('Choose the payment date.'); return }
    if (!method) { setError('Choose the payment method.'); return }
    setBusy(true)
    setError('')
    try {
      await collectCharges(booking.ref, { method, date, reference: reference.trim() })
      toast.show('Other expenses collected', `${formatINR(due)} (${method}) · bill generated`)
      onClose()
    } catch (e) {
      setError(errText(e, 'Could not collect the expenses.'))
      setBusy(false)
    }
  }

  return (
    <Modal title="Collect other expenses" subtitle={subtitleOf(booking)} onClose={() => { if (!busy) onClose() }}>
      <div className="space-y-4">
        <SandBox>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Total pending expenses</div>
          <div className="nums mt-1 font-display text-[40px] font-semibold leading-tight text-dark">{formatINR(due)}</div>
          {items.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-[#e0dbcf] pt-3 text-sm">
              {items.map((c) => (
                <li key={c.id} className="flex justify-between gap-3">
                  <span className="min-w-0 text-slate-700">{c.item}{c.qty > 1 && <span className="text-slate-500"> × {c.qty}</span>}</span>
                  <span className="nums shrink-0 font-medium text-dark">{formatINR(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </SandBox>
        <DateField id="collect-exp-date" label="Payment date" value={date} onChange={setDate} disabled={busy} />
        <MethodField label="Payment method" value={method} onChange={setMethod} disabled={busy} />
        <ReferenceField id="collect-exp-ref" value={reference} onChange={setReference} disabled={busy} />
        <FormError>{error}</FormError>
        <PopupActions onCancel={onClose} onSubmit={submit} label="Collect payment" busyLabel="Collecting…" busy={busy} disabled={due <= 0} />
      </div>
    </Modal>
  )
}

/** Pay out the pending refund of a cancelled booking (in full or in part). */
export function RefundModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { recordPayment } = useStore()
  const toast = useToast()
  const info = refundInfo(booking)
  const [amount, setAmount] = useState(String(info.remaining))
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState<Method | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const value = amountOf(amount)

  async function submit() {
    if (value < 1) { setError('Enter the refund amount.'); return }
    if (value > info.remaining) { setError(`The refund can't be more than the ${formatINR(info.remaining)} refundable.`); return }
    if (!date) { setError('Choose the refund date.'); return }
    if (!method) { setError('Choose the refund payment method.'); return }
    setBusy(true)
    setError('')
    try {
      await recordPayment(booking.ref, { date, amount: value, kind: 'refund', method, purpose: 'room' })
      toast.show('Refund recorded', `${formatINR(value)} (${method}) · ${subtitleOf(booking)}`)
      onClose()
    } catch (e) {
      setError(errText(e, 'Could not record the refund.'))
      setBusy(false)
    }
  }

  const line = (label: string, v: ReactNode, cls = 'text-dark') => (
    <div className="flex justify-between gap-4 text-[15px]">
      <span className="text-slate-600">{label}</span>
      <span className={`nums font-semibold ${cls}`}>{v}</span>
    </div>
  )

  return (
    <Modal title="Refund payment" subtitle={subtitleOf(booking)} onClose={() => { if (!busy) onClose() }}>
      <div className="space-y-4">
        <SandBox className="space-y-2.5">
          {line('Original amount received', formatINR(info.received))}
          {line('Cancellation charges', formatINR(info.charge), 'text-due')}
          {info.refunded > 0 && line('Already refunded', formatINR(info.refunded))}
          <div className="flex justify-between gap-4 border-t border-[#e0dbcf] pt-2.5 text-[15px] font-semibold text-dark">
            <span>{info.refunded > 0 ? 'Remaining refundable' : 'Refundable amount'}</span>
            <span className="nums">{formatINR(info.remaining)}</span>
          </div>
        </SandBox>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="refund-amount">Refund amount</label>
            <MoneyInput id="refund-amount" value={amount} onChange={setAmount} disabled={busy} />
          </div>
          <DateField id="refund-date" label="Refund date" value={date} onChange={setDate} disabled={busy} />
        </div>
        <MethodField label="Refund payment method" value={method} onChange={setMethod} disabled={busy} />
        <FormError>{error}</FormError>
        <PopupActions onCancel={onClose} onSubmit={submit} label="Confirm refund" busyLabel="Saving…" busy={busy} disabled={info.remaining <= 0} />
      </div>
    </Modal>
  )
}

/** Small yes/no popup for Check-in, Check-out and Remove expense. The action throws on failure. */
export function ConfirmModal({
  title, subtitle, children, confirmLabel, busyLabel, danger = false, onConfirm, onClose,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  confirmLabel: string
  busyLabel: string
  danger?: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run() {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(errText(e, 'Something went wrong. Please try again.'))
      setBusy(false)
    }
  }
  return (
    <Modal title={title} subtitle={subtitle} onClose={() => { if (!busy) onClose() }}>
      <div className="space-y-4">
        <div className="text-[15px] leading-relaxed text-slate-600">{children}</div>
        <FormError>{error}</FormError>
        <PopupActions onCancel={onClose} onSubmit={run} label={confirmLabel} busyLabel={busyLabel} busy={busy} danger={danger} />
      </div>
    </Modal>
  )
}
