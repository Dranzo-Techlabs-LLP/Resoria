import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Pill } from '../ui/Pill'
import { fieldCls, labelCls, solidBtnCls } from '../styles'
import type { NamedOption } from '../../types'
import {
  ActiveCheck, DeleteModal, EmptyRow, ErrorNote, ListRow, ModalActions, ReadOnlyNote, RowList, SectionCard, newId, plural, rowBtnCls,
  sameName, useSaveState,
} from './kit'

/**
 * A plain list of names (OTA platforms, management referrers, inventory departments).
 * `persist` gets the whole new list and throws on failure. Without `hasActive` every row is active
 * and there is no Active toggle. A name that `usage` reports as in use can't be renamed or deleted
 * (only deactivated), so records that store the name keep pointing at it.
 */
export function NamedListSettings({
  title, description, noun, placeholder, emptyText, items, hasActive, canEdit, persist, usage, usageNoun = 'booking', activeHint,
}: {
  title: string
  description: string
  noun: string // "platform", "referrer", "department"
  placeholder: string
  emptyText: string
  items: NamedOption[]
  hasActive: boolean
  canEdit: boolean
  persist: (items: NamedOption[]) => Promise<void>
  usage?: (name: string) => number
  usageNoun?: string
  activeHint?: string
}) {
  const { run, saving, error, setError, saved } = useSaveState()
  const [editing, setEditing] = useState<NamedOption | null>(null) // { id: '' } while adding
  const [name, setName] = useState('')
  const [active, setActive] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<NamedOption | null>(null)
  const modalOpen = !!editing || !!confirmDelete
  const used = (n: string) => usage?.(n) ?? 0
  const editingUsed = editing && editing.id ? used(editing.name) : 0

  function openAdd() {
    setError('')
    setName('')
    setActive(true)
    setEditing({ id: '', name: '', active: true })
  }
  function openEdit(o: NamedOption) {
    setError('')
    setName(o.name)
    setActive(o.active)
    setEditing(o)
  }
  async function submit() {
    if (!editing) return
    const n = name.trim().replace(/\s+/g, ' ')
    if (!n) { setError(`Enter the ${noun} name.`); return }
    if (n.length > 80) { setError('Keep the name under 80 characters.'); return }
    if (items.some((o) => o.id !== editing.id && sameName(o.name, n))) { setError(`“${n}” is already in the list.`); return }
    const row: NamedOption = { id: editing.id || newId(), name: editingUsed ? editing.name : n, active: hasActive ? active : true }
    const next = editing.id ? items.map((o) => (o.id === editing.id ? row : o)) : [...items, row]
    if (await run(() => persist(next))) setEditing(null)
  }
  async function toggle(o: NamedOption) {
    await run(() => persist(items.map((x) => (x.id === o.id ? { ...x, active: !x.active } : x))))
  }
  async function remove() {
    if (!confirmDelete) return
    if (await run(() => persist(items.filter((x) => x.id !== confirmDelete.id)))) setConfirmDelete(null)
  }

  return (
    <SectionCard
      title={title}
      description={description}
      saved={saved && !modalOpen}
      action={canEdit && <button type="button" onClick={openAdd} className={solidBtnCls}><Plus size={17} /> Add {noun}</button>}
    >
      {error && !modalOpen && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
      {items.length === 0 ? (
        <EmptyRow>{emptyText}</EmptyRow>
      ) : (
        <RowList>
          {items.map((o) => {
            const n = used(o.name)
            return (
              <ListRow
                key={o.id}
                title={o.name}
                tag={hasActive && (o.active ? <Pill tone="green">Active</Pill> : <Pill tone="grey">Inactive</Pill>)}
                meta={usage ? (n ? `Used by ${plural(n, usageNoun)}` : `Not used yet`) : undefined}
                actions={canEdit && (
                  <>
                    <button type="button" onClick={() => openEdit(o)} disabled={saving} className={rowBtnCls()} aria-label={`Edit ${o.name}`}>Edit</button>
                    {hasActive && (
                      <button type="button" onClick={() => toggle(o)} disabled={saving} className={rowBtnCls()}>
                        {o.active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                    {n === 0 && (
                      <button type="button" onClick={() => { setError(''); setConfirmDelete(o) }} disabled={saving} className={rowBtnCls(true)} aria-label={`Delete ${o.name}`}>Delete</button>
                    )}
                  </>
                )}
              />
            )
          })}
        </RowList>
      )}
      {!canEdit && <ReadOnlyNote />}

      {editing && (
        <Modal title={editing.id ? `Edit ${noun}` : `Add ${noun}`} onClose={() => { if (!saving) setEditing(null) }}>
          <div className="space-y-4">
            <label className="block">
              <span className={labelCls}>Name <span className="text-red-600">*</span></span>
              <input value={editingUsed ? editing.name : name} onChange={(e) => setName(e.target.value)} disabled={!!editingUsed}
                placeholder={placeholder} maxLength={80} autoFocus className={fieldCls} />
              {!!editingUsed && (
                <span className="mt-1.5 block text-sm text-slate-500">Used by {plural(editingUsed, usageNoun)}, so the name stays as it is. Deactivate it instead to stop using it.</span>
              )}
            </label>
            {hasActive && <ActiveCheck checked={active} onChange={setActive} hint={activeHint ?? 'Inactive entries stay on older records but are no longer offered.'} />}
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <ModalActions onCancel={() => setEditing(null)} onSave={submit} saving={saving} label={editing.id ? 'Save changes' : `Add ${noun}`} />
        </Modal>
      )}

      {confirmDelete && (
        <DeleteModal title={`Delete ${noun}?`} name={confirmDelete.name} error={error} saving={saving}
          message={<><span className="font-semibold text-dark">{confirmDelete.name}</span> will be removed from the list.</>}
          onCancel={() => setConfirmDelete(null)} onConfirm={remove} />
      )}
    </SectionCard>
  )
}
