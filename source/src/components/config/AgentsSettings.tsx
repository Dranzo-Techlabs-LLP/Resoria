import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../../data/store'
import { sourceType } from '../../lib/booking'
import { formatINR } from '../../lib/format'
import { ChoiceChips } from '../ui/Chips'
import { Modal } from '../ui/Modal'
import { Pill } from '../ui/Pill'
import { fieldCls, labelCls, solidBtnCls } from '../styles'
import type { Agent } from '../../types'
import {
  ActiveCheck, DeleteModal, EmptyRow, ErrorNote, ListRow, ModalActions, ReadOnlyNote, RowList, SectionCard, newId, plural, rowBtnCls,
  sameName, useSaveState,
} from './kit'

const TYPE_LABELS = { percent: 'Percent of booking', flat: 'Flat per booking' } as const
const TYPE_OPTIONS = [TYPE_LABELS.percent, TYPE_LABELS.flat] as const
type TypeLabel = (typeof TYPE_OPTIONS)[number]

const BLANK = { name: '', phone: '', commissionType: 'percent' as Agent['commissionType'], commissionValue: '', active: true }

export function commissionText(a: Pick<Agent, 'commissionType' | 'commissionValue'>): string {
  return a.commissionType === 'percent' ? `${a.commissionValue}% of booking` : `${formatINR(a.commissionValue)} per booking`
}

