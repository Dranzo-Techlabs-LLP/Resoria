import { useState } from 'react'
import { Pencil, Plus, UserCheck, UserX } from 'lucide-react'
import { can, useAuth } from '../auth/AuthContext'
import { useStore } from '../data/store'
import { bookingRooms, FULL_PROPERTY, isFullProperty } from '../lib/config'
import { fmtDate } from '../lib/format'
import { fieldCls, labelCls, outlineBtnCls, solidBtnCls } from '../components/styles'
import { Modal } from '../components/ui/Modal'
import { Pill } from '../components/ui/Pill'
import { ErrorNote, ModalActions, SectionCard } from '../components/config/kit'
import { RoomChips } from '../components/config/RoomChips'
import type { User } from '../types'

const thCls = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'

const BLANK = { name: '', email: '', password: '', role: 'Administrator', rooms: [] as string[], fullProperty: false, active: true }

function Req() {
  return <span className="text-red-600"> *</span>
}

/** Users and Role → Users: the team list with add / edit / disable. */
export function UsersSection() {
  const { user } = useAuth()
  const { data, addUser, updateUser, setUserActive } = useStore()
  const canManage = can(user, 'manage_users')
  const roles = data.roles.map((r) => r.name)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null) // null while adding
  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState<User | null>(null)
  const isSelf = !!editing && editing.id === user?.id

  function openAdd() {
    setEditing(null)
    setForm({ ...BLANK, role: roles[0] ?? 'Administrator' })
    setError('')
    setOpen(true)
  }
  function openEdit(u: User) {
    const villa = u.villa ?? ''
    setEditing(u)
    setForm({
      name: u.name, email: u.email, password: '', role: u.role,
      rooms: isFullProperty(villa) ? [] : bookingRooms(villa), fullProperty: isFullProperty(villa), active: u.active,
    })
    setError('')
    setOpen(true)
  }
  async function save() {
    if (!form.name.trim() || !form.email.trim()) { setError('Full name and email are required.'); return }
    if (!editing && !form.password) { setError('Password is required.'); return }
    if (form.password && form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    const fields = {
      name: form.name.trim(), email: form.email.trim(), role: form.role, active: form.active,
      villa: form.fullProperty ? FULL_PROPERTY : form.rooms.join(', '),
      ...(form.password ? { password: form.password } : {}),
    }
    setBusy(true)
    try {
      if (editing) await updateUser(editing.id, fields)
      else await addUser(fields)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the user.')
    } finally {
      setBusy(false)
    }
  }
  async function disableUser() {
    if (!confirmDisable) return
    setBusy(true)
    await setUserActive(confirmDisable.id, false)
    setBusy(false)
    setConfirmDisable(null)
  }

  return (
    <SectionCard
      title="Users"
      description="Who can sign in, their role and the rooms they look after."
      action={canManage && <button type="button" onClick={openAdd} className={solidBtnCls}><Plus size={17} /> Add user</button>}
    >
      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="w-full min-w-[860px] border-collapse text-[15px]">
          <thead className="border-y border-[#eee8dc]">
            <tr>
              <th scope="col" className={`${thCls} pl-5 sm:pl-6`}>Name</th><th scope="col" className={thCls}>Email</th><th scope="col" className={thCls}>Role</th>
              <th scope="col" className={thCls}>Room</th><th scope="col" className={thCls}>Status</th><th scope="col" className={thCls}>Last login</th>
              <th scope="col" className={`${thCls} pr-5 sm:pr-6`}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eee8dc]">
            {data.users.map((u) => (
              <tr key={u.id}>
                <td className="py-3.5 pr-4 pl-5 font-semibold text-dark sm:pl-6">
                  {u.name}
                  {u.id === user?.id && <span className="ml-1.5 text-sm font-medium text-slate-500">(you)</span>}
                </td>
                <td className="px-4 py-3.5 text-slate-600">{u.email}</td>
                <td className="px-4 py-3.5"><Pill tone="grey">{u.role}</Pill></td>
                <td className="px-4 py-3.5 text-slate-600">{u.villa || <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-3.5">{u.active ? <Pill tone="green">Active</Pill> : <Pill tone="red">Disabled</Pill>}</td>
                <td className="nums px-4 py-3.5 whitespace-nowrap text-slate-600">{u.lastLogin ? fmtDate(u.lastLogin) : 'Never'}</td>
                <td className="py-3.5 pr-5 pl-4 sm:pr-6">
                  {canManage && (
                    <div className="flex items-center justify-end gap-4">
                      <button type="button" onClick={() => openEdit(u)} className="text-slate-500 hover:text-dark" aria-label={`Edit ${u.name}`} title="Edit user"><Pencil size={16} /></button>
                      {u.active ? (
                        <button type="button" onClick={() => setConfirmDisable(u)} disabled={u.id === user?.id}
                          title={u.id === user?.id ? "You can't disable your own account" : 'Disable user'}
                          className="inline-flex w-20 items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:text-slate-300">
                          <UserX size={15} /> Disable
                        </button>
                      ) : (
                        <button type="button" onClick={() => setUserActive(u.id, true)} title="Enable user"
                          className="inline-flex w-20 items-center gap-1 text-sm font-medium text-ok hover:text-ink">
                          <UserCheck size={15} /> Enable
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && canManage && (
        <Modal title={editing ? 'Edit user' : 'Add user'} subtitle={editing?.email} size="lg" onClose={() => { if (!busy) setOpen(false) }}>
          <div className="space-y-4">
            <label className="block">
              <span className={labelCls}>Full name<Req /></span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Email<Req /></span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={fieldCls} />
            </label>
            <label className="block">
              <span className={labelCls}>{editing ? 'New password' : <>Password<Req /></>}</span>
              <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? 'Leave blank to keep the current password' : ''} className={fieldCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Role<Req /></span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={fieldCls}>
                {roles.map((r) => (<option key={r}>{r}</option>))}
              </select>
            </label>
            <div>
              <span className={labelCls}>Room <span className="font-normal text-slate-400">(optional)</span></span>
              <RoomChips rooms={form.rooms} fullProperty={form.fullProperty} onChange={(rooms, full) => setForm({ ...form, rooms, fullProperty: full })}
                fullHint="Looks after the whole property." emptyHint="Not assigned to a room." />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.active} disabled={isSelf} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 accent-[#0b241e] disabled:opacity-50" />
              <span className="text-[15px] text-dark">Active</span>
              {isSelf && <span className="text-sm text-slate-500">— you can't disable your own account</span>}
            </label>
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <ModalActions onCancel={() => setOpen(false)} onSave={save} saving={busy} label={editing ? 'Save changes' : 'Add user'} />
        </Modal>
      )}

      {confirmDisable && (
        <Modal title="Disable this user?" onClose={() => { if (!busy) setConfirmDisable(null) }}>
          <p className="text-[15px] leading-relaxed text-slate-600">
            <span className="font-semibold text-dark">{confirmDisable.name}</span> ({confirmDisable.email}) won't be able to sign in
            until you enable them again. Their bookings and records stay as they are.
          </p>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => setConfirmDisable(null)} disabled={busy} className={outlineBtnCls}>Keep active</button>
            <button type="button" onClick={disableUser} disabled={busy}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-700 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-red-800 disabled:opacity-60">
              <UserX size={16} /> {busy ? 'Disabling…' : 'Disable'}
            </button>
          </div>
        </Modal>
      )}
    </SectionCard>
  )
}
