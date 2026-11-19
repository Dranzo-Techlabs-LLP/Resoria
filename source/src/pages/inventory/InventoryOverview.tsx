import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { History, PackageMinus, Plus, Search } from 'lucide-react'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { formatINR } from '../../lib/format'
import { INVENTORY_CATEGORIES, type InventoryItem } from '../../types'
import { PageTitle } from '../../components/ui/PageTitle'
import { KpiCard } from '../../components/ui/KpiCard'
import { Pill } from '../../components/ui/Pill'
import { fieldCls, linkCls, outlineBtnCls, solidBtnCls } from '../../components/styles'
import { ItemFormModal } from '../../components/inventory/ItemFormModal'
import {
  fmtQty, rowBtnCls, SortTh, stockStatus, StockStatusPill, stockValue, tableWrapCls, tdCls, tdNumCls, thCls, thNumCls, trCls,
  withCurrent, type SortDir, type StockStatus,
} from '../../components/inventory/shared'

type SortKey = 'name' | 'category' | 'qty'
const ALL = 'All Items'
const STATUS_OPTIONS: { value: 'all' | StockStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'In Stock' },
  { value: 'low', label: 'Low Stock' },
  { value: 'out', label: 'Out of Stock' },
]

export function InventoryOverview() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, loading } = useStore()
  const canStock = can(user, 'edit_inventory')
  const canMaster = can(user, 'manage_config')

  const [q, setQ] = useState('')
  const [category, setCategory] = useState(ALL)
  const [status, setStatus] = useState<'all' | StockStatus>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })
  const [editing, setEditing] = useState<InventoryItem | null>(null)

  // Active items, plus deactivated items that still hold stock (shown greyed)
  const listed = useMemo(() => data.inventory.items.filter((i) => i.active || i.available > 0), [data.inventory.items])
  const categories = useMemo(
    () => listed.reduce<string[]>((list, i) => withCurrent(list, i.category), [...INVENTORY_CATEGORIES]),
    [listed],
  )

  const kpi = useMemo(() => ({
    total: listed.length,
    low: listed.filter((i) => stockStatus(i) === 'low').length,
    out: listed.filter((i) => stockStatus(i) === 'out').length,
    value: listed.reduce((s, i) => s + stockValue(i), 0),
  }), [listed])

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    const dir = sort.dir === 'asc' ? 1 : -1
    return listed
      .filter((i) => (category === ALL || i.category === category)
        && (status === 'all' || stockStatus(i) === status)
        && (!query || i.name.toLowerCase().includes(query)))
      .sort((a, b) => {
        const c = sort.key === 'qty' ? a.available - b.available
          : sort.key === 'category' ? a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name)
        return c * dir
      })
  }, [listed, q, category, status, sort])

  const onSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  const filtered = !!q.trim() || category !== ALL || status !== 'all'
  const clearFilters = () => { setQ(''); setCategory(ALL); setStatus('all') }

  return (
    <>
      <PageTitle
        title="Inventory"
        subtitle="Stock on hand across the resort"
        actions={(
          <>
            <Link to="/inventory/history" className={outlineBtnCls}><History size={17} aria-hidden /> Stock History</Link>
            {canStock && <Link to="/inventory/record-usage" className={outlineBtnCls}><PackageMinus size={17} aria-hidden /> Record Usage</Link>}
            {canStock && <Link to="/inventory/add-stock" className={solidBtnCls}><Plus size={17} aria-hidden /> Add Stock</Link>}
          </>
        )}
      />

      {/* Phones: Total and Stock value take a full row, Low / Out of stock share one */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:first-child]:col-span-2 [&>*:last-child]:col-span-2 lg:[&>*:first-child]:col-span-1 lg:[&>*:last-child]:col-span-1">
        <KpiCard label="Total stock items" value={kpi.total} sub="Registered items" onClick={() => setStatus('all')} />
        <KpiCard label="Low stock" value={kpi.low} sub="At or below minimum" tone={kpi.low ? 'due' : 'ink'} onClick={() => setStatus('low')} />
        <KpiCard label="Out of stock" value={kpi.out} sub="Zero available" tone={kpi.out ? 'due' : 'ink'} onClick={() => setStatus('out')} />
        <KpiCard label="Stock value" value={formatINR(kpi.value)} sub="At last purchase rate" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={17} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item name"
            aria-label="Search items by name" className={`${fieldCls} !pl-10`}
          />
        </div>
        <select
          value={status} onChange={(e) => setStatus(e.target.value as 'all' | StockStatus)}
          aria-label="Filter by stock status" className={`${fieldCls} sm:!w-52`}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value === 'all' ? 'All stock status' : o.label}</option>)}
        </select>
      </div>

      <div role="group" aria-label="Filter by category" className="mb-4 flex gap-6 overflow-x-auto border-b border-[#e6e1d6]">
        {[ALL, ...categories].map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-[15px] transition-colors ${
              category === c ? 'border-ink font-semibold text-dark' : 'border-transparent text-slate-600 hover:text-dark'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className={tableWrapCls}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                <SortTh label="Item name" k="name" sort={sort} onSort={onSort} />
                <SortTh label="Category" k="category" sort={sort} onSort={onSort} />
                <SortTh label="Available qty" k="qty" sort={sort} onSort={onSort} numeric />
                <th scope="col" className={thCls}>Unit</th>
                <th scope="col" className={thNumCls}>Min stock</th>
                <th scope="col" className={thCls}>Status</th>
                <th scope="col" className={thNumCls}><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const st = stockStatus(i)
                return (
                  <tr
                    key={i.id}
                    onClick={() => navigate(`/inventory/items/${encodeURIComponent(i.id)}`)}
                    className={`${trCls} cursor-pointer transition-colors hover:bg-[#faf8f3] ${i.active ? '' : 'text-slate-500 opacity-70'}`}
                  >
                    <td className={tdCls}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/inventory/items/${encodeURIComponent(i.id)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-dark hover:underline"
                        >
                          {i.name}
                        </Link>
                        {!i.active && <Pill tone="grey">Inactive</Pill>}
                      </div>
                      <div className="mt-0.5 text-[13px] text-slate-500">{i.id}</div>
                    </td>
                    <td className={tdCls}>{i.category}</td>
                    <td className={`${tdNumCls} font-semibold ${st === 'out' ? 'text-red-700' : st === 'low' ? 'text-due' : ''}`}>{fmtQty(i.available)}</td>
                    <td className={tdCls}>{i.unit}</td>
                    <td className={tdNumCls}>{fmtQty(i.minStock)}</td>
                    <td className={tdCls}><StockStatusPill item={i} /></td>
                    <td className={`${tdCls} text-right`} onClick={(e) => e.stopPropagation()}>
                      {canMaster ? (
                        <button type="button" onClick={() => setEditing(i)} className={rowBtnCls} aria-label={`Edit ${i.name}`}>Edit</button>
                      ) : (
                        <Link to={`/inventory/items/${encodeURIComponent(i.id)}`} className={rowBtnCls} aria-label={`View ${i.name}`}>View</Link>
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr className={trCls}>
                  <td colSpan={7} className="px-4 py-14 text-center text-[15px] text-slate-500">
                    {loading && !listed.length ? 'Loading stock…'
                      : filtered ? (
                        <>No items match these filters. <button type="button" onClick={clearFilters} className={linkCls}>Clear filters</button></>
                      ) : (
                        <>
                          No stock items yet.{' '}
                          {canMaster
                            ? <>Add them in <Link to="/configuration?tab=inventory" className={linkCls}>Configuration → Inventory Master</Link>.</>
                            : 'Items are added by an administrator in Configuration → Inventory Master.'}
                        </>
                      )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {rows.length > 0 && (
        <p className="mt-3 text-sm text-slate-500">
          {rows.length} {rows.length === 1 ? 'item' : 'items'} · stock updates automatically after every Stock In, Stock Out and Adjustment.
        </p>
      )}

      {editing && <ItemFormModal item={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
