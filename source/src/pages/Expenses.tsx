import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { can, useAuth } from '../auth/AuthContext'
import { B2B_CATEGORY, useStore } from '../data/store'
import { commissionPaid, sourceType } from '../lib/booking'
import { ALL_ROOMS, bookingHasRoom, bookingRooms, FULL_PROPERTY, isFullProperty, ROOM_OPTIONS } from '../lib/config'
import { CATEGORY_PILL, EXPENSE_CATEGORIES } from '../lib/permissions'
import { fmtDate, formatINR, TODAY_ISO } from '../lib/format'
import { fieldAreaCls, fieldCls, labelCls, outlineBtnCls, refCardCls, solidBtnCls } from '../components/styles'
import { Modal } from '../components/ui/Modal'
import { PageTitle } from '../components/ui/PageTitle'
import { RoomChips } from '../components/config/RoomChips'
import { DeleteModal, ErrorNote, ModalActions, plural, sameName } from '../components/config/kit'
import type { AppData, Booking } from '../types'

/** Labels shown in the category select (the stored category stays the same). */
const CATEGORY_LABEL: Record<string, string> = { [B2B_CATEGORY]: 'B2B Payment (commission)' }
const DEFAULT_CATEGORY = EXPENSE_CATEGORIES.find((c) => c !== B2B_CATEGORY && c !== 'Inventory Purchase') ?? EXPENSE_CATEGORIES[0]
const BLANK = { date: TODAY_ISO, category: DEFAULT_CATEGORY, rooms: [] as string[], fullProperty: false, bookingRef: '', description: '', amount: '', external: false }
type ExpenseForm = typeof BLANK

const thCls = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'

// ---- B2B commission still to pay ------------------------------------------

interface PendingCommission { booking: Booking; agent: string; commission: number; paid: number; pending: number }

/** B2B bookings (not cancelled) whose commission is more than what has been paid / collected externally so far. */
function pendingCommissions(data: AppData): PendingCommission[] {
  const out: PendingCommission[] = []
  for (const b of data.bookings) {
    if (sourceType(b) !== 'B2B' || b.status === 'cancelled') continue
    const commission = b.commission ?? 0
    const paid = commissionPaid(data, b.ref)
    if (commission > paid) out.push({ booking: b, agent: b.sourceDetail?.trim() || 'Agent not set', commission, paid, pending: commission - paid })
  }
  return out.sort((a, b) => a.agent.localeCompare(b.agent) || a.booking.checkIn.localeCompare(b.booking.checkIn) || a.booking.ref.localeCompare(b.booking.ref))
}
const pendingLabel = (p: PendingCommission) => `${p.booking.ref} · ${p.booking.guest} · ${p.agent} · pending ${formatINR(p.pending)}`

/** Fill booking, room, amount and description from a pending commission. */
function fillFromPending(form: ExpenseForm, p: PendingCommission): ExpenseForm {
  const full = isFullProperty(p.booking.villa)
  return {
    ...form,
    bookingRef: p.booking.ref,
    rooms: full ? [] : bookingRooms(p.booking.villa),
    fullProperty: full,
    amount: String(p.pending),
    description: `B2B commission · ${p.agent} · ${p.booking.ref}`,
  }
}

/** "B2B collected externally": the partner collected the commission from the guest, so the resort doesn't pay it out. */
function ExternalCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#0b241e]" />
      <span>
        <span className="block text-[15px] font-medium text-dark">B2B collected externally</span>
        <span className="block text-sm text-slate-500">
          Tick if the partner collected this commission from the guest themselves. The resort then receives the booking total minus the commission,
          it isn't taken off again as an expense, and it counts as settled on the booking.
        </span>
      </span>
    </label>
  )
}

