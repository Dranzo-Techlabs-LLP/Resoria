import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtDate, formatINR } from '../../lib/format'
import type { StockPurchase } from '../../types'
import { Pill } from '../ui/Pill'
import { cardTitleCls, linkCls, refCardCls } from '../styles'
import { PayPurchaseModal } from './PayPurchaseModal'
import { isPurchaseDue, purchaseDue, rowBtnCls, tdCls, tdNumCls, thCls, thNumCls, trCls } from './shared'

const SHOWN = 5

/** Inventory overview: purchases still owed to suppliers (oldest first), with "Record payment". Hidden when nothing is due. */
export function SupplierDues({ purchases, canPay }: { purchases: StockPurchase[]; canPay: boolean }) {
  const [all, setAll] = useState(false)
  const [paying, setPaying] = useState<StockPurchase | null>(null)

  const dues = useMemo(
    () => purchases.filter(isPurchaseDue).sort((a, b) => (a.date === b.date ? a.ref.localeCompare(b.ref) : a.date < b.date ? -1 : 1)),
    [purchases],
  )
  if (!dues.length) return null
  const total = dues.reduce((s, p) => s + purchaseDue(p), 0)
  const rows = all ? dues : dues.slice(0, SHOWN)

  return (
    <section className={`${refCardCls} mb-6 overflow-hidden`} aria-labelledby="sec-dues">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
        <div>
          <h2 id="sec-dues" className={cardTitleCls}>Supplier dues</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {dues.length} {dues.length === 1 ? 'purchase' : 'purchases'} not fully paid · oldest first
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total due</div>
          <div className="nums font-display text-[28px] font-semibold leading-tight text-due">{formatINR(total)}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-t border-[#eeeae1]">
              <th scope="col" className={thCls}>Purchase</th>
              <th scope="col" className={thCls}>Date</th>
              <th scope="col" className={thCls}>Supplier</th>
              <th scope="col" className={thNumCls}>Total</th>
              <th scope="col" className={thNumCls}>Paid</th>
              <th scope="col" className={thNumCls}>Due</th>
              {canPay && <th scope="col" className={thNumCls}><span className="sr-only">Action</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.ref} className={trCls}>
                <td className={tdCls}>
                  <Link to={`/inventory/history?q=${encodeURIComponent(p.ref)}`} className="nums font-semibold whitespace-nowrap text-dark hover:underline">{p.ref}</Link>
                  <div className="mt-1"><Pill tone={p.paymentStatus === 'Unpaid' ? 'red' : 'amber'}>{p.paymentStatus}</Pill></div>
                </td>
                <td className={`${tdCls} nums whitespace-nowrap`}>{fmtDate(p.date)}</td>
                <td className={tdCls}>{(p.supplier ?? '').trim() || <span className="text-slate-400">—</span>}</td>
                <td className={tdNumCls}>{formatINR(p.total)}</td>
                <td className={tdNumCls}>{formatINR(p.paidAmount)}</td>
                <td className={`${tdNumCls} font-semibold text-due`}>{formatINR(purchaseDue(p))}</td>
                {canPay && (
                  <td className={`${tdCls} text-right`}>
                    <button type="button" onClick={() => setPaying(p)} className={`${rowBtnCls} whitespace-nowrap`} aria-label={`Record payment for ${p.ref}`}>
                      Record payment
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dues.length > SHOWN && (
        <div className="border-t border-[#eeeae1] px-5 py-3 sm:px-6">
          <button type="button" onClick={() => setAll((v) => !v)} className={`${linkCls} text-sm`}>
            {all ? 'Show fewer' : `Show all ${dues.length}`}
          </button>
        </div>
      )}
      {paying && <PayPurchaseModal purchase={paying} onClose={() => setPaying(null)} />}
    </section>
  )
}
