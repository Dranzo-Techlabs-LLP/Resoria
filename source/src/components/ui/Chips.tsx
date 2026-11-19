/** Pill chips from the reference screens (rooms, source, payment mode, popup tabs). */
const base = 'inline-flex h-11 items-center rounded-full border px-5 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'
const on = 'border-ink bg-ink text-white'
const off = 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'

export function chipCls(active: boolean, small = false): string {
  return `${base} ${active ? on : off} ${small ? '!h-9 !px-4 !text-sm' : ''}`
}

/** Single choice. Click the active chip again to clear it only when `clearable`. */
export function ChoiceChips<T extends string>({
  options, value, onChange, clearable = false, small = false, disabled = false, className = '',
}: {
  options: readonly T[]
  value: T | '' | undefined
  onChange: (v: T | '') => void
  clearable?: boolean
  small?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={`flex flex-wrap gap-2.5 ${className}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          disabled={disabled}
          onClick={() => onChange(value === o && clearable ? '' : o)}
          className={chipCls(value === o, small)}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** Multiple choice (rooms). `isDisabled` greys out a chip (e.g. a room already booked). */
export function MultiChips({
  options, value, onChange, isDisabled, title, small = false,
}: {
  options: readonly string[]
  value: string[]
  onChange: (v: string[]) => void
  isDisabled?: (o: string) => boolean
  title?: (o: string) => string | undefined
  small?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const active = value.includes(o)
        return (
          <button
            key={o}
            type="button"
            aria-pressed={active}
            disabled={!active && isDisabled?.(o)}
            title={title?.(o)}
            onClick={() => onChange(active ? value.filter((x) => x !== o) : [...value, o])}
            className={chipCls(active, small)}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}
