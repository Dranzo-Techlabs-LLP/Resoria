import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { cardTitleCls, outlineBtnCls, refCardCls, solidBtnCls } from '../styles'

/** Client-side id for a new settings row. */
export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // randomUUID is missing outside secure contexts (plain http): fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Case-insensitive, trimmed name comparison (duplicate checks, booking references). */
export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** "1 booking", "3 bookings". */
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

/**
 * Save state for one settings list: `run(fn)` calls a throwing save, keeps its error for the form to show,
 * and flashes "Saved" for a few seconds. Resolves to true when the save worked.
 */
export function useSaveState() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const run = useCallback(async (fn: () => Promise<void>) => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await fn()
      setSaved(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setSaved(false), 3000)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  return { run, saving, error, setError, saved }
}

/** Small green "Saved" confirmation next to a card title. */
export function SavedTag() {
  return (
    <span role="status" className="inline-flex items-center gap-1 rounded-full bg-[#e3efe6] px-2.5 py-0.5 text-[13px] font-medium text-[#24603e]">
      <Check size={14} aria-hidden /> Saved
    </span>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{children}</p>
}

/** White reference card with a serif title, optional description, "Saved" tag and a header action. */
export function SectionCard({
  title, description, saved, action, children,
}: {
  title: ReactNode
  description?: ReactNode
  saved?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`${refCardCls} p-5 sm:p-6`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={cardTitleCls}>{title}</h2>
            {saved && <SavedTag />}
          </div>
          {description && <p className="mt-1 text-[15px] text-slate-600">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

/** Divided list used by every configuration list (wraps on small screens instead of scrolling). */
export function RowList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-[#eee8dc] border-y border-[#eee8dc]">{children}</ul>
}

export function ListRow({ title, meta, tag, actions }: { title: ReactNode; meta?: ReactNode; tag?: ReactNode; actions?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold break-words text-dark">{title}</span>
          {tag}
        </div>
        {meta && <div className="mt-0.5 text-sm text-slate-500">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </li>
  )
}

/** Compact outline button for list rows (Edit / Deactivate / Delete). */
export function rowBtnCls(danger = false) {
  return `inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${danger ? 'text-red-700 hover:bg-red-50' : 'text-slate-800'}`
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-sand px-4 py-5 text-center text-[15px] text-slate-600">{children}</p>
}

export function ReadOnlyNote({ children = 'You have read-only access to this list.' }: { children?: ReactNode }) {
  return <p className="mt-4 text-sm text-slate-500">{children}</p>
}

/** "Active" checkbox row used in the add / edit popups. */
export function ActiveCheck({ checked, onChange, hint }: { checked: boolean; onChange: (v: boolean) => void; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0b241e]" />
      <span>
        <span className="block text-[15px] font-medium text-dark">Active</span>
        <span className="block text-sm text-slate-500">{hint}</span>
      </span>
    </label>
  )
}

/** Parse a whole-rupee / whole-number input. Returns null when empty or not a whole number ≥ 0. */
export function wholeNumber(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** Popup footer from the reference: small Cancel + wide ink button. */
export function ModalActions({ onCancel, onSave, saving, label }: { onCancel: () => void; onSave: () => void; saving: boolean; label: string }) {
  return (
    <div className="mt-6 flex gap-3">
      <button type="button" onClick={onCancel} disabled={saving} className={outlineBtnCls}>Cancel</button>
      <button type="button" onClick={onSave} disabled={saving} className={`${solidBtnCls} flex-1`}>{saving ? 'Saving…' : label}</button>
    </div>
  )
}

/** "Delete X?" confirmation for a settings row. */
export function DeleteModal({
  title, name, message, error, saving, onCancel, onConfirm,
}: {
  title: string
  name: string
  message: ReactNode
  error: string
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal title={title} subtitle={name} onClose={() => { if (!saving) onCancel() }}>
      <p className="text-[15px] leading-relaxed text-slate-600">{message} This can't be undone.</p>
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onCancel} disabled={saving} className={outlineBtnCls}>Keep it</button>
        <button type="button" onClick={onConfirm} disabled={saving}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-red-700 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-red-800 disabled:opacity-60">
          {saving ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  )
}
