import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useStore } from '../../data/store'
import { formatINR } from '../../lib/format'
import { fieldCls, outlineBtnCls, solidBtnCls } from '../styles'
import type { HallRate } from '../../types'
import { EmptyRow, ErrorNote, ReadOnlyNote, SectionCard, newId, useSaveState, wholeNumber } from './kit'

interface DraftRow { key: string; hours: string; price: string }

const hoursLabel = (h: number) => `${h} ${h === 1 ? 'Hour' : 'Hours'}`
const toDraft = (rates: HallRate[]): DraftRow[] => rates.map((r) => ({ key: newId(), hours: String(r.hours), price: String(r.price) }))
const sorted = (rates: HallRate[]) => [...rates].sort((a, b) => a.hours - b.hours)

/** Configuration → Conference Hall pricing: price by duration (1 Hour, 2 Hours…), used by Add expense → Conference Hall. */
export function HallRatesSettings({ canEdit }: { canEdit: boolean }) {
  const { data, saveSettings } = useStore()
  const rates = sorted(data.settings.hallRates)
  const { run, saving, error, setError, saved } = useSaveState()
  const [draft, setDraft] = useState<DraftRow[] | null>(null) // null = not editing

  function startEdit() {
    setError('')
    setDraft(rates.length ? toDraft(rates) : [{ key: newId(), hours: '1', price: '' }])
  }
  function addRow() {
    if (!draft) return
    const maxHours = draft.reduce((m, r) => Math.max(m, Number(r.hours) || 0), 0)
    setDraft([...draft, { key: newId(), hours: String(maxHours + 1), price: '' }])
  }
  const setRow = (key: string, patch: Partial<DraftRow>) => setDraft((d) => d && d.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function save() {
    if (!draft) return
    const out: HallRate[] = []
    for (const r of draft) {
      const hours = wholeNumber(r.hours)
      const price = wholeNumber(r.price)
      if (hours === null || hours < 1 || hours > 24) { setError('Each duration must be a whole number of hours from 1 to 24.'); return }
      if (price === null || price > 10000000) { setError(`Enter a price in whole rupees for ${hoursLabel(hours)}.`); return }
      if (out.some((o) => o.hours === hours)) { setError(`${hoursLabel(hours)} is listed twice. Each duration can have one price.`); return }
      out.push({ hours, price })
    }
    if (await run(() => saveSettings('hallRates', sorted(out)))) setDraft(null)
  }

  return (
    <SectionCard
      title="Conference Hall pricing"
      description="Price for each booking duration. Staff pick the duration in Add expense → Conference Hall and the amount fills in from here."
      saved={saved && !draft}
      action={canEdit && !draft && <button type="button" onClick={startEdit} className={solidBtnCls}>{rates.length ? 'Edit pricing' : <><Plus size={17} /> Add pricing</>}</button>}
    >
      {!draft ? (
        rates.length === 0 ? (
          <EmptyRow>No hall pricing yet. Add a price for 1 Hour, 2 Hours and so on.</EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full max-w-lg border-collapse text-[15px]">
              <thead>
                <tr className="border-b border-[#eee8dc]">
                  <th scope="col" className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Duration</th>
                  <th scope="col" className="py-2.5 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee8dc]">
                {rates.map((r) => (
                  <tr key={r.hours}>
                    <td className="py-3 pr-4 font-medium text-dark">{hoursLabel(r.hours)}</td>
                    <td className="nums py-3 text-right font-semibold text-dark">{formatINR(r.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="max-w-lg">
          <div className="grid grid-cols-[1fr_1fr_40px] gap-3 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <span>Hours</span><span>Price (₹)</span><span className="sr-only">Remove</span>
          </div>
          <div className="space-y-2.5">
            {draft.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[1fr_1fr_40px] items-center gap-3">
                <input type="number" inputMode="numeric" min={1} max={24} step={1} value={r.hours} aria-label={`Duration ${i + 1} in hours`}
                  onChange={(e) => setRow(r.key, { hours: e.target.value })} className={fieldCls} />
                <input type="number" inputMode="numeric" min={0} step={1} value={r.price} aria-label={`Price for duration ${i + 1}`} placeholder="0"
                  onChange={(e) => setRow(r.key, { price: e.target.value })} className={fieldCls} />
                <button type="button" onClick={() => setDraft(draft.filter((x) => x.key !== r.key))} aria-label={`Remove duration ${i + 1}`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-red-700"><X size={18} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow} className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-medium text-dark underline underline-offset-2 hover:text-ink-hover">
            <Plus size={16} /> Add duration
          </button>
          {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={save} disabled={saving} className={solidBtnCls}>{saving ? 'Saving…' : 'Save pricing'}</button>
            <button type="button" onClick={() => { setError(''); setDraft(null) }} disabled={saving} className={outlineBtnCls}>Cancel</button>
          </div>
          <p className="mt-3 text-sm text-slate-500">Durations are saved in order, shortest first. Remove every row and save to clear the pricing.</p>
        </div>
      )}
      {!canEdit && <ReadOnlyNote>You have read-only access to hall pricing.</ReadOnlyNote>}
    </SectionCard>
  )
}
