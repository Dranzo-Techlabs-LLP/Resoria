import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../../data/store'
import { formatINR } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { Pill } from '../ui/Pill'
import { fieldCls, labelCls, solidBtnCls } from '../styles'
import type { MenuItem } from '../../types'
import {
  ActiveCheck, DeleteModal, EmptyRow, ErrorNote, ListRow, ModalActions, ReadOnlyNote, RowList, SectionCard, newId, rowBtnCls, sameName,
  useSaveState, wholeNumber,
} from './kit'

const BLANK = { name: '', price: '', active: true }

/** Configuration → Restaurant menu: the items offered in a booking's Add expense → Food. */
export function MenuSettings({ canEdit }: { canEdit: boolean }) {
  const { data, saveSettings } = useStore()
  const items = data.settings.menuItems
  const { run, saving, error, setError, saved } = useSaveState()
  const [editId, setEditId] = useState<string | null>(null) // '' while adding
  const [form, setForm] = useState(BLANK)
  const [confirmDelete, setConfirmDelete] = useState<MenuItem | null>(null)
  const modalOpen = editId !== null || !!confirmDelete
  const persist = (next: MenuItem[]) => run(() => saveSettings('menuItems', next))

  function openAdd() {
    setError('')
    setForm(BLANK)
    setEditId('')
  }
  function openEdit(m: MenuItem) {
    setError('')
    setForm({ name: m.name, price: String(m.price), active: m.active })
    setEditId(m.id)
  }
  async function submit() {
    if (editId === null) return
    const name = form.name.trim().replace(/\s+/g, ' ')
    const price = wholeNumber(form.price)
    if (!name) { setError('Enter the item name.'); return }
    if (name.length > 80) { setError('Keep the item name under 80 characters.'); return }
    if (items.some((m) => m.id !== editId && sameName(m.name, name))) { setError(`“${name}” is already on the menu.`); return }
    if (price === null) { setError('Enter the price in whole rupees (₹0 or more).'); return }
    if (price > 1000000) { setError('Enter a price up to ₹10,00,000.'); return }
    const row: MenuItem = { id: editId || newId(), name, price, active: form.active }
    const next = editId ? items.map((m) => (m.id === editId ? row : m)) : [...items, row]
    if (await persist(next)) setEditId(null)
  }
  const toggle = (m: MenuItem) => persist(items.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)))
  async function remove() {
    if (!confirmDelete) return
    if (await persist(items.filter((x) => x.id !== confirmDelete.id))) setConfirmDelete(null)
  }

  return (
    <SectionCard
      title="Restaurant menu"
      description="Items and prices offered when staff add a Food expense to an in-house booking. Changing a price doesn't change expenses already added."
      saved={saved && !modalOpen}
      action={canEdit && <button type="button" onClick={openAdd} className={solidBtnCls}><Plus size={17} /> Add item</button>}
    >
      {error && !modalOpen && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
      {items.length === 0 ? (
        <EmptyRow>No menu items yet. Add dishes and drinks with their prices, e.g. Fried Rice · ₹300.</EmptyRow>
      ) : (
        <RowList>
          {items.map((m) => (
            <ListRow
              key={m.id}
              title={m.name}
              tag={m.active ? <Pill tone="green">Active</Pill> : <Pill tone="grey">Inactive</Pill>}
              meta={<span className="nums">{formatINR(m.price)}</span>}
              actions={canEdit && (
                <>
                  <button type="button" onClick={() => openEdit(m)} disabled={saving} className={rowBtnCls()} aria-label={`Edit ${m.name}`}>Edit</button>
                  <button type="button" onClick={() => toggle(m)} disabled={saving} className={rowBtnCls()}>{m.active ? 'Deactivate' : 'Activate'}</button>
                  <button type="button" onClick={() => { setError(''); setConfirmDelete(m) }} disabled={saving} className={rowBtnCls(true)} aria-label={`Delete ${m.name}`}>Delete</button>
                </>
              )}
            />
          ))}
        </RowList>
      )}
      {!canEdit && <ReadOnlyNote />}

      {editId !== null && (
        <Modal title={editId ? 'Edit menu item' : 'Add menu item'} onClose={() => { if (!saving) setEditId(null) }}>
          <div className="space-y-4">
            <label className="block">
              <span className={labelCls}>Item <span className="text-red-600">*</span></span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Fried Rice" maxLength={80} autoFocus className={fieldCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Price (₹) <span className="text-red-600">*</span></span>
              <input type="number" inputMode="numeric" min={0} step={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="300" className={fieldCls} />
            </label>
            <ActiveCheck checked={form.active} onChange={(v) => setForm({ ...form, active: v })} hint="Only active items appear in Add expense → Food." />
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <ModalActions onCancel={() => setEditId(null)} onSave={submit} saving={saving} label={editId ? 'Save changes' : 'Add item'} />
        </Modal>
      )}

      {confirmDelete && (
        <DeleteModal title="Delete menu item?" name={confirmDelete.name} error={error} saving={saving}
          message={<><span className="font-semibold text-dark">{confirmDelete.name}</span> will be removed from the menu. Expenses already added keep their item and price.</>}
          onCancel={() => setConfirmDelete(null)} onConfirm={remove} />
      )}
    </SectionCard>
  )
}
