import { useState, type FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { useStore } from '../../data/store'
import { INVENTORY_CATEGORIES, INVENTORY_UNITS, type InventoryItem } from '../../types'
import { fieldCls, labelCls, outlineBtnCls, solidBtnCls } from '../styles'
import { errMsg, FieldError, FormError, findDuplicateItem, fmtQty, num, withCurrent } from './shared'

/**
 * Add / edit an inventory item (Inventory Master). Editing never touches the quantity:
 * stock only changes through purchases, usage and stock adjustments.
 */
export function ItemFormModal({ item, onClose, onSaved }: { item?: InventoryItem; onClose: () => void; onSaved?: (id: string) => void }) {
  const { data, addItem, updateItem } = useStore()
  const toast = useToast()
  const editing = !!item
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState(item?.category ?? '')
  const [unit, setUnit] = useState(item?.unit ?? '')
  const [minStock, setMinStock] = useState(item ? String(item.minStock) : '')
  const [opening, setOpening] = useState('0')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const min = num(minStock)
    const open = num(opening)
    if (!name.trim()) errs.name = 'Enter the item name.'
    if (!category) errs.category = 'Select a category.'
    if (!unit) errs.unit = 'Select a unit.'
    if (!Number.isFinite(min) || min < 0) errs.minStock = 'Enter a minimum stock level of 0 or more.'
    if (!editing && (!Number.isFinite(open) || open < 0)) errs.opening = 'Enter an opening stock of 0 or more.'
    const dup = !errs.name && unit ? findDuplicateItem(data.inventory.items, name, unit, item?.id) : undefined
    if (dup) errs.name = dup.active ? `This item already exists (${dup.id}).` : `This item already exists (${dup.id}, inactive). Activate it instead.`
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      if (item) {
        await updateItem(item.id, { name: name.trim(), category, unit, minStock: min })
        toast.show('Item updated', `${item.id} · ${name.trim()}`)
        onSaved?.(item.id)
      } else {
        const id = await addItem({ name: name.trim(), category, unit, minStock: min, openingStock: open, active: true })
        toast.show('Item added', `${id} · ${name.trim()}`)
        onSaved?.(id)
      }
      onClose()
    } catch (err) {
      setFormError(errMsg(err))
      setSaving(false)
    }
  }

  const describe = (k: string) => (errors[k] ? `item-${k}-error` : undefined)

  return (
    <Modal title={editing ? 'Edit item' : 'Add new item'} subtitle={item ? `${item.id} · ${fmtQty(item.available)} ${item.unit} available` : undefined} onClose={onClose} size="lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="item-name" className={labelCls}>Item name*</label>
          <input
            id="item-name" className={fieldCls} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bath soap 75 g" autoFocus aria-invalid={!!errors.name} aria-describedby={describe('name')}
          />
          <FieldError id="item-name-error">{errors.name}</FieldError>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="item-category" className={labelCls}>Category*</label>
            <select id="item-category" className={fieldCls} value={category} onChange={(e) => setCategory(e.target.value)} aria-invalid={!!errors.category} aria-describedby={describe('category')}>
              <option value="">Select category</option>
              {withCurrent(INVENTORY_CATEGORIES, item?.category ?? '').map((c) => <option key={c}>{c}</option>)}
            </select>
            <FieldError id="item-category-error">{errors.category}</FieldError>
          </div>
          <div>
            <label htmlFor="item-unit" className={labelCls}>Unit*</label>
            <select id="item-unit" className={fieldCls} value={unit} onChange={(e) => setUnit(e.target.value)} aria-invalid={!!errors.unit} aria-describedby={describe('unit')}>
              <option value="">Select unit</option>
              {withCurrent(INVENTORY_UNITS, item?.unit ?? '').map((u) => <option key={u}>{u}</option>)}
            </select>
            <FieldError id="item-unit-error">{errors.unit}</FieldError>
          </div>
          <div>
            <label htmlFor="item-min" className={labelCls}>Minimum stock level*</label>
            <input
              id="item-min" type="number" min={0} step="any" inputMode="decimal" className={fieldCls} value={minStock}
              onChange={(e) => setMinStock(e.target.value)} placeholder="0" aria-invalid={!!errors.minStock} aria-describedby={describe('minStock')}
            />
            <FieldError id="item-minStock-error">{errors.minStock}</FieldError>
          </div>
          {!editing && (
            <div>
              <label htmlFor="item-opening" className={labelCls}>Opening stock</label>
              <input
                id="item-opening" type="number" min={0} step="any" inputMode="decimal" className={fieldCls} value={opening}
                onChange={(e) => setOpening(e.target.value)} aria-invalid={!!errors.opening} aria-describedby={describe('opening')}
              />
              <FieldError id="item-opening-error">{errors.opening}</FieldError>
            </div>
          )}
        </div>
        <p className="rounded-xl bg-sand px-4 py-3 text-sm text-slate-700">
          {editing
            ? 'The available quantity can’t be edited here. Record purchases with Add Stock, consumption with Record Usage, and physical corrections with Adjust stock on the item’s page.'
            : 'The Item ID is generated automatically. Opening stock is what you have on hand today; after this, stock changes only through purchases, usage and adjustments.'}
        </p>
        <FormError>{formError}</FormError>
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={outlineBtnCls}>Cancel</button>
          <button type="submit" disabled={saving} className={solidBtnCls}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add item'}</button>
        </div>
      </form>
    </Modal>
  )
}
