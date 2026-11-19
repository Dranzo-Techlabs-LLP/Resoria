import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useStore } from '../../data/store'
import { fmtDate } from '../../lib/format'
import { INVENTORY_CATEGORIES, type MovementType } from '../../types'
import { PageTitle } from '../../components/ui/PageTitle'
import { ChoiceChips } from '../../components/ui/Chips'
import { fieldCls, labelCls, linkCls } from '../../components/styles'
import {
  BillLink, fmtQty, fmtSigned, movementDelta, MovementPill, newestFirst, tableWrapCls, tdCls, tdNumCls, thCls, thNumCls, trCls,
  withCurrent,
} from '../../components/inventory/shared'

const TYPE_OPTIONS = ['All', 'Stock In', 'Stock Out', 'Adjustment'] as const
type TypeOption = (typeof TYPE_OPTIONS)[number]
const TYPE_OF: Record<Exclude<TypeOption, 'All'>, MovementType> = { 'Stock In': 'in', 'Stock Out': 'out', Adjustment: 'adjust' }

export function StockHistory() {
  const { data, loading } = useStore()
  const [params] = useSearchParams()
  // ?q=PUR-00003 / INV-0001 (from Stock Details) pre-fills the search
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  useEffect(() => setQ(urlQ), [urlQ])

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [category, setCategory] = useState('')
  const [department, setDepartment] = useState('')
  const [type, setType] = useState<TypeOption>('All')

  const { items, movements, purchases } = data.inventory
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const billed = useMemo(() => new Set(purchases.filter((p) => p.billName).map((p) => p.ref)), [purchases])
  const categories = useMemo(() => items.reduce<string[]>((l, i) => withCurrent(l, i.category), [...INVENTORY_CATEGORIES]), [items])
  const departments = useMemo(
    () => movements.reduce<string[]>((l, m) => (m.department ? withCurrent(l, m.department) : l), [...data.settings.departments]),
    [movements, data.settings.departments],
  )

  const badRange = !!from && !!to && from > to
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return movements
      .filter((m) => {
        const it = byId.get(m.itemId)
        if (query && !`${it?.name ?? ''} ${m.itemId} ${m.ref}`.toLowerCase().includes(query)) return false
        if (from && m.date < from) return false
        if (to && m.date > to) return false
        if (category && it?.category !== category) return false
        if (department && m.department !== department) return false
        if (type !== 'All' && m.type !== TYPE_OF[type]) return false
        return true
      })
      .sort(newestFirst)
  }, [movements, byId, q, from, to, category, department, type])

  const filtered = !!q.trim() || !!from || !!to || !!category || !!department || type !== 'All'
  const clear = () => { setQ(''); setFrom(''); setTo(''); setCategory(''); setDepartment(''); setType('All') }

  return (
    <>
      <PageTitle
        back={{ to: '/inventory', label: 'Back to inventory' }}
        title="Stock History"
        subtitle="Every purchase, usage and stock adjustment, newest first"
      />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search size={17} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item name, item ID or reference ID"
            aria-label="Search by item name, item ID or reference ID" className={`${fieldCls} !pl-10`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div>
            <label htmlFor="h-from" className={labelCls}>From</label>
            <input id="h-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label htmlFor="h-to" className={labelCls}>To</label>
            <input id="h-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label htmlFor="h-cat" className={labelCls}>Category</label>
            <select id="h-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={fieldCls}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="h-dept" className={labelCls}>Department</label>
            <select id="h-dept" value={department} onChange={(e) => setDepartment(e.target.value)} className={fieldCls}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>
        {badRange && <p role="alert" className="text-sm text-red-700">The “From” date is after the “To” date.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Movement type">
            <ChoiceChips options={TYPE_OPTIONS} value={type} onChange={(v) => setType(v || 'All')} small />
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span>{rows.length} {rows.length === 1 ? 'movement' : 'movements'}</span>
            {filtered && <button type="button" onClick={clear} className={linkCls}>Clear filters</button>}
          </div>
        </div>
      </div>

      <div className={tableWrapCls}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={thCls}>Transaction date</th>
                <th scope="col" className={thCls}>Reference ID</th>
                <th scope="col" className={thCls}>Item name</th>
                <th scope="col" className={thCls}>Category</th>
                <th scope="col" className={thCls}>Movement type</th>
                <th scope="col" className={thNumCls}>Quantity</th>
                <th scope="col" className={thNumCls}>Previous balance</th>
                <th scope="col" className={thNumCls}>Current balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const it = byId.get(m.itemId)
                const d = movementDelta(m)
                const detail = m.type === 'out' ? m.department : m.type === 'in' ? m.supplier : m.note
                return (
                  <tr key={m.id} className={trCls}>
                    <td className={`${tdCls} nums whitespace-nowrap`}>{fmtDate(m.date)}</td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button
                          type="button" onClick={() => setQ(m.ref)} title={`Show only ${m.ref}`}
                          className="nums font-semibold whitespace-nowrap text-dark hover:underline"
                        >
                          {m.ref}
                        </button>
                        {m.type === 'in' && billed.has(m.ref) && <BillLink purchaseRef={m.ref} />}
                      </div>
                    </td>
                    <td className={tdCls}>
                      {it ? (
                        <Link to={`/inventory/items/${encodeURIComponent(it.id)}`} className="font-medium text-dark hover:underline">{it.name}</Link>
                      ) : <span className="text-slate-500">Unknown item</span>}
                      <div className="mt-0.5 text-[13px] text-slate-500">{m.itemId}{it ? ` · ${it.unit}` : ''}</div>
                    </td>
                    <td className={tdCls}>{it?.category ?? '—'}</td>
                    <td className={tdCls}>
                      <MovementPill type={m.type} />
                      {detail && <div className="mt-1 max-w-[220px] truncate text-[13px] text-slate-500" title={detail}>{detail}</div>}
                    </td>
                    <td className={`${tdNumCls} font-semibold ${d > 0 ? 'text-ok' : d < 0 ? 'text-red-700' : ''}`}>{fmtSigned(d)}</td>
                    <td className={tdNumCls}>{fmtQty(m.prevBalance)}</td>
                    <td className={`${tdNumCls} font-semibold`}>{fmtQty(m.balance)}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr className={trCls}>
                  <td colSpan={8} className="px-4 py-14 text-center text-[15px] text-slate-500">
                    {loading && !movements.length ? 'Loading stock history…'
                      : movements.length === 0 ? 'No stock movements yet. Purchases, usage and adjustments will appear here.'
                      : <>No movements match these filters. <button type="button" onClick={clear} className={linkCls}>Clear filters</button></>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
