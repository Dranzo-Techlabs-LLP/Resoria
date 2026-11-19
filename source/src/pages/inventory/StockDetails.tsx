import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PackageMinus, Pencil, Plus, SlidersHorizontal } from 'lucide-react'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { fmtDate, formatINR } from '../../lib/format'
import { PageTitle } from '../../components/ui/PageTitle'
import { Pill } from '../../components/ui/Pill'
import { capsLabelCls, cardTitleCls, linkCls, outlineBtnCls, refCardCls, solidBtnCls } from '../../components/styles'
import { ItemFormModal } from '../../components/inventory/ItemFormModal'
import { AdjustStockModal } from '../../components/inventory/AdjustStockModal'
import {
  ActivePill, BillLink, fmtQty, fmtSigned, movementDelta, MovementPill, newestFirst, StockStatusPill, stockValue, SummaryRow,
  tableWrapCls, tdCls, tdNumCls, thCls, thNumCls, trCls,
} from '../../components/inventory/shared'

const RECENT = 25

export function StockDetails() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data, loading } = useStore()
  const canStock = can(user, 'edit_inventory')
  const canMaster = can(user, 'manage_config')
  const [modal, setModal] = useState<'edit' | 'adjust' | null>(null)

  const item = data.inventory.items.find((i) => i.id === id)
  const movements = useMemo(
    () => data.inventory.movements.filter((m) => m.itemId === id).sort(newestFirst),
    [data.inventory.movements, id],
  )
  const billed = useMemo(
    () => new Set(data.inventory.purchases.filter((p) => p.billName).map((p) => p.ref)),
    [data.inventory.purchases],
  )
  const totals = useMemo(() => {
    let purchased = 0, used = 0, adjusted = 0
    for (const m of movements) {
      if (m.type === 'in') purchased += Math.abs(m.qty)
      else if (m.type === 'out') used += Math.abs(m.qty)
      else adjusted += m.qty
    }
    return { purchased, used, adjusted }
  }, [movements])

  if (!item) {
    return (
      <>
        <PageTitle back={{ to: '/inventory', label: 'Back to inventory' }} title={loading ? 'Loading…' : 'Item not found'} />
        {!loading && <p className="text-[15px] text-slate-600">No inventory item with ID “{id}”. It may have been typed incorrectly.</p>}
      </>
    )
  }

  const enc = encodeURIComponent(item.id)
  const shown = movements.slice(0, RECENT)
  const showOpening = movements.length <= RECENT

  return (
    <>
      <PageTitle
        back={{ to: '/inventory', label: 'Back to inventory' }}
        title={item.name}
        tag={<span className="flex gap-2"><StockStatusPill item={item} />{!item.active && <Pill tone="grey">Inactive</Pill>}</span>}
        subtitle={`${item.id} · ${item.category}`}
        actions={(
          <>
            {canStock && item.active && <Link to={`/inventory/add-stock?item=${enc}`} className={solidBtnCls}><Plus size={17} aria-hidden /> Add Stock</Link>}
            {canStock && item.active && (item.available > 0 ? (
              <Link to={`/inventory/record-usage?item=${enc}`} className={outlineBtnCls}><PackageMinus size={17} aria-hidden /> Record Usage</Link>
            ) : (
              <button type="button" disabled title="Nothing available to issue" className={outlineBtnCls}><PackageMinus size={17} aria-hidden /> Record Usage</button>
            ))}
            {canMaster && <button type="button" onClick={() => setModal('edit')} className={outlineBtnCls}><Pencil size={16} aria-hidden /> Edit</button>}
            {canStock && <button type="button" onClick={() => setModal('adjust')} className={outlineBtnCls}><SlidersHorizontal size={16} aria-hidden /> Adjust stock</button>}
          </>
        )}
        actionsNote={!item.active && (
          <span className="text-slate-500">Inactive item — activate it in Inventory Master to add or issue stock.</span>
        )}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="sec-info">
          <h2 id="sec-info" className={`${cardTitleCls} mb-4`}>Item information</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Info label="Item name">{item.name}</Info>
            <Info label="Item ID">{item.id}</Info>
            <Info label="Category">{item.category}</Info>
            <Info label="Unit">{item.unit}</Info>
            <Info label="Minimum stock level">{fmtQty(item.minStock)} {item.unit}</Info>
            <Info label="Current available quantity"><span className="font-semibold">{fmtQty(item.available)} {item.unit}</span></Info>
            <Info label="Stock status"><StockStatusPill item={item} /></Info>
            <Info label="Item status"><ActivePill active={item.active} /></Info>
          </dl>
          <p className="mt-5 text-sm text-slate-500">
            The available quantity can’t be edited directly. Physical corrections are recorded with <strong className="font-medium text-slate-700">Adjust stock</strong>.
          </p>
        </section>

        <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="sec-summary">
          <h2 id="sec-summary" className={`${cardTitleCls} mb-4`}>Stock summary</h2>
          <dl className="space-y-3 text-[15px]">
            <SummaryRow label="Opening stock" value={`${fmtQty(item.openingStock)} ${item.unit}`} />
            <SummaryRow label="Total purchased" value={`${fmtSigned(totals.purchased)} ${item.unit}`} />
            <SummaryRow label="Total used / issued" value={`${fmtSigned(-totals.used)} ${item.unit}`} />
            <SummaryRow label="Total stock adjustments" value={`${fmtSigned(totals.adjusted)} ${item.unit}`} />
            <div className="flex items-center justify-between gap-3 border-t border-[#eeeae1] pt-3">
              <dt className="font-semibold text-dark">Current available quantity</dt>
              <dd className="nums font-semibold text-dark">{fmtQty(item.available)} {item.unit}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-xl bg-sand px-4 py-3.5">
            <div className={`${capsLabelCls} !mb-1`}>Current stock value</div>
            <div className="nums font-display text-[28px] font-semibold leading-tight text-dark">{formatINR(stockValue(item))}</div>
            <div className="mt-0.5 text-sm text-slate-500">
              {item.lastRate > 0 ? `At the last purchase rate of ${formatINR(item.lastRate)} / ${item.unit}` : 'No purchase rate yet'}
            </div>
          </div>
        </section>
      </div>

      <section className="mt-6" aria-labelledby="sec-moves">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sec-moves" className={cardTitleCls}>Recent stock movements</h2>
          {movements.length > 0 && (
            <Link to={`/inventory/history?q=${enc}`} className={`${linkCls} text-sm`}>View all in Stock History</Link>
          )}
        </div>
        <div className={tableWrapCls}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={thCls}>Date</th>
                  <th scope="col" className={thCls}>Movement type</th>
                  <th scope="col" className={thCls}>Reference ID</th>
                  <th scope="col" className={thNumCls}>Quantity</th>
                  <th scope="col" className={thNumCls}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const d = movementDelta(m)
                  const detail = m.type === 'out' ? m.department : m.type === 'in' ? m.supplier : m.note
                  return (
                    <tr key={m.id} className={trCls}>
                      <td className={`${tdCls} nums whitespace-nowrap`}>{fmtDate(m.date)}</td>
                      <td className={tdCls}>
                        <MovementPill type={m.type} />
                        {detail && <div className="mt-1 max-w-[260px] truncate text-[13px] text-slate-500" title={detail}>{detail}</div>}
                      </td>
                      <td className={tdCls}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <Link to={`/inventory/history?q=${encodeURIComponent(m.ref)}`} className={`${linkCls} nums`}>{m.ref}</Link>
                          {m.type === 'in' && billed.has(m.ref) && <BillLink purchaseRef={m.ref} />}
                        </div>
                      </td>
                      <td className={`${tdNumCls} font-semibold ${d > 0 ? 'text-ok' : d < 0 ? 'text-red-700' : ''}`}>{fmtSigned(d)}</td>
                      <td className={tdNumCls}>{fmtQty(m.balance)}</td>
                    </tr>
                  )
                })}
                {showOpening && (
                  <tr className={`${trCls} text-slate-500`}>
                    <td className={`${tdCls} nums whitespace-nowrap !text-slate-500`}>{item.createdAt ? fmtDate(item.createdAt.slice(0, 10)) : '—'}</td>
                    <td className={tdCls}><Pill tone="grey">Opening stock</Pill></td>
                    <td className={`${tdCls} !text-slate-400`}>—</td>
                    <td className={`${tdNumCls} !text-slate-500`}>{fmtSigned(item.openingStock)}</td>
                    <td className={`${tdNumCls} !text-slate-500`}>{fmtQty(item.openingStock)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {movements.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">No purchases, usage or adjustments recorded for this item yet.</p>
        )}
      </section>

      {modal === 'edit' && <ItemFormModal item={item} onClose={() => setModal(null)} />}
      {modal === 'adjust' && <AdjustStockModal item={item} onClose={() => setModal(null)} />}
    </>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-[15px] text-dark">{children}</dd>
    </div>
  )
}
