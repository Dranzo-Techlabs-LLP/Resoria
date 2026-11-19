import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { fmtDate, TODAY_ISO } from '../../lib/format'
import type { InventoryItem } from '../../types'
import { PageTitle } from '../../components/ui/PageTitle'
import { useToast } from '../../components/ui/Toast'
import {
  bigPrimaryBtnCls, capsLabelCls, cardTitleCls, fieldAreaCls, fieldCls, labelCls, linkCls, outlineBtnCls, refCardCls,
} from '../../components/styles'
import { ItemCombobox } from '../../components/inventory/ItemCombobox'
import { AutoField, errMsg, FieldError, FormError, fmtQty, num, SummaryRow } from '../../components/inventory/shared'

interface Line { key: number; itemId: string; qty: string }

export function RecordUsage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { data, addUsage } = useStore()
  const toast = useToast()
  const canMaster = can(user, 'manage_config')

  const items = data.inventory.items
  const departments = data.settings.departments
  const activeItems = useMemo(() => items.filter((i) => i.active), [items])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  // ?item=INV-0001 (from Stock Details) preselects the first line
  const presetItem = activeItems.find((i) => i.id === (params.get('item') ?? ''))

  const seq = useRef(1)
  const [date, setDate] = useState(TODAY_ISO)
  const [department, setDepartment] = useState(() => (departments.length === 1 ? departments[0] : ''))
  const [lines, setLines] = useState<Line[]>(() => [{ key: 0, itemId: presetItem && presetItem.available > 0 ? presetItem.id : '', qty: '' }])
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  function addLine() {
    const key = seq.current++
    setLines((ls) => [...ls, { key, itemId: '', qty: '' }])
    setTimeout(() => document.getElementById(`line-${key}-item`)?.focus(), 0)
  }
  const removeLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key))

  /** Live check: never more than what's available. */
  function overLimit(l: Line, it?: InventoryItem): string {
    const q = num(l.qty)
    return it && Number.isFinite(q) && q > it.available ? `Only ${fmtQty(it.available)} ${it.unit} available.` : ''
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!date) errs.date = 'Select the usage date.'
    else if (date > TODAY_ISO) errs.date = 'The usage date can’t be in the future.'
    if (!department) errs.department = departments.length ? 'Select the department.' : 'Add a department in Configuration first.'
    for (const l of lines) {
      const it = byId.get(l.itemId)
      if (!it) errs[`${l.key}-item`] = 'Select an item.'
      else if (!it.active) errs[`${l.key}-item`] = 'This item is inactive. Pick an active item.'
      const q = num(l.qty)
      if (!Number.isFinite(q) || q <= 0) errs[`${l.key}-qty`] = 'Enter a quantity greater than 0.'
      else if (overLimit(l, it)) errs[`${l.key}-qty`] = overLimit(l, it)
    }
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
      const ref = await addUsage({
        date,
        department,
        note: note.trim() || undefined,
        lines: lines.map((l) => ({ itemId: l.itemId, qty: num(l.qty) })),
      })
      toast.show('Usage recorded', `${ref} · ${lines.length} ${lines.length === 1 ? 'item' : 'items'} issued to ${department}`)
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
  const chosen = lines.filter((l) => l.itemId)

  return (
    <>
      <PageTitle back={back} title="Record Usage" subtitle="Stock consumed or issued by a department" />

      <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* A · Usage details */}
          <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="sec-usage">
            <h2 id="sec-usage" className={`${cardTitleCls} mb-4`}>A · Usage details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="use-date" className={labelCls}>Usage date*</label>
                <input
                  id="use-date" type="date" max={TODAY_ISO} className={fieldCls} value={date}
                  onChange={(e) => setDate(e.target.value)} aria-invalid={!!fe('date')} aria-describedby={desc('date')}
                />
                <FieldError id="err-date">{fe('date')}</FieldError>
              </div>
              <div>
                <label htmlFor="use-dept" className={labelCls}>Department*</label>
                <select
                  id="use-dept" className={fieldCls} value={department} onChange={(e) => setDepartment(e.target.value)}
                  disabled={!departments.length} aria-invalid={!!fe('department')} aria-describedby={desc('department')}
                >
                  <option value="">{departments.length ? 'Select department' : 'No departments set up'}</option>
                  {departments.map((d) => <option key={d}>{d}</option>)}
                </select>
                <FieldError id="err-department">{fe('department')}</FieldError>
              </div>
            </div>
            {!departments.length && (
              <p className="mt-4 rounded-xl bg-due-soft px-4 py-3 text-sm text-due">
                No departments are set up yet, so usage can’t be recorded.{' '}
                {canMaster
                  ? <>Add them in <Link to="/configuration?tab=departments" className={linkCls}>Configuration → Departments</Link>.</>
                  : 'Ask an administrator to add them in Configuration → Departments.'}
              </p>
            )}
          </section>

          {/* B · Items */}
          <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="sec-items">
            <h2 id="sec-items" className={`${cardTitleCls} mb-4`}>B · Item details</h2>
            {activeItems.length === 0 && (
              <p className="mb-4 rounded-xl bg-due-soft px-4 py-3 text-sm text-due">There are no active items to issue yet.</p>
            )}
            <div className="space-y-4">
              {lines.map((l, idx) => {
                const it = byId.get(l.itemId)
                const used = taken(l.key)
                const q = num(l.qty)
                const remaining = it ? it.available - (Number.isFinite(q) && q > 0 ? q : 0) : undefined
                const over = overLimit(l, it)
                const qtyErr = fe(`${l.key}-qty`) || over
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
                    <label htmlFor={`line-${l.key}-item`} className={labelCls}>Select existing inventory item*</label>
                    <ItemCombobox
                      id={`line-${l.key}-item`}
                      items={activeItems}
                      value={l.itemId}
                      onChange={(id) => setLine(l.key, { itemId: id })}
                      disabledReason={(i: InventoryItem) => (used.has(i.id) ? 'Already added' : i.available <= 0 ? 'Out of stock' : undefined)}
                      invalid={!!fe(`${l.key}-item`)}
                      describedBy={desc(`${l.key}-item`)}
                    />
                    <FieldError id={`err-${l.key}-item`}>{fe(`${l.key}-item`)}</FieldError>

                    <div className="mt-3 grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
                      <AutoField label="Available qty" value={it ? fmtQty(it.available) : undefined} />
                      <AutoField label="Unit" value={it?.unit} />
                      <div>
                        <label htmlFor={`line-${l.key}-qty`} className={labelCls}>Quantity used / issued*</label>
                        <input
                          id={`line-${l.key}-qty`} type="number" min={0} max={it?.available} step="any" inputMode="decimal" className={fieldCls}
                          value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} placeholder="0"
                          aria-invalid={!!qtyErr} aria-describedby={qtyErr ? `err-${l.key}-qty` : undefined}
                        />
                      </div>
                      <AutoField
                        label="Remaining qty"
                        value={remaining === undefined ? undefined : fmtQty(remaining)}
                        tone={remaining !== undefined && remaining < 0 ? 'bad' : 'strong'}
                      />
                    </div>
                    <FieldError id={`err-${l.key}-qty`}>{qtyErr}</FieldError>
                  </div>
                )
              })}
            </div>
            <button type="button" onClick={addLine} className={`${outlineBtnCls} mt-4`}>
              <Plus size={16} aria-hidden /> Add another item
            </button>

            <div className="mt-5">
              <label htmlFor="use-note" className={labelCls}>Note <span className="font-normal text-slate-500">(optional)</span></label>
              <textarea id="use-note" rows={2} className={fieldAreaCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Room S3 deep cleaning" />
            </div>
          </section>
        </div>

        {/* Summary */}
        <aside className={`${refCardCls} p-5 sm:p-6 lg:sticky lg:top-6`} aria-label="Usage summary">
          <div className={capsLabelCls}>Usage summary</div>
          <dl className="space-y-2.5 text-[15px]">
            <SummaryRow label="Date" value={date ? fmtDate(date) : '—'} />
            <SummaryRow label="Department" value={department || '—'} />
            <SummaryRow label="Items" value={String(chosen.length)} />
          </dl>
          {chosen.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-[#eeeae1] pt-3 text-sm">
              {chosen.map((l) => {
                const it = byId.get(l.itemId)
                const q = num(l.qty)
                return (
                  <li key={l.key} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-slate-600">{it?.name}</span>
                    <span className="nums shrink-0 text-dark">{Number.isFinite(q) && q > 0 ? `−${fmtQty(q)} ${it?.unit ?? ''}` : '—'}</span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm text-slate-700">
            No expense is created for usage — the cost was already recorded as an expense when the stock was purchased.
          </p>
          <div className="mt-5 space-y-3">
            <FormError>{formError}</FormError>
            <button type="submit" disabled={saving || !departments.length || activeItems.length === 0} className={bigPrimaryBtnCls}>
              {saving ? 'Saving…' : 'Save usage'}
            </button>
            <p className="text-[13px] text-slate-500">Issue / return for reusable linen (towels, bedsheets) is coming later.</p>
          </div>
        </aside>
      </form>
    </>
  )
}
