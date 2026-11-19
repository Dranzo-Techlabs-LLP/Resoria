import { useId, useState } from 'react'
import { Star } from 'lucide-react'
import { labelCls, linkCls } from '../styles'
import { STAR_WORDS } from './utils'

const GAP = 2
const EMPTY = 'text-[#e2dccd]'
const FULL = 'text-accent'

/** Read-only stars; fractions (4.6) fill part of a star. */
export function StarDisplay({ value, size = 16, className = '' }: { value: number; size?: number; className?: string }) {
  const v = Math.max(0, Math.min(5, value))
  const width = Math.floor(v) * (size + GAP) + (v % 1) * size
  const row = (cls: string) => (
    <span className={`flex ${cls}`} style={{ gap: GAP }}>
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={size} fill="currentColor" strokeWidth={1} className="shrink-0" />)}
    </span>
  )
  return (
    <span role="img" aria-label={`${+v.toFixed(1)} out of 5 stars`} className={`relative inline-flex shrink-0 ${className}`}>
      {row(EMPTY)}
      <span aria-hidden className="absolute inset-y-0 left-0 overflow-hidden" style={{ width }}>{row(FULL)}</span>
    </span>
  )
}

/**
 * Star input: a native radio group (Tab to reach it, arrow keys to change, Space to pick),
 * drawn as stars with the word for the score beside them. `clearable` adds a Clear link (optional scores).
 */
export function StarInput({
  label, value, onChange, size = 'lg', clearable = false, error, required = false,
}: {
  label: string
  value: number // 0 = not rated
  onChange: (v: number) => void
  size?: 'lg' | 'sm'
  clearable?: boolean
  error?: string
  required?: boolean
}) {
  const name = useId()
  const errorId = `${name}-error`
  const [hover, setHover] = useState(0)
  const shown = hover || value
  const px = size === 'lg' ? 30 : 22
  return (
    <fieldset aria-describedby={error ? errorId : undefined} aria-required={required || undefined} className="min-w-0">
      <legend className={size === 'lg' ? labelCls : 'mb-1 block text-sm text-slate-700'}>{label}{required && '*'}</legend>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              onMouseEnter={() => setHover(n)}
              className="cursor-pointer rounded-md p-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/40"
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
                aria-label={`${n} ${n === 1 ? 'star' : 'stars'}, ${STAR_WORDS[n]}`}
              />
              <Star
                aria-hidden
                size={px}
                fill="currentColor"
                strokeWidth={1}
                className={`transition-colors ${shown >= n ? FULL : EMPTY}`}
              />
            </label>
          ))}
        </div>
        <span className={`text-sm ${shown ? 'font-medium text-dark' : 'text-slate-400'}`} aria-hidden>
          {shown ? STAR_WORDS[shown] : 'Not rated'}
        </span>
        {clearable && value > 0 && (
          <button type="button" onClick={() => onChange(0)} className={`${linkCls} text-sm`} aria-label={`Clear ${label} rating`}>
            Clear
          </button>
        )}
      </div>
      {error && <p id={errorId} className="mt-1.5 text-[13px] text-red-700">{error}</p>}
    </fieldset>
  )
}