export function Expenses() {
  const { user } = useAuth()
  const { data, addExpense, updateExpense, deleteExpense } = useStore()
  const canEdit = can(user, 'edit_expenses')
  const [params, setParams] = useSearchParams()

  const [villa, setVilla] = useState(ALL_ROOMS)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK)
  const [agentFilter, setAgentFilter] = useState('')
  const [pickedRef, setPickedRef] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [delId, setDelId] = useState<string | null>(null)
  const delRow = delId ? data.expenses.find((x) => x.id === delId) : undefined

  const pending = useMemo(() => pendingCommissions(data), [data])
  const pendingTotal = pending.reduce((s, p) => s + p.pending, 0)
  const agents = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>()
    for (const p of pending) {
      const a = m.get(p.agent) ?? { count: 0, total: 0 }
      m.set(p.agent, { count: a.count + 1, total: a.total + p.pending })
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v }))
  }, [pending])
  const shownPending = agentFilter ? pending.filter((p) => p.agent === agentFilter) : pending

  const rows = useMemo(
    () => data.expenses.filter((e) => villa === ALL_ROOMS || bookingHasRoom(e.villa, villa)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.expenses, villa],
  )
  const total = rows.reduce((s, r) => s + r.amount, 0)
  // B2B commission is recorded here automatically: each B2B booking's unpaid commission shows as a Pending line
  // (booked on the booking date) until it is paid through B2B Payment
  const pendingRows = useMemo(
    () => pending.filter((p) => villa === ALL_ROOMS || bookingHasRoom(p.booking.villa, villa)),
    [pending, villa],
  )
  const pendingShown = pendingRows.reduce((s, p) => s + p.pending, 0)
  type Line = { kind: 'expense'; date: string; e: (typeof rows)[number] } | { kind: 'pending'; date: string; p: PendingCommission }
  const lines: Line[] = useMemo(() => [
    ...rows.map((e) => ({ kind: 'expense' as const, date: e.date, e })),
    ...pendingRows.map((p) => ({ kind: 'pending' as const, date: p.booking.createdAt || p.booking.checkIn, p })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [rows, pendingRows])

  const isB2b = form.category === B2B_CATEGORY
  const linked = isB2b && !editId && form.bookingRef.trim()
    ? data.bookings.find((b) => sameName(b.ref, form.bookingRef) && sourceType(b) === 'B2B')
    : undefined
  const linkedPending = linked ? pending.find((p) => p.booking.ref === linked.ref) : undefined
  const categories = EXPENSE_CATEGORIES.includes(form.category) ? EXPENSE_CATEGORIES : [...EXPENSE_CATEGORIES, form.category]

  function startAdd(b2b = false, ref?: string) {
    const base: ExpenseForm = { ...BLANK, date: TODAY_ISO, category: b2b ? B2B_CATEGORY : DEFAULT_CATEGORY }
    const p = ref ? pending.find((x) => sameName(x.booking.ref, ref)) : undefined
    setForm(p ? fillFromPending(base, p) : ref ? { ...base, bookingRef: ref } : base)
    setPickedRef(p?.booking.ref ?? '')
    setAgentFilter('')
    setErr('')
    setEditId(null)
    setOpen(true)
  }
  function startEdit(id: string) {
    const e = data.expenses.find((x) => x.id === id)
    if (!e) return
    const full = isFullProperty(e.villa)
    setForm({ date: e.date, category: e.category, rooms: full ? [] : bookingRooms(e.villa), fullProperty: full, bookingRef: e.bookingRef ?? '', description: e.description, amount: String(e.amount), external: !!e.external })
    setPickedRef('')
    setErr('')
    setEditId(id)
    setOpen(true)
  }
  function pick(ref: string) {
    setPickedRef(ref)
    const p = pending.find((x) => x.booking.ref === ref)
    if (p) setForm((f) => fillFromPending(f, p))
  }

  // /expenses?add=b2b(&ref=RE-00004) opens Add expense → B2B Payment (e.g. from a booking page)
  useEffect(() => {
    if (params.get('add') !== 'b2b') return
    if (canEdit) startAdd(true, params.get('ref') ?? undefined)
    setParams({}, { replace: true })
  }, [params]) // startAdd reads the current pending list; run only when the query changes

  async function save() {
    if (!form.date) { setErr('Pick a date.'); return }
    if (!form.fullProperty && form.rooms.length === 0) { setErr('Pick at least one room (or Full Property).'); return }
    const amount = Number(form.amount)
    if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) { setErr('Enter an amount more than ₹0.'); return }
    // Link to the booking's own ref when it matches one (in any letter case)
    const typed = form.bookingRef.trim()
    const bookingRef = data.bookings.find((b) => sameName(b.ref, typed))?.ref ?? typed
    // "collected externally" belongs to B2B commission entries; it is sent only when ticked, or to clear it
    const wasExternal = editId ? !!data.expenses.find((x) => x.id === editId)?.external : false
    const external = isB2b && form.external
    const fields = {
      date: form.date, category: form.category, villa: form.fullProperty ? FULL_PROPERTY : form.rooms.join(', '), bookingRef,
      description: form.description.trim(), amount: Math.round(amount),
      ...(external ? { external: true } : wasExternal ? { external: false } : {}),
    }
    setBusy(true)
    if (editId) await updateExpense(editId, fields)
    else await addExpense(fields)
    setBusy(false)
    setOpen(false)
    setEditId(null)
  }
  async function confirmDelete() {
    if (!delId) return
    setBusy(true)
    await deleteExpense(delId)
    setBusy(false)
    setDelId(null)
  }

  return (
    <>
      <PageTitle
        title="Expenses"
        subtitle={
          <>
            Total shown: <span className="nums font-semibold text-due">{formatINR(total)}</span>
            {pendingShown > 0 && <> · B2B commission pending: <span className="nums font-semibold text-due">{formatINR(pendingShown)}</span></>}
          </>
        }
        actions={
          <>
            <select value={villa} onChange={(e) => setVilla(e.target.value)} aria-label="Filter by room"
              className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 pr-9 text-[15px] text-dark focus:border-ink focus:ring-2 focus:ring-ink/20 focus:outline-none">
              <option>{ALL_ROOMS}</option>
              {ROOM_OPTIONS.map((v) => (<option key={v}>{v}</option>))}
            </select>
            {canEdit && <button type="button" onClick={() => startAdd()} className={solidBtnCls}><Plus size={17} /> Add expense</button>}
          </>
        }
      />

      <div className={`${refCardCls} mb-4 flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pending B2B commissions</div>
          {pending.length ? (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="nums font-display text-[28px] font-semibold leading-none text-due">{formatINR(pendingTotal)}</span>
              <span className="text-sm text-slate-500">{plural(pending.length, 'booking')} · {plural(agents.length, 'agent')}</span>
            </div>
          ) : (
            <div className="mt-1.5 text-[15px] text-slate-600">No B2B commission is waiting to be paid.</div>
          )}
        </div>
        {canEdit && pending.length > 0 && (
          <button type="button" onClick={() => startAdd(true)} className={outlineBtnCls}>Pay B2B commission</button>
        )}
      </div>

      <div className={`${refCardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[15px]">
            <thead className="border-b border-[#eee8dc]">
              <tr>
                <th scope="col" className={`${thCls} pl-5`}>Date</th><th scope="col" className={thCls}>Category</th><th scope="col" className={thCls}>Room</th>
                <th scope="col" className={thCls}>Booking</th><th scope="col" className={thCls}>Description</th>
                <th scope="col" className={`${thCls} text-right`}>Amount</th><th scope="col" className={`${thCls} pr-5`}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee8dc]">
              {lines.map((line) => {
                if (line.kind === 'pending') {
                  const p = line.p
                  return (
                    <tr key={`pending-${p.booking.ref}`} className="bg-due-soft/40">
                      <td className="nums py-3.5 pr-4 pl-5 whitespace-nowrap text-slate-600">{fmtDate(line.date)}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex flex-wrap gap-1.5">
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium ${CATEGORY_PILL[B2B_CATEGORY] ?? 'bg-slate-100 text-slate-600'}`}>{B2B_CATEGORY}</span>
                          <span className="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-0.5 text-[13px] font-medium text-amber-700">Pending</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{p.booking.villa}</td>
                      <td className="px-4 py-3.5"><Link to={`/bookings/${encodeURIComponent(p.booking.ref)}`} className="nums font-medium text-dark underline underline-offset-2 hover:text-ink-hover">{p.booking.ref}</Link></td>
                      <td className="px-4 py-3.5 text-slate-700">
                        B2B commission · {p.agent} · {p.booking.guest}
                        <span className="nums block text-[13px] text-slate-500">
                          Recorded automatically · commission {formatINR(p.commission)}{p.paid > 0 ? ` · paid ${formatINR(p.paid)}` : ''} · to pay {formatINR(p.pending)}
                        </span>
                      </td>
                      <td className="nums px-4 py-3.5 text-right font-semibold whitespace-nowrap text-amber-700">{formatINR(p.pending)}</td>
                      <td className="py-3.5 pr-5 pl-4 text-right">
                        {canEdit && (
                          <button type="button" onClick={() => startAdd(true, p.booking.ref)} className="whitespace-nowrap text-sm font-medium text-dark underline underline-offset-2 hover:text-ink-hover"
                            aria-label={`Pay B2B commission for ${p.booking.ref}`}>
                            Pay
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                }
                const r = line.e
                return (
                <tr key={r.id}>
                  <td className="nums py-3.5 pr-4 pl-5 whitespace-nowrap text-slate-600">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3.5"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium ${CATEGORY_PILL[r.category] ?? 'bg-slate-100 text-slate-600'}`}>{r.category}</span></td>
                  <td className="px-4 py-3.5 text-slate-700">{r.villa}</td>
                  <td className="px-4 py-3.5">{r.bookingRef ? <Link to={`/bookings/${encodeURIComponent(r.bookingRef)}`} className="nums font-medium text-dark underline underline-offset-2 hover:text-ink-hover">{r.bookingRef}</Link> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3.5 text-slate-700">
                    {r.sourceRef && (
                      <Link to={`/inventory/history?q=${encodeURIComponent(r.sourceRef)}`} title="Open in stock history"
                        className="nums mr-2 inline-flex rounded-full bg-sand px-2.5 py-0.5 text-[13px] font-medium text-dark underline-offset-2 hover:underline">
                        {r.sourceRef}
                      </Link>
                    )}
                    {r.description}
                    {r.external && <span className="ml-2 inline-flex rounded-full bg-violet-50 px-2.5 py-0.5 text-[13px] font-medium text-violet-700">collected externally</span>}
                  </td>
                  <td className="nums px-4 py-3.5 text-right font-semibold whitespace-nowrap text-due">{formatINR(r.amount)}</td>
                  <td className="py-3.5 pr-5 pl-4 text-right">
                    {canEdit && (r.sourceRef ? (
                      <span className="inline-flex text-slate-400" title={`Created by inventory purchase ${r.sourceRef}. It follows the purchase, so it can't be changed here.`}>
                        <Lock size={15} aria-label="Created by an inventory purchase" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-3">
                        <button type="button" onClick={() => startEdit(r.id)} className="text-slate-500 hover:text-dark" aria-label={`Edit expense of ${formatINR(r.amount)} on ${fmtDate(r.date)}`}><Pencil size={16} /></button>
                        <button type="button" onClick={() => setDelId(r.id)} className="text-slate-500 hover:text-red-700" aria-label={`Delete expense of ${formatINR(r.amount)} on ${fmtDate(r.date)}`}><Trash2 size={16} /></button>
                      </span>
                    ))}
                  </td>
                </tr>
                )
              })}
              {lines.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-[15px] text-slate-500">No expenses for this filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {open && canEdit && (
        <Modal title={editId ? 'Edit expense' : 'Add expense'} subtitle={isB2b && !editId ? 'B2B Payment' : undefined} size="lg" onClose={() => { if (!busy) setOpen(false) }}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>Category</span>
                <select value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value }); setPickedRef('') }} className={fieldCls}>
                  {categories.map((c) => (<option key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</option>))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Date</span>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={fieldCls} />
              </label>
            </div>

            {isB2b && !editId && (
              <div className="space-y-3 rounded-xl bg-sand p-4">
                <div className="text-[15px] font-semibold text-dark">Pending commissions</div>
                {pending.length === 0 ? (
                  <p className="text-sm text-slate-600">No booking has a B2B commission waiting to be paid. You can still record a payment and link it to a booking below.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
                      <label className="block min-w-0">
                        <span className={labelCls}>Agent</span>
                        <select value={agentFilter} onChange={(e) => { setAgentFilter(e.target.value); setPickedRef('') }} className={fieldCls}>
                          <option value="">All agents ({pending.length})</option>
                          {agents.map((a) => (<option key={a.name} value={a.name}>{a.name} ({a.count})</option>))}
                        </select>
                      </label>
                      <label className="block min-w-0">
                        <span className={labelCls}>Booking</span>
                        <select value={pickedRef} onChange={(e) => pick(e.target.value)} className={fieldCls}>
                          <option value="">Choose a booking…</option>
                          {(agentFilter ? [{ name: agentFilter }] : agents).map((a) => (
                            <optgroup key={a.name} label={a.name}>
                              {shownPending.filter((p) => p.agent === a.name).map((p) => (
                                <option key={p.booking.ref} value={p.booking.ref}>{pendingLabel(p)}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="text-sm text-slate-600">
                      {agentFilter
                        ? <>{agentFilter}: <span className="nums font-semibold text-due">{formatINR(shownPending.reduce((s, p) => s + p.pending, 0))}</span> pending on {plural(shownPending.length, 'booking')}.</>
                        : 'Picking a booking fills in the room, amount and description.'}
                    </p>
                  </>
                )}
              </div>
            )}

            <label className="block">
              <span className={labelCls}>Amount (₹)</span>
              <input type="number" inputMode="numeric" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className={fieldCls} />
              {linked && (
                <span className={`mt-1.5 block text-sm ${linkedPending && Number(form.amount) > linkedPending.pending ? 'text-due' : 'text-slate-500'}`}>
                  {linkedPending
                    ? <>Commission {formatINR(linkedPending.commission)} · paid {formatINR(linkedPending.paid)} · pending {formatINR(linkedPending.pending)}{Number(form.amount) > linkedPending.pending && ' — this is more than the pending amount.'}</>
                    : `No commission is pending for ${linked.ref}.`}
                </span>
              )}
            </label>

            <div>
              <span className={labelCls}>Rooms</span>
              <RoomChips rooms={form.rooms} fullProperty={form.fullProperty} fullHint="Shared across the whole property."
                onChange={(rooms, full) => setForm({ ...form, rooms, fullProperty: full })} />
            </div>

            <label className="block">
              <span className={labelCls}>Linked booking <span className="font-normal text-slate-400">(optional)</span></span>
              <input value={form.bookingRef} onChange={(e) => { setForm({ ...form, bookingRef: e.target.value }); setPickedRef('') }} placeholder="RE-00004" className={fieldCls} />
            </label>

            {isB2b && <ExternalCheck checked={form.external} onChange={(v) => setForm({ ...form, external: v })} />}

            <label className="block">
              <span className={labelCls}>Description</span>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldAreaCls} />
            </label>

            {err && <ErrorNote>{err}</ErrorNote>}
          </div>
          <ModalActions onCancel={() => setOpen(false)} onSave={save} saving={busy} label={editId ? 'Save changes' : isB2b ? 'Save B2B payment' : 'Save expense'} />
        </Modal>
      )}

      {delRow && (
        <DeleteModal title="Delete this expense?" name={`${delRow.category} · ${fmtDate(delRow.date)}`} error="" saving={busy}
          message={<>Remove the <span className="font-semibold text-dark">{delRow.category}</span> expense of{' '}
            <span className="nums font-semibold text-dark">{formatINR(delRow.amount)}</span> on {fmtDate(delRow.date)}{delRow.description ? <> ({delRow.description})</> : null}?</>}
          onCancel={() => setDelId(null)} onConfirm={confirmDelete} />
      )}
    </>
  )
}
