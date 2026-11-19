import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { InventoryItem } from '../../types'
import { fieldCls } from '../styles'
import { fmtQty } from './shared'

/**
 * Searchable item select (Add Stock / Record Usage / Return Items). Only the items passed in can be
 * picked; `disabledReason` greys an option out (already on another line, nothing available…);
 * `detail` replaces the quantity shown on the right ("12 Pcs" by default, "in use: 8" for returns).
 */
export function ItemCombobox({
  id, items, value, onChange, disabledReason, detail, emptyText = 'No active items yet.', invalid, describedBy,
}: {
  id: string
  items: InventoryItem[]
  value: string
  onChange: (itemId: string) => void
  disabledReason?: (i: InventoryItem) => string | undefined
  detail?: (i: InventoryItem) => string
  emptyText?: string
  invalid?: boolean
  describedBy?: string
}) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const selected = items.find((i) => i.id === value)

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase()
    const list = q ? items.filter((i) => `${i.name} ${i.id} ${i.category}`.toLowerCase().includes(q)) : items
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [items, text])

  const optionId = (i: InventoryItem) => `${listId}-${i.id}`

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  const activeId = open && matches[active] ? optionId(matches[active]) : undefined
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  function pick(i: InventoryItem) {
    if (disabledReason?.(i)) return
    onChange(i.id)
    setText('')
    setOpen(false)
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      else setActive((a) => Math.min(matches.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault()
        const m = matches[active]
        if (m) pick(m)
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation()
        setOpen(false)
        setText('')
      }
    } else if (e.key === 'Tab') {
      setOpen(false)
      setText('')
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        autoComplete="off"
        className={`${fieldCls} !pr-10 !pl-10 ${selected && !open ? 'placeholder:!text-slate-900' : ''}`}
        placeholder={selected ? `${selected.name} · ${selected.id}` : 'Search item by name or ID'}
        value={open ? text : ''}
        onFocus={() => { setOpen(true); setActive(0) }}
        onClick={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0) }}
        onKeyDown={onKey}
      />
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-slate-500" />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-30 max-h-72 overflow-y-auto rounded-2xl border border-[#e6e1d6] bg-white py-1.5 shadow-xl"
        >
          {matches.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">{items.length ? `No item matches “${text.trim()}”.` : emptyText}</li>
          )}
          {matches.map((i, idx) => {
            const reason = disabledReason?.(i)
            return (
              <li
                key={i.id}
                id={optionId(i)}
                role="option"
                aria-selected={i.id === value}
                aria-disabled={!!reason}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(idx)}
                onClick={() => pick(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 ${idx === active ? 'bg-sand' : ''} ${reason ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-[15px] ${i.id === value ? 'font-semibold' : 'font-medium'} text-dark`}>{i.name}</span>
                  <span className="block truncate text-[13px] text-slate-500">{i.id} · {i.category}</span>
                </span>
                <span className="nums shrink-0 text-right text-[13px] text-slate-500">
                  {reason ?? (detail ? detail(i) : `${fmtQty(i.available)} ${i.unit}`)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
