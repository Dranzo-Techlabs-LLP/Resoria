import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { INVENTORY_CATEGORIES, type InventoryItem } from '../../types'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { fieldCls, linkCls, outlineBtnCls, outlineDangerBtnCls, solidBtnCls } from '../styles'
import { ItemFormModal } from './ItemFormModal'
import {
  ActivePill, errMsg, fmtQty, FormError, tableWrapCls, tdCls, tdNumCls, thCls, thNumCls, trCls, withCurrent,
} from './shared'

type StatusFilter = 'all' | 'active' | 'inactive'
const actionCls = 'text-sm font-medium text-dark underline underline-offset-2 hover:text-ink-hover disabled:cursor-not-allowed disabled:opacity-50'

/** Configuration → Inventory Master: the list of stock items (rendered inside the Configuration page). */
export function InventoryMaster() {
  const { user } = useAuth()
  const { data, loading, updateItem } = useStore()
  const toast = useToast()
  const canEdit = can(user, 'manage_config')

  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [modal, setModal] = useState<{ kind: 'add' } | { kind: 'edit' | 'deactivate'; item: InventoryItem } | null>(null)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const items = data.inventory.items
  const categories = useMemo(() => items.reduce<string[]>((l, i) => withCurrent(l, i.category), [...INVENTORY_CATEGORIES]), [items])
  const historyCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const mv of data.inventory.movements) m.set(mv.itemId, (m.get(mv.itemId) ?? 0) + 1)
    return m
  }, [data.inventory.movements])

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return items
      .filter((i) => (!query || `${i.name} ${i.id}`.toLowerCase().includes(query))
        && (!category || i.category === category)
        && (status === 'all' || (status === 'active') === i.active))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  }, [items, q, category, status])

  async function activate(i: InventoryItem) {
    setBusyId(i.id)
    setError('')
    try {
      await updateItem(i.id, { active: true })
      toast.show('Item activated', `${i.id} · ${i.name} can be used in Add Stock and Record Usage again`)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId('')
    }
  }

  const filtered = !!q.trim() || !!category || status !== 'all'

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={17} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by item name or item ID"
            aria-label="Search by item name or item ID" className={`${fieldCls} !pl-10`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:flex">
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className={`${fieldCls} lg:!w-48`}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Filter by status" className={`${fieldCls} lg:!w-40`}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {canEdit && (
          <button type="button" onClick={() => setModal({ kind: 'add' })} className={`${solidBtnCls} shrink-0`}>
            <Plus size={17} aria-hidden /> Add new item
          </button>
        )}
      </div>

      {error && <div className="mb-4"><FormError>{error}</FormError></div>}

      <div className={tableWrapCls}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={thCls}>Item ID</th>
                <th scope="col" className={thCls}>Item name</th>
                <th scope="col" className={thCls}>Category</th>
                <th scope="col" className={thCls}>Unit</th>
                <th scope="col" className={thNumCls}>Min stock level</th>
                <th scope="col" className={thCls}>Status</th>
                <th scope="col" className={thCls}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className={`${trCls} ${i.active ? '' : 'bg-[#faf9f6]'}`}>
                  <td className={`${tdCls} nums whitespace-nowrap text-slate-600`}>{i.id}</td>
                  <td className={tdCls}>
                    <div className={`font-semibold ${i.active ? 'text-dark' : 'text-slate-500'}`}>{i.name}</div>
                    <div className="mt-0.5 text-[13px] text-slate-500">{fmtQty(i.available)} {i.unit} in stock</div>
                  </td>
                  <td className={tdCls}>{i.category}</td>
                  <td className={tdCls}>{i.unit}</td>
                  <td className={tdNumCls}>{fmtQty(i.minStock)}</td>
                  <td className={tdCls}><ActivePill active={i.active} /></td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <Link to={`/inventory/items/${encodeURIComponent(i.id)}`} className={actionCls} aria-label={`View ${i.name}`}>View</Link>
                      {canEdit && (
                        <>
                          <button type="button" onClick={() => setModal({ kind: 'edit', item: i })} className={actionCls} aria-label={`Edit ${i.name}`}>Edit</button>
                          {i.active ? (
                            <button
                              type="button" onClick={() => setModal({ kind: 'deactivate', item: i })} aria-label={`Deactivate ${i.name}`}
                              className={`${actionCls} !text-red-700`}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button type="button" onClick={() => activate(i)} disabled={busyId === i.id} className={actionCls} aria-label={`Activate ${i.name}`}>
                              {busyId === i.id ? 'Activating…' : 'Activate'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr className={trCls}>
                  <td colSpan={7} className="px-4 py-14 text-center text-[15px] text-slate-500">
                    {loading && !items.length ? 'Loading items…'
                      : filtered ? <>No items match these filters. <button type="button" onClick={() => { setQ(''); setCategory(''); setStatus('all') }} className={linkCls}>Clear filters</button></>
                      : canEdit ? 'No inventory items yet. Use “Add new item” to set up the first one.'
                      : 'No inventory items yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">
        Items are never deleted, so their stock and transaction history stay intact. Deactivate an item to hide it from Add Stock and Record Usage.
      </p>

      {modal?.kind === 'add' && <ItemFormModal onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <ItemFormModal item={modal.item} onClose={() => setModal(null)} />}
      {modal?.kind === 'deactivate' && (
        <DeactivateModal item={modal.item} movements={historyCount.get(modal.item.id) ?? 0} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function DeactivateModal({ item, movements, onClose }: { item: InventoryItem; movements: number; onClose: () => void }) {
  const { updateItem } = useStore()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setSaving(true)
    setError('')
    try {
      await updateItem(item.id, { active: false })
      toast.show('Item deactivated', `${item.id} · ${item.name}`)
      onClose()
    } catch (e) {
      setError(errMsg(e))
      setSaving(false)
    }
  }

  return (
    <Modal title="Deactivate item?" subtitle={`${item.name} · ${item.id}`} onClose={onClose}>
      <div className="space-y-4 text-[15px] text-slate-700">
        <p>It will no longer appear in Add Stock or Record Usage. You can activate it again at any time.</p>
        <p className="rounded-xl bg-sand px-4 py-3 text-sm">
          The item and its history stay in the system
          {movements > 0 ? ` (${movements} stock ${movements === 1 ? 'movement' : 'movements'})` : ''}.
          {item.available > 0 && ` It still has ${fmtQty(item.available)} ${item.unit} in stock, so it stays visible (greyed) on the Inventory page until that stock is cleared with a stock adjustment.`}
        </p>
        <FormError>{error}</FormError>
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={outlineBtnCls}>Cancel</button>
          <button type="button" onClick={confirm} disabled={saving} className={outlineDangerBtnCls}>{saving ? 'Deactivating…' : 'Deactivate'}</button>
        </div>
      </div>
    </Modal>
  )
}
