import { useState, type FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { ChoiceChips } from '../ui/Chips'
import { useToast } from '../ui/Toast'
import { useStore } from '../../data/store'
import { TODAY_ISO } from '../../lib/format'
import type { InventoryItem } from '../../types'
import { capsLabelCls, fieldAreaCls, fieldCls, labelCls, outlineBtnCls, solidBtnCls } from '../styles'
import { errMsg, FieldError, FormError, fmtQty, fmtSigned, num } from './shared'

const DIRECTIONS = ['Add to stock (+)', 'Remove from stock (−)'] as const
type Direction = (typeof DIRECTIONS)[number]

/** Stock adjustment: the only way to correct the physical stock of an item (found, lost, damaged, count difference). */
export function AdjustStockModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { addAdjustment } = useStore()
  const toast = useToast()
  const [date, setDate] = useState(TODAY_ISO)
  const [dir, setDir] = useState<Direction>('Remove from stock (−)')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const q = num(qty)
  const signed = Number.isFinite(q) && q > 0 ? (dir === DIRECTIONS[0] ? q : -q) : 0
  const after = item.available + signed

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!date) errs.date = 'Select the adjustment date.'
    else if (date > TODAY_ISO) errs.date = 'The date can’t be in the future.'
    if (!Number.isFinite(q) || q <= 0) errs.qty = 'Enter a quantity greater than 0.'
    else if (after < 0) errs.qty = `Only ${fmtQty(item.available)} ${item.unit} available — the stock can’t go below 0.`
    if (!note.trim()) errs.note = 'Enter the reason for this adjustment.'
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const ref = await addAdjustment({ date, itemId: item.id, qty: signed, note: note.trim() })
      toast.show('Stock adjusted', `${ref} · ${item.name} ${fmtSigned(signed)} ${item.unit}`)
      onClose()
    } catch (err) {
      setFormError(errMsg(err))
      setSaving(false)
    }
  }

  return (
    <Modal title="Adjust stock" subtitle={`${item.name} · ${item.id}`} onClose={onClose} size="lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <span className={capsLabelCls}>Adjustment*</span>
          <ChoiceChips options={DIRECTIONS} value={dir} onChange={(v) => v && setDir(v)} small />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="adj-date" className={labelCls}>Date*</label>
            <input id="adj-date" type="date" max={TODAY_ISO} className={fieldCls} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} aria-describedby={errors.date ? 'adj-date-error' : undefined} />
            <FieldError id="adj-date-error">{errors.date}</FieldError>
          </div>
          <div>
            <label htmlFor="adj-qty" className={labelCls}>Quantity ({item.unit})*</label>
            <input
              id="adj-qty" type="number" min={0} step="any" inputMode="decimal" className={fieldCls} value={qty}
              onChange={(e) => setQty(e.target.value)} placeholder="0" aria-invalid={!!errors.qty} aria-describedby={errors.qty ? 'adj-qty-error' : undefined}
            />
            <FieldError id="adj-qty-error">{errors.qty}</FieldError>
          </div>
        </div>
        <div>
          <label htmlFor="adj-note" className={labelCls}>Reason*</label>
          <textarea
            id="adj-note" rows={2} className={fieldAreaCls} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Physical count difference, damaged, expired, found in store room"
            aria-invalid={!!errors.note} aria-describedby={errors.note ? 'adj-note-error' : undefined}
          />
          <FieldError id="adj-note-error">{errors.note}</FieldError>
        </div>
        <dl className="grid grid-cols-3 gap-3 rounded-xl bg-sand px-4 py-3 text-sm">
          <div>
            <dt className="text-slate-500">Current</dt>
            <dd className="nums mt-0.5 font-semibold text-dark">{fmtQty(item.available)} {item.unit}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Change</dt>
            <dd className={`nums mt-0.5 font-semibold ${signed < 0 ? 'text-red-700' : signed > 0 ? 'text-ok' : 'text-dark'}`}>{fmtSigned(signed)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">New balance</dt>
            <dd className={`nums mt-0.5 font-semibold ${after < 0 ? 'text-red-700' : 'text-dark'}`}>{fmtQty(after)} {item.unit}</dd>
          </div>
        </dl>
        <FormError>{formError}</FormError>
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={outlineBtnCls}>Cancel</button>
          <button type="submit" disabled={saving} className={solidBtnCls}>{saving ? 'Saving…' : 'Save adjustment'}</button>
        </div>
      </form>
    </Modal>
  )
}
