import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { can, useAuth } from '../auth/AuthContext'
import { effectiveRate, useStore } from '../data/store'
import { roomsByCategory, type RoomConfig } from '../lib/config'
import { formatINR } from '../lib/format'
import { fieldAreaCls, fieldCls, labelCls, outlineBtnCls, refCardCls, solidBtnCls } from '../components/styles'
import { ErrorNote, SavedTag, plural } from '../components/config/kit'
import { LegacyRooms } from '../components/config/LegacyRooms'

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-[15px]">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-dark">{value}</span>
    </div>
  )
}

function RoomCard({ r, canEdit }: { r: RoomConfig; canEdit: boolean }) {
  const { data, saveVillaOverride } = useStore()
  const rate = effectiveRate(r.name, data)
  const override = data.villaOverrides[r.name]
  const notes = override?.notes ?? ''
  const minGuests = (r.editableCapacity && override?.minGuests) || r.minGuests
  const maxGuests = (r.editableCapacity && override?.maxGuests) || r.maxGuests
  const [editing, setEditing] = useState(false)
  const [rateInput, setRateInput] = useState(String(rate))
  const [notesInput, setNotesInput] = useState(notes)
  const [minInput, setMinInput] = useState(String(minGuests))
  const [maxInput, setMaxInput] = useState(String(maxGuests))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function startEdit() {
    setRateInput(String(rate))
    setNotesInput(notes)
    setMinInput(String(minGuests))
    setMaxInput(String(maxGuests))
    setError('')
    setSaved(false)
    setEditing(true)
  }
  async function save() {
    const capacity: { minGuests?: number; maxGuests?: number } = {}
    if (r.editableCapacity) {
      const min = Number(minInput), max = Number(maxInput)
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < 1 || min > 10000 || max > 10000) {
        setError('Capacity must be a whole number between 1 and 10,000 guests.'); return
      }
      if (min > max) { setError("Minimum guests can't be more than maximum guests."); return }
      // Only send capacity when it changed, so the config default stays in use until then.
      if (min !== minGuests || max !== maxGuests) {
        capacity.minGuests = min
        capacity.maxGuests = max
      }
    }
    const baseRate = Number(rateInput)
    if (rateInput.trim() === '' || !Number.isInteger(baseRate) || baseRate < 0 || baseRate > 10000000) {
      setError('Enter a base rate in whole rupees, between ₹0 and ₹1,00,00,000.'); return
    }
    setError('')
    setSaving(true)
    try {
      await saveVillaOverride(r.name, { baseRate, notes: notesInput, ...capacity })
      setEditing(false)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`${refCardCls} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold text-dark">{r.name}</h3>
            {saved && <SavedTag />}
          </div>
          <p className="text-sm text-slate-500">{r.code} · {r.status}</p>
        </div>
        {canEdit && !editing && (
          <button type="button" onClick={startEdit} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-dark" aria-label={`Edit ${r.name}`}>
            <Pencil size={16} />
          </button>
        )}
      </div>

      {!editing ? (
        <div className="mt-3 divide-y divide-[#eee8dc]">
          <DetailRow label="Base rate" value={<span className="nums">{rate > 0 ? `${formatINR(rate)} / night` : 'Not set'}</span>} />
          <DetailRow label="Capacity" value={minGuests === maxGuests ? plural(maxGuests, 'guest') : `${minGuests}–${maxGuests} guests`} />
          {notes && <p className="pt-2 text-sm text-slate-600">{notes}</p>}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className={labelCls}>Base rate (₹ / night)</span>
            <input type="number" inputMode="numeric" min={0} value={rateInput} onChange={(e) => setRateInput(e.target.value)} className={fieldCls} />
          </label>
          {r.editableCapacity && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className={labelCls}>Min guests</span><input type="number" inputMode="numeric" min={1} value={minInput} onChange={(e) => setMinInput(e.target.value)} className={fieldCls} /></label>
              <label className="block"><span className={labelCls}>Max guests</span><input type="number" inputMode="numeric" min={1} value={maxInput} onChange={(e) => setMaxInput(e.target.value)} className={fieldCls} /></label>
            </div>
          )}
          <label className="block">
            <span className={labelCls}>Notes</span>
            <textarea rows={2} value={notesInput} onChange={(e) => setNotesInput(e.target.value)} className={fieldAreaCls} />
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className={outlineBtnCls}>Cancel</button>
            <button type="button" onClick={save} disabled={saving} className={`${solidBtnCls} flex-1`}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Configuration → Rooms: base rate, capacity and notes per room, grouped by category. */
export function RoomsSettings() {
  const { user } = useAuth()
  const canEdit = can(user, 'edit_villas')
  return (
    <div className="space-y-7">
      <LegacyRooms />
      <p className="text-[15px] text-slate-600">
        The base rate is the nightly price used to work out the room amount on a new booking.
        {!canEdit && ' You have read-only access to room settings.'}
      </p>
      {roomsByCategory().map((g) => (
        <section key={g.category} aria-label={g.category}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {g.category} · {plural(g.rooms.length, 'room')}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.rooms.map((r) => (<RoomCard key={r.id} r={r} canEdit={canEdit} />))}
          </div>
        </section>
      ))}
    </div>
  )
}
