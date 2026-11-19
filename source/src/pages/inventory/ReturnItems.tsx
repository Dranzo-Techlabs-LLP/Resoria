import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { fmtDate, TODAY_ISO } from '../../lib/format'
import type { InventoryItem } from '../../types'
import { PageTitle } from '../../components/ui/PageTitle'
import { Pill } from '../../components/ui/Pill'
import { chipCls } from '../../components/ui/Chips'
import { useToast } from '../../components/ui/Toast'
import {
  bigPrimaryBtnCls, capsLabelCls, cardTitleCls, fieldAreaCls, fieldCls, labelCls, linkCls, outlineBtnCls, refCardCls,
} from '../../components/styles'
import { ItemCombobox } from '../../components/inventory/ItemCombobox'
import {
  AutoField, errMsg, FieldError, FormError, fmtQty, inUseByDepartment, num, rowBtnCls, SummaryRow, tableWrapCls, tdCls, tdNumCls,
  thCls, thNumCls, trCls, withCurrent,
} from '../../components/inventory/shared'

interface Line { key: number; itemId: string; returned: string; damaged: string }

/** '' counts as 0 (only one of the two quantities is usually filled in). */
const qtyOf = (s: string) => (s.trim() === '' ? 0 : num(s))
const UNASSIGNED = 'Unassigned'

