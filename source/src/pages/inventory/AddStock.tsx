import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Paperclip, Plus, X } from 'lucide-react'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { readFileUpload, type FileUpload, type PurchaseWrite } from '../../lib/api'
import { fmtDate, formatINR, TODAY_ISO } from '../../lib/format'
import type { InventoryItem } from '../../types'
import { PageTitle } from '../../components/ui/PageTitle'
import { ChoiceChips } from '../../components/ui/Chips'
import { Pill } from '../../components/ui/Pill'
import { useToast } from '../../components/ui/Toast'
import {
  bigPrimaryBtnCls, capsLabelCls, cardTitleCls, fieldCls, labelCls, linkCls, outlineBtnCls, refCardCls,
} from '../../components/styles'
import { ItemCombobox } from '../../components/inventory/ItemCombobox'
import { AutoField, errMsg, FieldError, FormError, fmtQty, num, SummaryRow } from '../../components/inventory/shared'

type PayStatus = PurchaseWrite['paymentStatus']
const PAY_STATUSES: readonly PayStatus[] = ['Paid', 'Unpaid', 'Partially Paid']

interface Line { key: number; itemId: string; qty: string; rate: string }

const round2 = (n: number) => Math.round(n * 100) / 100
function lineTotal(l: Line): number {
  const q = num(l.qty)
  const r = num(l.rate)
  return Number.isFinite(q) && Number.isFinite(r) && q > 0 && r > 0 ? round2(q * r) : 0
}

