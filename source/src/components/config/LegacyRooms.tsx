import { useMemo, useState } from 'react'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { FULL_PROPERTY, ROOM_NAMES, roomsByCategory } from '../../lib/config'
import { TODAY_ISO } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { fieldCls, outlineBtnCls, refCardCls, solidBtnCls } from '../styles'
import { ErrorNote, plural } from './kit'

interface Legacy {
  name: string
  bookings: number
  current: number // not cancelled, not completed, stay not over: these matter most
  other: number // expenses / users still naming the room
}

/**
 * Rooms that older bookings, expenses or users still name but that are no longer in the
 * room list (e.g. K1, Cave Room after the switch to Premium / Suite / Dorm / Party Hall).
 * Staff map each to one of the current rooms; the server moves every record and refuses
 * a move that would double-book the new room.
 */
export function LegacyRooms() {
  const { user } = useAuth()
  const { data, renameRoom } = useStore()
  const canMove = can(user, 'manage_config') || can(user, 'edit_villas')
  const [target, setTarget] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<{ from: string; to: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const legacy = useMemo<Legacy[]>(() => {
    const known = new Set([...ROOM_NAMES, FULL_PROPERTY])
    const map = new Map<string, Legacy>()
    const get = (n: string) => map.get(n) ?? map.set(n, { name: n, bookings: 0, current: 0, other: 0 }).get(n)!
    const split = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter((s) => s && !known.has(s))
    for (const b of data.bookings) {
      for (const r of new Set(split(b.villa))) {
        const l = get(r)
        l.bookings++
        if (b.status !== 'cancelled' && b.status !== 'completed' && b.checkOut >= TODAY_ISO) l.current++
      }
    }
    for (const e of data.expenses) for (const r of new Set(split(e.villa))) get(r).other++
    for (const u of data.users) for (const r of new Set(split(u.villa))) get(r).other++
    return [...map.values()].sort((a, b) => b.current - a.current || a.name.localeCompare(b.name))
  }, [data.bookings, data.expenses, data.users])

  if (!legacy.length) return null

  async function move() {
    if (!confirm) return
    setBusy(true)
    setError('')
    try {
      const n = await renameRoom(confirm.from, confirm.to)
      setDone(`${confirm.from} → ${confirm.to}: ${plural(n, 'booking')} moved.`)
      setConfirm(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move the room.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${refCardCls} border-amber-300 bg-[#fffaf0] p-5`} aria-labelledby="legacy-rooms-title">
      <h2 id="legacy-rooms-title" className="font-display text-xl font-semibold text-dark">Rooms from the older room list</h2>
      <p className="mt-1 text-sm text-slate-600">
        These names are still used by bookings or expenses but are no longer rooms. Move each to one of the current rooms
        so it shows on the dashboard, calendar and availability. A move that would double-book a room is refused.
      </p>
      {done && <p className="mt-3 text-sm font-medium text-ok" role="status">{done}</p>}
      <div className="mt-4 divide-y divide-amber-200/70">
        {legacy.map((l) => (
          <div key={l.name} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-dark">{l.name}</div>
              <div className="text-sm text-slate-600">
                {plural(l.bookings, 'booking')}
                {l.current > 0 && <span className="font-medium text-due"> · {l.current} upcoming or in-house</span>}
                {l.other > 0 && <> · {plural(l.other, 'other record')}</>}
              </div>
            </div>
            {canMove && (
              <div className="flex gap-2">
                <label className="sr-only" htmlFor={`legacy-${l.name}`}>Move {l.name} to</label>
                <select
                  id={`legacy-${l.name}`}
                  className={`${fieldCls} !h-10 w-48`}
                  value={target[l.name] ?? ''}
                  onChange={(e) => setTarget((t) => ({ ...t, [l.name]: e.target.value }))}
                >
                  <option value="">Move to…</option>
                  {roomsByCategory().map((g) => (
                    <optgroup key={g.category} label={g.category}>
                      {g.rooms.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  className={`${outlineBtnCls} !h-10`}
                  disabled={!target[l.name]}
                  onClick={() => { setError(''); setDone(''); setConfirm({ from: l.name, to: target[l.name] }) }}
                >
                  Move
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {confirm && (
        <Modal title={`Move ${confirm.from} to ${confirm.to}?`} onClose={() => { if (!busy) setConfirm(null) }}>
          <p className="text-sm leading-relaxed text-slate-600">
            Every booking, expense and user that names <b>{confirm.from}</b> will use <b>{confirm.to}</b> instead, and each
            moved booking notes it in its stay history. This can't be undone automatically.
          </p>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
          <div className="mt-5 flex gap-2.5">
            <button type="button" className={`${outlineBtnCls} flex-1`} disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
            <button type="button" className={`${solidBtnCls} flex-1`} disabled={busy} onClick={move}>{busy ? 'Moving…' : 'Move room'}</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
