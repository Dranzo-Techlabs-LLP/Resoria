import { useState } from 'react'
import { can, useAuth } from '../auth/AuthContext'
import { useStore } from '../data/store'
import { capsLabelCls, fieldAreaCls, fieldCls, labelCls, solidBtnCls } from '../components/styles'
import { ErrorNote, SavedTag, SectionCard, useSaveState } from '../components/config/kit'

const MAX_TERMS = 20000
const MAX_POLICY = 3000

/** Configuration → Invoice: reference number series, what prints on the invoice, terms & conditions, cancellation policy. */
export function InvoiceSettingsSection() {
  const { user } = useAuth()
  const { data, saveInvoice } = useStore()
  const s = data.invoice
  const canEdit = can(user, 'edit_invoice')

  const [prefix, setPrefix] = useState(s.prefix)
  const [next, setNext] = useState(String(s.next))
  const [padding, setPadding] = useState(String(s.padding))
  const [terms, setTerms] = useState(s.terms)
  const [policy, setPolicy] = useState(s.cancellationPolicy ?? '')
  const [showPayments, setShowPayments] = useState(!!s.showPayments)
  const { run, saving, error: err, setError: setErr, saved } = useSaveState()

  const pad = Math.max(1, Math.min(10, Number(padding) || 1))
  const nextNum = Number(next) || 0
  const preview = (n: number) => `${prefix}${String(n).padStart(pad, '0')}`

  async function save() {
    if (!prefix.trim()) { setErr('Enter a prefix.'); return }
    if (!Number.isInteger(Number(next)) || Number(next) < 0) { setErr('Next number must be a whole number, 0 or more.'); return }
    // The "show on invoice" options are sent only when changed
    await run(() => saveInvoice({
      prefix, next: nextNum, padding: pad, terms, cancellationPolicy: policy,
      ...(showPayments !== !!s.showPayments ? { showPayments } : {}),
    }))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <SectionCard title="Reference number" description="The series every new booking reference and invoice uses.">
          <div className="space-y-4">
            <label className="block">
              <span className={labelCls}>Prefix <span className="text-red-600">*</span></span>
              <input value={prefix} onChange={(e) => setPrefix(e.target.value.slice(0, 20))} disabled={!canEdit} className={fieldCls} />
              <span className="mt-1.5 block text-sm text-slate-500">Goes in front of the number. Up to 20 characters. Slashes, dashes and letters are fine.</span>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>Next number <span className="text-red-600">*</span></span>
                <input type="number" inputMode="numeric" min={0} value={next} onChange={(e) => setNext(e.target.value)} disabled={!canEdit} className={fieldCls} />
                <span className="mt-1.5 block text-sm text-slate-500">The number the next new booking will use.</span>
              </label>
              <label className="block">
                <span className={labelCls}>Padding (digits) <span className="text-red-600">*</span></span>
                <input type="number" inputMode="numeric" min={1} max={10} value={padding} onChange={(e) => setPadding(e.target.value)} disabled={!canEdit} className={fieldCls} />
                <span className="mt-1.5 block text-sm text-slate-500">Pads with leading zeros, e.g. 5 → 00001.</span>
              </label>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Preview">
          <div className={capsLabelCls}>Next booking</div>
          <div className="nums font-display text-[26px] font-semibold text-dark">{preview(nextNum)}</div>
          <div className={`${capsLabelCls} mt-5`}>After that</div>
          <div className="nums text-[17px] text-slate-500">{preview(nextNum + 1)}</div>
        </SectionCard>
      </div>

      <SectionCard title="Show on invoice" description="Tick an option to print it on every invoice. Left unticked, it isn't shown.">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={showPayments} onChange={(e) => setShowPayments(e.target.checked)} disabled={!canEdit} className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#0b241e] disabled:opacity-60" />
          <span>
            <span className="block text-[15px] font-medium text-dark">Payment entries</span>
            <span className="block text-sm text-slate-500">List every payment, advance and refund (date, method, reference, amount), not only the total paid.</span>
          </span>
        </label>
      </SectionCard>

      <SectionCard title="Terms & conditions" description="Printed on a separate second page of every invoice. Leave blank to omit the page entirely. Each line becomes its own line on the invoice.">
        <textarea rows={10} aria-label="Terms and conditions" value={terms} onChange={(e) => setTerms(e.target.value.slice(0, MAX_TERMS))} disabled={!canEdit}
          className={`${fieldAreaCls} font-mono text-[13px] disabled:bg-sand`} />
        <div className="mt-1 text-right text-xs text-slate-400"><span className="nums">{terms.length.toLocaleString('en-IN')}</span> / {MAX_TERMS.toLocaleString('en-IN')} characters</div>
      </SectionCard>

      <SectionCard title="Cancellation policy" description="Printed on the advance bill and on the combined booking bill. Leave blank to leave it off. Each line becomes its own line on the bill.">
        <textarea rows={6} aria-label="Cancellation policy" value={policy} onChange={(e) => setPolicy(e.target.value.slice(0, MAX_POLICY))} disabled={!canEdit}
          placeholder="e.g. Cancellation 15 days or more before check-in: the advance is refunded in full."
          className={`${fieldAreaCls} text-[14px] disabled:bg-sand`} />
        <div className="mt-1 text-right text-xs text-slate-400"><span className="nums">{policy.length.toLocaleString('en-IN')}</span> / {MAX_POLICY.toLocaleString('en-IN')} characters</div>
      </SectionCard>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={saving} className={solidBtnCls}>{saving ? 'Saving…' : 'Save invoice settings'}</button>
          {saved && <SavedTag />}
          {err && <div className="w-full"><ErrorNote>{err}</ErrorNote></div>}
        </div>
      ) : (
        <p className="text-sm text-slate-500">You have read-only access to invoice settings.</p>
      )}
    </div>
  )
}
