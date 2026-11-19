// Small building blocks of the New / Edit booking form (reference styling).
import { useRef, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { fieldCls, labelCls } from '../styles'

/** Red outline for a field with a visible error. */
export const invalidCls = '!border-red-400 focus:!ring-red-200'

/** Label + control + inline error / hint. */
export function Field({ label, htmlFor, error, hint, children, className = '' }: {
  label: ReactNode
  htmlFor?: string
  error?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className={labelCls}>{label}</label>
      {children}
      {error
        ? <p id={htmlFor ? `${htmlFor}-error` : undefined} className="mt-1.5 text-[13px] text-red-700">{error}</p>
        : hint ? <div className="mt-1.5 text-[13px] text-slate-500">{hint}</div> : null}
    </div>
  )
}

/** Whole-rupee input shown as "₹40,000"; `value` holds plain digits ('' = empty). */
export function MoneyInput({ id, value, onChange, onBlur, placeholder, disabled, invalid }: {
  id: string
  value: string
  onChange: (digits: string) => void
  onBlur?: () => void
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
}) {
  return (
    <input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      className={`${fieldCls} nums ${invalid ? invalidCls : ''}`}
      value={value === '' ? '' : `₹${Number(value).toLocaleString('en-IN')}`}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 9))}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
    />
  )
}

/** Native select in the reference style (chevron on the right). */
export function SelectBox({ id, value, onChange, children, invalid, ariaLabel, className = '' }: {
  id?: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
  invalid?: boolean
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid && id ? `${id}-error` : undefined}
        className={`${fieldCls} appearance-none truncate pr-9 ${value ? '' : 'text-slate-500'} ${invalid ? invalidCls : ''}`}
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500" />
    </div>
  )
}

export const DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp'
const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export function isAllowedDocument(f: File): boolean {
  return DOC_TYPES.includes(f.type) || /\.(pdf|jpe?g|png|webp)$/i.test(f.name)
}

/** "Attach document*": dashed "Upload ID proof" box, then the file name with View · Change. */
export function DocumentField({ id, fileName, busy, invalid, onPick, onView }: {
  id: string
  fileName: string
  busy?: boolean
  invalid?: boolean
  onPick: (f: File) => void
  onView: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const open = () => input.current?.click()
  return (
    <>
      <input
        ref={input}
        id={id}
        type="file"
        accept={DOC_ACCEPT}
        className="sr-only"
        tabIndex={-1} // the visible Upload / Change buttons take focus
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = '' // picking the same file again still fires change
          if (f) onPick(f)
        }}
      />
      {fileName ? (
        <div className={`${fieldCls} flex items-center gap-3 ${invalid ? invalidCls : ''}`}>
          <span className="min-w-0 flex-1 truncate" title={fileName}>{fileName}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-sm">
            <button type="button" onClick={onView} className="font-medium text-dark underline underline-offset-2 hover:text-ink-hover">View</button>
            <span className="text-slate-400" aria-hidden>·</span>
            <button type="button" onClick={open} disabled={busy} className="font-medium text-dark underline underline-offset-2 hover:text-ink-hover">Change</button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3.5 text-left text-[15px] hover:bg-slate-50 ${invalid ? '!border-red-400' : ''}`}
        >
          <span className="text-slate-400">{busy ? 'Reading file…' : 'Upload ID proof'}</span>
          <span className="text-sm font-medium text-dark underline underline-offset-2">Upload</span>
        </button>
      )}
    </>
  )
}