export function AddStock() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { data, addPurchase } = useStore()
  const toast = useToast()
  const canMaster = can(user, 'manage_config')

  const items = data.inventory.items
  const activeItems = useMemo(() => items.filter((i) => i.active), [items])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  // ?item=INV-0001 (from Stock Details) preselects the first line
  const preset = params.get('item') ?? ''
  const presetItem = activeItems.find((i) => i.id === preset)

  const seq = useRef(1)
  const [date, setDate] = useState(TODAY_ISO)
  const [supplier, setSupplier] = useState('')
  const [bill, setBill] = useState<FileUpload | null>(null)
  const [billError, setBillError] = useState('')
  const [lines, setLines] = useState<Line[]>(() => [{
    key: 0, itemId: presetItem?.id ?? '', qty: '', rate: presetItem?.lastRate ? String(presetItem.lastRate) : '',
  }])
  const [paid, setPaid] = useState('')
  const [statusChoice, setStatusChoice] = useState<PayStatus | ''>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const total = round2(lines.reduce((s, l) => s + lineTotal(l), 0))
  // Paid / Unpaid picked by hand keep the amount in step with the total
  const paidText = statusChoice === 'Paid' ? String(total) : statusChoice === 'Unpaid' ? '0' : paid
  const paidNum = paidText.trim() === '' ? 0 : Number(paidText)
  const suggested: PayStatus = !(paidNum > 0) ? 'Unpaid' : paidNum >= total ? 'Paid' : 'Partially Paid'
  const payStatus = statusChoice || suggested
  const balance = Math.max(0, round2(total - (Number.isFinite(paidNum) ? paidNum : 0)))

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  function pickItem(l: Line, itemId: string) {
    const it = byId.get(itemId)
    setLine(l.key, { itemId, rate: l.rate || (it?.lastRate ? String(it.lastRate) : '') })
  }
  function addLine() {
    const key = seq.current++
    setLines((ls) => [...ls, { key, itemId: '', qty: '', rate: '' }])
    setTimeout(() => document.getElementById(`line-${key}-item`)?.focus(), 0)
  }
  const removeLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key))

  async function onBill(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBillError('')
    try {
      setBill(await readFileUpload(file))
    } catch (err) {
      setBill(null)
      setBillError(errMsg(err))
    }
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!date) errs.date = 'Select the purchase date.'
    else if (date > TODAY_ISO) errs.date = 'The purchase date can’t be in the future.'
    for (const l of lines) {
      const it = byId.get(l.itemId)
      if (!it) errs[`${l.key}-item`] = 'Select an item.'
      else if (!it.active) errs[`${l.key}-item`] = 'This item is inactive. Pick an active item.'
      const q = num(l.qty)
      if (!Number.isFinite(q) || q <= 0) errs[`${l.key}-qty`] = 'Enter a quantity greater than 0.'
      const r = num(l.rate)
      if (!Number.isFinite(r) || r <= 0) errs[`${l.key}-rate`] = 'Enter a rate greater than 0.'
    }
    if (!Number.isFinite(paidNum) || paidNum < 0) errs.paid = 'Enter a paid amount of 0 or more.'
    else if (paidNum > total + 0.5) errs.paid = `The paid amount can’t be more than the total (${formatINR(total)}).`
    else if (payStatus === 'Paid' && Math.abs(paidNum - total) > 0.5) errs.paid = `For “Paid”, the paid amount must equal the total (${formatINR(total)}).`
    else if (payStatus === 'Unpaid' && paidNum > 0) errs.paid = 'For “Unpaid”, the paid amount must be 0.'
    else if (payStatus === 'Partially Paid' && (paidNum <= 0 || paidNum >= total)) errs.paid = `For “Partially Paid”, enter an amount between ₹0 and ${formatINR(total)}.`
    return errs
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) {
      setFormError('Please fix the highlighted fields.')
      return
    }
    setSaving(true)
    try {
      const ref = await addPurchase({
        date,
        supplier: supplier.trim(),
        paidAmount: payStatus === 'Paid' ? total : payStatus === 'Unpaid' ? 0 : paidNum,
        paymentStatus: payStatus,
        bill,
        lines: lines.map((l) => ({ itemId: l.itemId, qty: num(l.qty), rate: num(l.rate) })),
      })
      toast.show('Stock added', `${ref} · ${formatINR(total)} — expense recorded`)
      navigate(presetItem ? `/inventory/items/${encodeURIComponent(presetItem.id)}` : '/inventory')
    } catch (err) {
      setFormError(errMsg(err))
      setSaving(false)
    }
  }

  const fe = (k: string) => errors[k]
  const desc = (k: string) => (errors[k] ? `err-${k}` : undefined)
  const taken = (except: number) => new Set(lines.filter((l) => l.key !== except).map((l) => l.itemId))
  const back = presetItem
    ? { to: `/inventory/items/${encodeURIComponent(presetItem.id)}`, label: `Back to ${presetItem.name}` }
    : { to: '/inventory', label: 'Back to inventory' }

  return (
    <>
      <PageTitle back={back} title="Add Stock" subtitle="Record a purchase and add the quantity to stock" />

      <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* A · Purchase details */}
          <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="sec-purchase">
            <h2 id="sec-purchase" className={`${cardTitleCls} mb-4`}>A · Purchase details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pur-date" className={labelCls}>Purchase date*</label>
                <input
                  id="pur-date" type="date" max={TODAY_ISO} className={fieldCls} value={date}
                  onChange={(e) => setDate(e.target.value)} aria-invalid={!!fe('date')} aria-describedby={desc('date')}
                />
                <FieldError id="err-date">{fe('date')}</FieldError>
              </div>
              <div>
                <label htmlFor="pur-supplier" className={labelCls}>Supplier name</label>
                <input id="pur-supplier" className={fieldCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Kerala Hotel Supplies" />
              </div>
              <div className="sm:col-span-2">
                <span className={labelCls} id="pur-bill-label">Attach bill <span className="font-normal text-slate-500">(optional)</span></span>
                {bill ? (
                  <div className="flex h-11 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3.5">
                    <Paperclip size={16} aria-hidden className="shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-dark">{bill.name}</span>
                    <button type="button" onClick={() => setBill(null)} className={`${linkCls} text-sm`}>Remove</button>
                  </div>
                ) : (
                  <label className={`${outlineBtnCls} cursor-pointer focus-within:ring-2 focus-within:ring-ink/20`}>
                    <Paperclip size={16} aria-hidden /> Attach bill
                    <input type="file" accept="application/pdf,image/*" onChange={onBill} className="sr-only" aria-labelledby="pur-bill-label" />
                  </label>
                )}
                <FieldError>{billError}</FieldError>
                <p className="mt-1.5 text-[13px] text-slate-500">PDF or photo of the supplier bill, up to 5 MB.</p>
              </div>
            </div>
          </section>

          {/* B · Items */}
          <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="sec-items">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="sec-items" className={cardTitleCls}>B · Select inventory items</h2>
              <p className="text-sm text-slate-500">
                Item missing?{' '}
                {canMaster
                  ? <>Add it in <Link to="/configuration?tab=inventory" className={linkCls}>Configuration → Inventory Master</Link></>
                  : 'Ask an administrator to add it in Configuration → Inventory Master.'}
              </p>
            </div>
            {activeItems.length === 0 && (
              <p className="mb-4 rounded-xl bg-due-soft px-4 py-3 text-sm text-due">
                There are no active items yet. Items must be set up in Inventory Master before stock can be added.
              </p>
            )}

            <div className="space-y-4">
              {lines.map((l, idx) => {
                const it = byId.get(l.itemId)
                const used = taken(l.key)
                return (
                  <div key={l.key} className="rounded-xl border border-[#e6e1d6] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className={`${capsLabelCls} !mb-0`}>Item {idx + 1}</span>
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(l.key)} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-red-700" aria-label={`Remove item ${idx + 1}`}>
                          <X size={15} aria-hidden /> Remove
                        </button>
                      )}
                    </div>
                    <label htmlFor={`line-${l.key}-item`} className={labelCls}>Select existing item*</label>
                    <ItemCombobox
                      id={`line-${l.key}-item`}
                      items={activeItems}
                      value={l.itemId}
                      onChange={(id) => pickItem(l, id)}
                      disabledReason={(i: InventoryItem) => (used.has(i.id) ? 'Already added' : undefined)}
                      invalid={!!fe(`${l.key}-item`)}
                      describedBy={desc(`${l.key}-item`)}
                    />
                    <FieldError id={`err-${l.key}-item`}>{fe(`${l.key}-item`)}</FieldError>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <AutoField label="Item ID" value={it?.id} />
                      <AutoField label="Category" value={it?.category} />
                      <AutoField label="Current available" value={it ? fmtQty(it.available) : undefined} />
                      <AutoField label="Unit" value={it?.unit} />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div>
                        <label htmlFor={`line-${l.key}-qty`} className={labelCls}>Purchase quantity*</label>
                        <input
                          id={`line-${l.key}-qty`} type="number" min={0} step="any" inputMode="decimal" className={fieldCls}
                          value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} placeholder="0"
                          aria-invalid={!!fe(`${l.key}-qty`)} aria-describedby={desc(`${l.key}-qty`)}
                        />
                        <FieldError id={`err-${l.key}-qty`}>{fe(`${l.key}-qty`)}</FieldError>
                      </div>
                      <div>
                        <label htmlFor={`line-${l.key}-rate`} className={labelCls}>Rate per unit*</label>
                        <input
                          id={`line-${l.key}-rate`} type="number" min={0} step="any" inputMode="decimal" className={fieldCls}
                          value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} placeholder="₹0"
                          aria-invalid={!!fe(`${l.key}-rate`)} aria-describedby={desc(`${l.key}-rate`)}
                        />
                        <FieldError id={`err-${l.key}-rate`}>{fe(`${l.key}-rate`)}</FieldError>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <AutoField label="Total amount" value={formatINR(lineTotal(l))} tone="strong" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <button type="button" onClick={addLine} className={`${outlineBtnCls} mt-4`}>
              <Plus size={16} aria-hidden /> Add another item
            </button>
          </section>

          {/* C · Payment */}
          <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="sec-payment">
            <h2 id="sec-payment" className={`${cardTitleCls} mb-4`}>C · Payment details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <AutoField label="Total purchase amount" value={formatINR(total)} tone="strong" />
              <div>
                <label htmlFor="pur-paid" className={labelCls}>Paid amount</label>
                <input
                  id="pur-paid" type="number" min={0} step="any" inputMode="decimal" className={fieldCls} value={paidText}
                  onChange={(e) => { setPaid(e.target.value); setStatusChoice('') }} placeholder="₹0"
                  aria-invalid={!!fe('paid')} aria-describedby={desc('paid')}
                />
                <FieldError id="err-paid">{fe('paid')}</FieldError>
              </div>
            </div>
            <div className="mt-4">
              <span className={capsLabelCls} id="pur-status-label">Payment status <span className="normal-case tracking-normal font-normal">· suggested from the paid amount</span></span>
              <div role="group" aria-labelledby="pur-status-label">
                <ChoiceChips
                  options={PAY_STATUSES}
                  value={payStatus}
                  onChange={(v) => v && setStatusChoice(v)}
                />
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm text-slate-700">
              <strong className="font-semibold text-dark">One expense entry</strong> is created automatically for the whole purchase,
              with the same purchase reference (PUR-…) in Inventory and Expenses. Each item’s stock goes up by its purchase quantity.
            </p>
          </section>
        </div>

        {/* Summary */}
        <aside className={`${refCardCls} p-5 sm:p-6 lg:sticky lg:top-6`} aria-label="Purchase summary">
          <div className={capsLabelCls}>Purchase summary</div>
          <dl className="space-y-2.5 text-[15px]">
            <SummaryRow label="Date" value={date ? fmtDate(date) : '—'} />
            <SummaryRow label="Supplier" value={supplier.trim() || '—'} />
            <SummaryRow label="Items" value={String(lines.filter((l) => l.itemId).length)} />
          </dl>
          {lines.some((l) => l.itemId) && (
            <ul className="mt-3 space-y-1.5 border-t border-[#eeeae1] pt-3 text-sm">
              {lines.filter((l) => l.itemId).map((l) => {
                const it = byId.get(l.itemId)
                return (
                  <li key={l.key} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-slate-600">{it?.name} {num(l.qty) > 0 && <>× {fmtQty(num(l.qty))}</>}</span>
                    <span className="nums shrink-0 text-dark">{formatINR(lineTotal(l))}</span>
                  </li>
                )
              })}
            </ul>
          )}
          <dl className="mt-3 space-y-2.5 border-t border-[#eeeae1] pt-3 text-[15px]">
            <SummaryRow label="Total amount" value={formatINR(total)} />
            <SummaryRow label="Paid amount" value={formatINR(Number.isFinite(paidNum) ? paidNum : 0)} />
            <div className="flex items-center justify-between gap-3">
              <dt className="font-semibold text-dark">Balance</dt>
              <dd className={`nums font-display text-xl font-semibold ${balance > 0 ? 'text-due' : 'text-dark'}`}>{formatINR(balance)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-600">Payment status</dt>
              <dd><Pill tone={payStatus === 'Paid' ? 'green' : payStatus === 'Unpaid' ? 'red' : 'amber'}>{payStatus}</Pill></dd>
            </div>
          </dl>
          <div className="mt-5 space-y-3">
            <FormError>{formError}</FormError>
            <button type="submit" disabled={saving || activeItems.length === 0} className={bigPrimaryBtnCls}>
              {saving ? 'Saving…' : 'Save purchase'}
            </button>
          </div>
        </aside>
      </form>
    </>
  )
}
