import { roomsByCategory } from '../../lib/config'
import { chipCls } from '../ui/Chips'

/** Room multi-select as reference pill chips, grouped by category, plus Full Property (Expenses, Users). */
export function RoomChips({
  rooms, fullProperty, onChange, fullHint = 'Whole property.', emptyHint = 'Pick one or more rooms, or Full Property.',
}: {
  rooms: string[]
  fullProperty: boolean
  onChange: (rooms: string[], full: boolean) => void
  fullHint?: string
  emptyHint?: string
}) {
  const toggle = (r: string) => {
    if (fullProperty) return
    onChange(rooms.includes(r) ? rooms.filter((x) => x !== r) : [...rooms, r], false)
  }
  return (
    <div className="space-y-3">
      {roomsByCategory().map((g) => (
        <div key={g.category} role="group" aria-label={g.category}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{g.category}</div>
          <div className="flex flex-wrap gap-2">
            {g.rooms.map((r) => (
              <button key={r.id} type="button" aria-pressed={rooms.includes(r.name)} disabled={fullProperty} onClick={() => toggle(r.name)}
                className={chipCls(rooms.includes(r.name), true)}>
                {r.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
        <button type="button" aria-pressed={fullProperty} onClick={() => onChange(fullProperty ? rooms : [], !fullProperty)} className={chipCls(fullProperty, true)}>
          Full Property
        </button>
        <span className="text-sm text-slate-500">{fullProperty ? fullHint : rooms.length ? `Selected: ${rooms.join(', ')}` : emptyHint}</span>
      </div>
    </div>
  )
}
