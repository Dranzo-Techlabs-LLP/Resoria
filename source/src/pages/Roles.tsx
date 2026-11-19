import { useState } from 'react'
import { Plus } from 'lucide-react'
import { can, useAuth } from '../auth/AuthContext'
import { roleMemberCount, useStore } from '../data/store'
import { PERMISSIONS } from '../lib/permissions'
import { fieldCls, refCardCls, solidBtnCls } from '../components/styles'
import { SectionCard } from '../components/config/kit'

/** Users and Role → Roles & rights: pick a role and tick what it can see and do. */
export function RolesSection() {
  const { user } = useAuth()
  const { data, saveRoleRights, addRole } = useStore()
  const canManage = can(user, 'manage_users')

  const [pickedId, setPickedId] = useState(data.roles[0]?.id ?? '')
  const [drafts, setDrafts] = useState<Record<string, Set<string>>>({})
  const [addingRole, setAddingRole] = useState(false)
  const [newRole, setNewRole] = useState('')
  const [roleError, setRoleError] = useState('')
  const [savedId, setSavedId] = useState('')

  const selected = data.roles.find((r) => r.id === pickedId) ?? data.roles[0]
  const selectedId = selected?.id ?? ''
  const draft = drafts[selectedId] ?? new Set(selected?.rights ?? [])
  const dirty = !!selected && (draft.size !== selected.rights.length || selected.rights.some((r) => !draft.has(r)))

  function toggle(key: string) {
    if (!canManage || !selected) return
    setSavedId('')
    const next = new Set(draft)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setDrafts((d) => ({ ...d, [selectedId]: next }))
  }
  async function saveRights() {
    await saveRoleRights(selectedId, Array.from(draft))
    setSavedId(selectedId)
  }
  async function createRole() {
    const name = newRole.trim()
    if (!name) { setRoleError('Enter a role name.'); return }
    if (data.roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) { setRoleError(`A role called “${name}” already exists.`); return }
    setRoleError('')
    await addRole(name)
    setNewRole('')
    setAddingRole(false)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      <div className={`${refCardCls} self-start p-3`}>
        <div className="flex items-center justify-between px-2 py-2">
          <h2 className="font-display text-xl font-semibold text-dark">Roles</h2>
          {canManage && (
            <button type="button" onClick={() => { setAddingRole((a) => !a); setRoleError('') }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-dark hover:bg-slate-100">
              <Plus size={15} /> New role
            </button>
          )}
        </div>
        {addingRole && canManage && (
          <div className="mb-2 px-2">
            <div className="flex gap-2">
              <input value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createRole() }}
                placeholder="Role name" aria-label="New role name" maxLength={40} autoFocus className={fieldCls} />
              <button type="button" onClick={createRole} className={solidBtnCls}>Add</button>
            </div>
            {roleError && <p role="alert" className="mt-1.5 text-sm text-red-700">{roleError}</p>}
          </div>
        )}
        <div className="space-y-0.5">
          {data.roles.map((r) => {
            const active = r.id === selectedId
            return (
              <button key={r.id} type="button" aria-pressed={active} onClick={() => setPickedId(r.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors ${active ? 'bg-ink text-white' : 'text-dark hover:bg-slate-100'}`}>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  {r.system && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>system</span>}
                </span>
                <span className={`nums rounded-full px-2 text-xs ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`} title="Users with this role">{roleMemberCount(data, r.name)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <SectionCard
        title={selected ? `${selected.name} rights` : 'Rights'}
        description="Tick what this role can see and do. Changes apply the next time its users load the app."
        saved={savedId === selectedId && !dirty}
        action={canManage && selected && <button type="button" onClick={saveRights} disabled={!dirty} className={solidBtnCls}>Save rights</button>}
      >
        {!canManage && <p className="mb-3 text-sm text-slate-500">You have read-only access to roles.</p>}
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {PERMISSIONS.map((p) => (
            <label key={p.key} className={`flex items-start gap-3 rounded-xl px-2 py-2.5 ${canManage ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
              <input type="checkbox" checked={draft.has(p.key)} onChange={() => toggle(p.key)} disabled={!canManage || !selected}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#0b241e] disabled:opacity-60" />
              <span className="text-[15px] text-dark">{p.label}</span>
            </label>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
