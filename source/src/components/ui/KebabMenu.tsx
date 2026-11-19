import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'

export interface KebabItem {
  label: string
  onClick: () => void
  danger?: boolean
  hidden?: boolean
}

/** Three-dot (⋮) menu: Edit / Cancel / Remove on the bookings table. */
export function KebabMenu({ items, label = 'Actions' }: { items: KebabItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  const visible = items.filter((i) => !i.hidden)
  if (!visible.length) return null
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-dark hover:bg-slate-50"
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div role="menu" className="absolute top-11 right-0 z-30 min-w-[160px] rounded-2xl border border-[#e6e1d6] bg-white py-2 shadow-xl">
          {visible.map((i) => (
            <button
              key={i.label}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); i.onClick() }}
              className={`block w-full px-5 py-2.5 text-left text-[15px] hover:bg-slate-50 ${i.danger ? 'text-red-700' : 'text-dark'}`}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
