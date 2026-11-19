import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { fmtStay, roomLabel, statusLabel } from '../../lib/booking'
import { fieldCls } from '../styles'
import type { Booking, Rating } from '../../types'
import { ratingsOf } from './utils'

/**
 * Searchable booking select (completed and in-house stays) for linking a rating to a stay.
 * Search by guest, booking ref, phone or room. Clearing it leaves the rating unlinked.
 */
export function BookingPicker({
  id, bookings, ratings, value, onChange, describedBy,
}: {
  id: string
  bookings: Booking[]
  ratings: Rating[]
  value: string // booking ref, '' = none
  onChange: (b: Booking | null) => void
  describedBy?: string
}) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const selected = bookings.find((b) => b.ref === value)

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase()
    const list = q
      ? bookings.filter((b) => `${b.guest} ${b.ref} ${b.phone} ${b.villa}`.toLowerCase().includes(q))
      : bookings
    return list.slice(0, 50)
  }, [bookings, text])

  const optionId = (b: Booking) => `${listId}-${b.id}`
  const activeId = open && matches[active] ? optionId(matches[active]) : undefined

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  function pick(b: Booking) {
    onChange(b)
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
        // keep the popup open: only close the list
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
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
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-describedby={describedBy}
        autoComplete="off"
        className={`${fieldCls} !pr-10 !pl-10 ${selected && !open ? 'placeholder:!text-slate-900' : ''}`}
        placeholder={selected ? `${selected.guest} · ${selected.ref}` : 'Search guest, booking ID or room'}
        value={open ? text : ''}
        onFocus={() => { setOpen(true); setActive(0) }}
        onClick={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0) }}
        onKeyDown={onKey}
      />
      {selected && !open ? (
        <button
          type="button"
          onClick={() => { onChange(null); inputRef.current?.focus() }}
          className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="Remove the linked booking"
        >
          <X size={16} />
        </button>
      ) : (
        <ChevronDown size={16} aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-slate-500" />
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-30 max-h-72 overflow-y-auto rounded-2xl border border-[#e6e1d6] bg-white py-1.5 shadow-xl"
        >
          {matches.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">
              {bookings.length ? `No in-house or completed booking matches “${text.trim()}”.` : 'No in-house or completed bookings yet.'}
            </li>
          )}
          {matches.map((b, idx) => {
            const rated = ratingsOf(ratings, b.ref).length
            return (
              <li
                key={b.id}
                id={optionId(b)}
                role="option"
                aria-selected={b.ref === value}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(idx)}
                onClick={() => pick(b)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 ${idx === active ? 'bg-sand' : ''}`}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-[15px] ${b.ref === value ? 'font-semibold' : 'font-medium'} text-dark`}>{b.guest} · {b.ref}</span>
                  <span className="nums block truncate text-[13px] text-slate-500">{roomLabel(b.villa)} · {fmtStay(b)}</span>
                </span>
                <span className="shrink-0 text-right text-[13px] text-slate-500">
                  {statusLabel(b)}{rated > 0 && <span className="block text-ok">Rated</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