/** Configuration → B2B agents: name, phone, commission (percent / flat), active. */
export function AgentsSettings({ canEdit }: { canEdit: boolean }) {
  const { data, saveSettings } = useStore()
  const agents = data.settings.agents
  const { run, saving, error, setError, saved } = useSaveState()
  const [editId, setEditId] = useState<string | null>(null) // '' while adding
  const [form, setForm] = useState(BLANK)
  const [confirmDelete, setConfirmDelete] = useState<Agent | null>(null)
  const modalOpen = editId !== null || !!confirmDelete

  const bookingsOf = (name: string) => data.bookings.filter((b) => sourceType(b) === 'B2B' && sameName(b.sourceDetail ?? '', name)).length
  const editing = editId ? agents.find((a) => a.id === editId) : undefined
  const editingUsed = editing ? bookingsOf(editing.name) : 0
  const persist = (next: Agent[]) => run(() => saveSettings('agents', next))

  function openAdd() {
    setError('')
    setForm(BLANK)
    setEditId('')
  }
  function openEdit(a: Agent) {
    setError('')
    setForm({ name: a.name, phone: a.phone ?? '', commissionType: a.commissionType, commissionValue: String(a.commissionValue), active: a.active })
    setEditId(a.id)
  }
  async function submit() {
    if (editId === null) return
    const name = form.name.trim().replace(/\s+/g, ' ')
    const phone = form.phone.trim()
    const value = Number(form.commissionValue)
    if (!name) { setError('Enter the agent name.'); return }
    if (name.length > 80) { setError('Keep the agent name under 80 characters.'); return }
    if (agents.some((a) => a.id !== editId && sameName(a.name, name))) { setError(`An agent called “${name}” already exists.`); return }
    if (phone && !/^\+?[\d\s-]{6,20}$/.test(phone)) { setError('Enter a valid phone number, or leave it blank.'); return }
    if (form.commissionValue.trim() === '' || !Number.isFinite(value) || value < 0) { setError('Enter a commission of 0 or more.'); return }
    if (form.commissionType === 'percent' && value > 100) { setError("A percent commission can't be more than 100%."); return }
    if (form.commissionType === 'flat' && !Number.isInteger(value)) { setError('Enter the flat commission in whole rupees.'); return }
    const row: Agent = {
      id: editId || newId(),
      name: editingUsed && editing ? editing.name : name,
      commissionType: form.commissionType,
      commissionValue: Math.round(value * 100) / 100,
      active: form.active,
      ...(phone ? { phone } : {}),
    }
    const next = editId ? agents.map((a) => (a.id === editId ? row : a)) : [...agents, row]
    if (await persist(next)) setEditId(null)
  }
  const toggle = (a: Agent) => persist(agents.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)))
  async function remove() {
    if (!confirmDelete) return
    if (await persist(agents.filter((x) => x.id !== confirmDelete.id))) setConfirmDelete(null)
  }

  return (
    <SectionCard
      title="B2B agents"
      description="Agents offered when a booking's source is B2B. A booking's commission is worked out from these settings when it is saved, and paid through Expenses → B2B Payment."
      saved={saved && !modalOpen}
      action={canEdit && <button type="button" onClick={openAdd} className={solidBtnCls}><Plus size={17} /> Add agent</button>}
    >
      {error && !modalOpen && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
      {agents.length === 0 ? (
        <EmptyRow>No B2B agents yet. Add the travel agents and partners who send you bookings.</EmptyRow>
      ) : (
        <RowList>
          {agents.map((a) => {
            const n = bookingsOf(a.name)
            return (
              <ListRow
                key={a.id}
                title={a.name}
                tag={a.active ? <Pill tone="green">Active</Pill> : <Pill tone="grey">Inactive</Pill>}
                meta={[commissionText(a), a.phone, n ? plural(n, 'booking') : 'No bookings yet'].filter(Boolean).join(' · ')}
                actions={canEdit && (
                  <>
                    <button type="button" onClick={() => openEdit(a)} disabled={saving} className={rowBtnCls()} aria-label={`Edit ${a.name}`}>Edit</button>
                    <button type="button" onClick={() => toggle(a)} disabled={saving} className={rowBtnCls()}>{a.active ? 'Deactivate' : 'Activate'}</button>
                    {n === 0 && (
                      <button type="button" onClick={() => { setError(''); setConfirmDelete(a) }} disabled={saving} className={rowBtnCls(true)} aria-label={`Delete ${a.name}`}>Delete</button>
                    )}
                  </>
                )}
              />
            )
          })}
        </RowList>
      )}
      {!canEdit && <ReadOnlyNote />}

      {editId !== null && (
        <Modal title={editId ? 'Edit agent' : 'Add agent'} subtitle={editing?.name} onClose={() => { if (!saving) setEditId(null) }}>
          <div className="space-y-4">
            <label className="block">
              <span className={labelCls}>Agent name <span className="text-red-600">*</span></span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!!editingUsed}
                placeholder="e.g. Nova Travels" maxLength={80} autoFocus className={fieldCls} />
              {!!editingUsed && (
                <span className="mt-1.5 block text-sm text-slate-500">Linked to {plural(editingUsed, 'booking')}, so the name stays as it is.</span>
              )}
            </label>
            <label className="block">
              <span className={labelCls}>Phone <span className="font-normal text-slate-400">(optional)</span></span>
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98765 43210" maxLength={20} className={fieldCls} />
            </label>
            <div>
              <span className={labelCls}>Commission type</span>
              <ChoiceChips<TypeLabel>
                small
                options={TYPE_OPTIONS}
                value={TYPE_LABELS[form.commissionType]}
                onChange={(v) => setForm({ ...form, commissionType: v === TYPE_LABELS.flat ? 'flat' : 'percent' })}
              />
            </div>
            <label className="block">
              <span className={labelCls}>{form.commissionType === 'percent' ? 'Commission (%)' : 'Commission per booking (₹)'} <span className="text-red-600">*</span></span>
              <input type="number" inputMode="decimal" min={0} max={form.commissionType === 'percent' ? 100 : undefined} step={form.commissionType === 'percent' ? 0.5 : 1}
                value={form.commissionValue} onChange={(e) => setForm({ ...form, commissionValue: e.target.value })}
                placeholder={form.commissionType === 'percent' ? '10' : '1000'} className={fieldCls} />
            </label>
            <ActiveCheck checked={form.active} onChange={(v) => setForm({ ...form, active: v })} hint="Only active agents can be picked on new bookings." />
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <ModalActions onCancel={() => setEditId(null)} onSave={submit} saving={saving} label={editId ? 'Save changes' : 'Add agent'} />
        </Modal>
      )}

      {confirmDelete && (
        <DeleteModal title="Delete agent?" name={confirmDelete.name} error={error} saving={saving}
          message={<><span className="font-semibold text-dark">{confirmDelete.name}</span> has no bookings and will be removed from the list.</>}
          onCancel={() => setConfirmDelete(null)} onConfirm={remove} />
      )}
    </SectionCard>
  )
}