/** Return issued reusable items (linen): good pieces go back to the store, damaged / lost ones are written off. */
export function ReturnItems() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { data, loading, addReturn } = useStore()
  const toast = useToast()
  const canMaster = can(user, 'manage_config')

  const { items, movements } = data.inventory
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const outByItem = useMemo(() => inUseByDepartment(movements), [movements])
  // Inactive items can still come back, so only "reusable with something out" matters here
  const returnable = useMemo(() => items.filter((i) => i.reusable && i.inUse > 0).sort((a, b) => a.name.localeCompare(b.name)), [items])
  const hasReusable = items.some((i) => i.reusable)
  const departments = useMemo(() => {
    let list = [...data.settings.departments]
    for (const depts of outByItem.values()) for (const d of depts.keys()) if (d !== UNASSIGNED) list = withCurrent(list, d)
    return list
  }, [data.settings.departments, outByItem])
  /** Departments holding an item, largest first. */
  const holders = (itemId: string) => [...(outByItem.get(itemId) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])

  // ?item=INV-0001 (from Stock Details) preselects the first line
  const presetItem = returnable.find((i) => i.id === (params.get('item') ?? ''))

  const seq = useRef(1)
  const [date, setDate] = useState(TODAY_ISO)
  const [department, setDepartment] = useState(() => {
    const own = presetItem ? holders(presetItem.id).filter(([d]) => d !== UNASSIGNED) : []
    return own.length === 1 ? own[0][0] : departments.length === 1 ? departments[0] : ''
  })
  const [lines, setLines] = useState<Line[]>(() => [{ key: 0, itemId: presetItem?.id ?? '', returned: '', damaged: '' }])
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deptFilter, setDeptFilter] = useState('')

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  function addLine(itemId = '') {
    const key = seq.current++
    setLines((ls) => [...ls, { key, itemId, returned: '', damaged: '' }])
    setTimeout(() => document.getElementById(itemId ? `line-${key}-returned` : `line-${key}-item`)?.focus(), 0)
  }
  const removeLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key))

  /** "Return" from the in-use table: fill the empty line or add one, and pick the department when only one holds it. */
  function startReturn(it: InventoryItem) {
    const existing = lines.find((l) => l.itemId === it.id)
    const empty = lines.find((l) => !l.itemId)
    if (!department) {
      const own = holders(it.id).filter(([d]) => d !== UNASSIGNED)
      if (filter && filter !== UNASSIGNED) setDepartment(filter)
      else if (own.length === 1) setDepartment(own[0][0])
    }
    if (existing || empty) {
      const key = (existing ?? empty)!.key
      if (!existing) setLine(key, { itemId: it.id })
      setTimeout(() => document.getElementById(`line-${key}-returned`)?.focus(), 0)
    } else {
      addLine(it.id)
    }
  }

  /** Live check: returned + damaged never more than what's in use. */
  function overLimit(l: Line, it?: InventoryItem): string {
    const r = qtyOf(l.returned)
    const d = qtyOf(l.damaged)
    if (!it || !Number.isFinite(r) || !Number.isFinite(d)) return ''
    return r + d > it.inUse ? `Only ${fmtQty(it.inUse)} ${it.unit} are in use.` : ''
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!date) errs.date = 'Select the return date.'
    else if (date > TODAY_ISO) errs.date = 'The return date can’t be in the future.'
    if (!department) errs.department = departments.length ? 'Select the department returning the items.' : 'Add a department in Configuration first.'
    for (const l of lines) {
      const it = byId.get(l.itemId)
      if (!it) errs[`${l.key}-item`] = 'Select an item.'
      else if (!it.reusable || it.inUse <= 0) errs[`${l.key}-item`] = 'Nothing of this item is in use.'
      const r = qtyOf(l.returned)
      const d = qtyOf(l.damaged)
      if (!Number.isFinite(r) || r < 0) errs[`${l.key}-returned`] = 'Enter 0 or more.'
      if (!Number.isFinite(d) || d < 0) errs[`${l.key}-damaged`] = 'Enter 0 or more.'
      if (!errs[`${l.key}-returned`] && !errs[`${l.key}-damaged`]) {
        if (r + d <= 0) errs[`${l.key}-returned`] = 'Enter how many came back, or how many are damaged / lost.'
        else if (overLimit(l, it)) errs[`${l.key}-returned`] = overLimit(l, it)
      }
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
      const payload = lines.map((l) => ({ itemId: l.itemId, returned: qtyOf(l.returned), damaged: qtyOf(l.damaged) }))
      const ref = await addReturn({ date, department, note: note.trim() || undefined, lines: payload })
      const back = payload.reduce((s, l) => s + l.returned, 0)
      const lost = payload.reduce((s, l) => s + l.damaged, 0)
      toast.show('Returned', `${ref} · ${department}: ${[back && `${fmtQty(back)} back in store`, lost && `${fmtQty(lost)} written off`].filter(Boolean).join(', ')}`)
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

  // In-use table (optionally narrowed to one department)
  const heldDepts = useMemo(() => {
    const set = new Set<string>()
    for (const depts of outByItem.values()) for (const [d, q] of depts) if (q > 0) set.add(d)
    return [...set].sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)))
  }, [outByItem])
  const filter = heldDepts.includes(deptFilter) ? deptFilter : ''
  const inUseRows = filter ? returnable.filter((i) => (outByItem.get(i.id)?.get(filter) ?? 0) > 0) : returnable

  return (
    <>
      <PageTitle back={back} title="Return Items" subtitle="Reusable linen coming back from a department" />

      <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* A · Return details */}
          <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="sec-return">
            <h2 id="sec-return" className={`${cardTitleCls} mb-4`}>A · Return details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ret-date" className={labelCls}>Return date*</label>
                <input
                  id="ret-date" type="date" max={TODAY_ISO} className={fieldCls} value={date}
                  onChange={(e) => setDate(e.target.value)} aria-invalid={!!fe('date')} aria-describedby={desc('date')}
                />
                <FieldError id="err-date">{fe('date')}</FieldError>
              </div>
              <div>
                <label htmlFor="ret-dept" className={labelCls}>Department*</label>
                <select
                  id="ret-dept" className={fieldCls} value={department} onChange={(e) => setDepartment(e.target.value)}
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
                No departments are set up yet, so returns can’t be recorded.{' '}
                {canMaster
                  ? <>Add them in <Link to="/configuration?tab=departments" className={linkCls}>Configuration → Departments</Link>.</>
                  : 'Ask an administrator to add them in Configuration → Departments.'}
              </p>
            )}
          </section>

          {/* B · Items */}
          <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="sec-items">
            <h2 id="sec-items" className={`${cardTitleCls} mb-4`}>B · Items returned</h2>
            {returnable.length === 0 && (
              <p className="mb-4 rounded-xl bg-due-soft px-4 py-3 text-sm text-due">
                {loading && !items.length ? 'Loading items…' : 'Nothing is in use right now. Reusable items appear here once they are issued with Record Usage.'}
              </p>
            )}
            <div className="space-y-4">
              {lines.map((l, idx) => {
                const it = byId.get(l.itemId)
                const used = taken(l.key)
                const r = qtyOf(l.returned)
                const d = qtyOf(l.damaged)
                const valid = Number.isFinite(r) && Number.isFinite(d) && r >= 0 && d >= 0
                const left = it && valid ? it.inUse - r - d : undefined
                const over = overLimit(l, it)
                const qtyErr = fe(`${l.key}-returned`) || over
                const held = it ? holders(it.id) : []
                const withDept = department ? (outByItem.get(l.itemId)?.get(department) ?? 0) : 0
                const fromOthers = !!it && !!department && valid && !over && r + d > withDept
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
                    <label htmlFor={`line-${l.key}-item`} className={labelCls}>Select issued item*</label>
                    <ItemCombobox
                      id={`line-${l.key}-item`}
                      items={returnable}
                      value={l.itemId}
                      onChange={(id) => setLine(l.key, { itemId: id })}
                      disabledReason={(i: InventoryItem) => (used.has(i.id) ? 'Already added' : undefined)}
                      detail={(i: InventoryItem) => `in use: ${fmtQty(i.inUse)} ${i.unit}`}
                      emptyText="Nothing is in use right now."
                      invalid={!!fe(`${l.key}-item`)}
                      describedBy={desc(`${l.key}-item`)}
                    />
                    <FieldError id={`err-${l.key}-item`}>{fe(`${l.key}-item`)}</FieldError>
                    {held.length > 0 && (
                      <p className="mt-1.5 text-[13px] text-slate-500">
                        With {held.map(([dep, q]) => `${dep} ${fmtQty(q)}`).join(' · ')}
                      </p>
                    )}

                    <div className="mt-3 grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
                      <AutoField label="In use" value={it ? `${fmtQty(it.inUse)} ${it.unit}` : undefined} />
                      <div>
                        <label htmlFor={`line-${l.key}-returned`} className={labelCls}>Returned (good)*</label>
                        <input
                          id={`line-${l.key}-returned`} type="number" min={0} max={it?.inUse} step="any" inputMode="decimal" className={fieldCls}
                          value={l.returned} onChange={(e) => setLine(l.key, { returned: e.target.value })} placeholder="0"
                          aria-invalid={!!qtyErr} aria-describedby={qtyErr ? `err-${l.key}-returned` : undefined}
                        />
                      </div>
                      <div>
                        <label htmlFor={`line-${l.key}-damaged`} className={labelCls}>Damaged / lost</label>
                        <input
                          id={`line-${l.key}-damaged`} type="number" min={0} step="any" inputMode="decimal" className={fieldCls}
                          value={l.damaged} onChange={(e) => setLine(l.key, { damaged: e.target.value })} placeholder="0"
                          aria-invalid={!!fe(`${l.key}-damaged`)} aria-describedby={fe(`${l.key}-damaged`) ? `err-${l.key}-damaged` : undefined}
                        />
                      </div>
                      <AutoField
                        label="Still in use"
                        value={left === undefined ? undefined : fmtQty(left)}
                        tone={left !== undefined && left < 0 ? 'bad' : 'strong'}
                      />
                    </div>
                    <FieldError id={`err-${l.key}-returned`}>{qtyErr}</FieldError>
                    <FieldError id={`err-${l.key}-damaged`}>{fe(`${l.key}-damaged`)}</FieldError>
                    {fromOthers && (
                      <p className="mt-1.5 text-[13px] text-due">
                        {withDept > 0 ? `Only ${fmtQty(withDept)} were issued to ${department}` : `None were issued to ${department}`} — the rest is taken off the other departments’ count.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            {returnable.length > lines.length && (
              <button type="button" onClick={() => addLine()} className={`${outlineBtnCls} mt-4`}>
                <Plus size={16} aria-hidden /> Add another item
              </button>
            )}

            <div className="mt-5">
              <label htmlFor="ret-note" className={labelCls}>Note <span className="font-normal text-slate-500">(optional)</span></label>
              <textarea id="ret-note" rows={2} className={fieldAreaCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 bath towels torn, 1 bedsheet stained beyond use" />
            </div>
          </section>
        </div>

        {/* Summary */}
        <aside className={`${refCardCls} p-5 sm:p-6 lg:sticky lg:top-6`} aria-label="Return summary">
          <div className={capsLabelCls}>Return summary</div>
          <dl className="space-y-2.5 text-[15px]">
            <SummaryRow label="Date" value={date ? fmtDate(date) : '—'} />
            <SummaryRow label="Department" value={department || '—'} />
            <SummaryRow label="Items" value={String(chosen.length)} />
          </dl>
          {chosen.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-[#eeeae1] pt-3 text-sm">
              {chosen.map((l) => {
                const it = byId.get(l.itemId)
                const r = qtyOf(l.returned)
                const d = qtyOf(l.damaged)
                return (
                  <li key={l.key}>
                    <div className="truncate text-slate-600">{it?.name}</div>
                    <div className="nums mt-0.5 flex flex-wrap gap-x-3 text-dark">
                      {Number.isFinite(r) && r > 0 && <span className="text-ok">+{fmtQty(r)} {it?.unit} to store</span>}
                      {Number.isFinite(d) && d > 0 && <span className="text-red-700">{fmtQty(d)} written off</span>}
                      {!(r > 0) && !(d > 0) && <span className="text-slate-400">—</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm text-slate-700">
            Good pieces go back into the store. Damaged or lost pieces are written off: they come off the in-use count and the store stays the same.
          </p>
          <div className="mt-5 space-y-3">
            <FormError>{formError}</FormError>
            <button type="submit" disabled={saving || !departments.length || returnable.length === 0} className={bigPrimaryBtnCls}>
              {saving ? 'Saving…' : 'Save return'}
            </button>
          </div>
        </aside>
      </form>

      {/* What's out right now */}
      <section className="mt-8" aria-labelledby="sec-out">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sec-out" className={cardTitleCls}>Currently in use</h2>
          <span className="text-sm text-slate-500">Issued with Record Usage and not yet returned or written off</span>
        </div>
        {heldDepts.length > 1 && (
          <div role="group" aria-label="Show items held by department" className="mb-3 flex flex-wrap gap-2">
            <button type="button" aria-pressed={!filter} onClick={() => setDeptFilter('')} className={chipCls(!filter, true)}>All departments</button>
            {heldDepts.map((d) => (
              <button key={d} type="button" aria-pressed={filter === d} onClick={() => setDeptFilter(d)} className={chipCls(filter === d, true)}>{d}</button>
            ))}
          </div>
        )}
        <div className={tableWrapCls}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={thCls}>Item</th>
                  {filter && <th scope="col" className={thNumCls}>With {filter}</th>}
                  <th scope="col" className={thNumCls}>{filter ? 'Total in use' : 'In use'}</th>
                  {!filter && <th scope="col" className={thCls}>By department</th>}
                  <th scope="col" className={thNumCls}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {inUseRows.map((i) => {
                  const held = holders(i.id)
                  return (
                    <tr key={i.id} className={trCls}>
                      <td className={tdCls}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/inventory/items/${encodeURIComponent(i.id)}`} className="font-semibold text-dark hover:underline">{i.name}</Link>
                          {!i.active && <Pill tone="grey">Inactive</Pill>}
                        </div>
                        <div className="mt-0.5 text-[13px] text-slate-500">{i.id} · {fmtQty(i.available)} {i.unit} in store</div>
                      </td>
                      {filter && <td className={`${tdNumCls} font-semibold`}>{fmtQty(outByItem.get(i.id)?.get(filter) ?? 0)} {i.unit}</td>}
                      <td className={`${tdNumCls} ${filter ? '' : 'font-semibold'}`}>{fmtQty(i.inUse)} {i.unit}</td>
                      {!filter && (
                        <td className={tdCls}>
                          <div className="flex flex-wrap gap-1.5">
                            {held.length
                              ? held.map(([d, q]) => <Pill key={d} tone="blue">{d} · {fmtQty(q)}</Pill>)
                              : <span className="text-slate-400">—</span>}
                          </div>
                        </td>
                      )}
                      <td className={`${tdCls} text-right`}>
                        <button type="button" onClick={() => startReturn(i)} className={rowBtnCls} aria-label={`Return ${i.name}`}>Return</button>
                      </td>
                    </tr>
                  )
                })}
                {inUseRows.length === 0 && (
                  <tr className={trCls}>
                    <td colSpan={4} className="px-4 py-12 text-center text-[15px] text-slate-500">
                      {loading && !items.length ? 'Loading…'
                        : hasReusable ? 'Nothing is in use right now — every issued piece has come back.'
                        : canMaster ? <>No reusable items yet. Tick “Reusable” on linen items in <Link to="/configuration?tab=inventory" className={linkCls}>Configuration → Inventory Master</Link>.</>
                        : 'No reusable items yet. An administrator can mark linen items as Reusable in Configuration → Inventory Master.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
