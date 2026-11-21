import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link2, PenLine, Star } from 'lucide-react'
import { can, useAuth } from '../auth/AuthContext'
import { useStore } from '../data/store'
import { RATING_ASPECT_LABELS, RATING_SOURCES, type Rating as RatingT } from '../types'
import { PageTitle } from '../components/ui/PageTitle'
import { KpiCard } from '../components/ui/KpiCard'
import { ChoiceChips, chipCls } from '../components/ui/Chips'
import { SelectBox } from '../components/booking/FormParts'
import { cardTitleCls, fieldCls, linkCls, refCardCls, solidBtnCls } from '../components/styles'
import { ConfirmModal } from '../components/booking-detail/PaymentModals'
import { useToast } from '../components/ui/Toast'
import { StarDisplay } from '../components/rating/Stars'
import { RatingCard } from '../components/rating/RatingCard'
import { RatingFormModal } from '../components/rating/RatingFormModal'
import { ReplyModal } from '../components/rating/ReplyModal'
import { TrendChart } from '../components/rating/TrendChart'
import { CollectRatingsCard } from '../components/rating/CollectRatingsCard'
import {
  PERIODS, aspectAverages, avgOf, byNewestRating, distribution, fmtAvg, monthlyTrend, needsReply, periodStart, type Period,
} from '../components/rating/utils'

type StarsFilter = '' | '5' | '4' | '3' | 'low'
const STARS_OPTIONS: { value: StarsFilter; label: string }[] = [
  { value: '', label: 'All stars' },
  { value: '5', label: '5 stars' },
  { value: '4', label: '4 stars' },
  { value: '3', label: '3 stars' },
  { value: 'low', label: '2 stars or less' },
]
const matchesStars = (r: RatingT, s: StarsFilter) => !s || (s === 'low' ? r.overall <= 2 : r.overall === Number(s))

type Popup =
  | { kind: 'add' }
  | { kind: 'reply' | 'delete'; rating: RatingT }

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0)
const reviews = (n: number) => `${n} ${n === 1 ? 'review' : 'reviews'}`

function ChartCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className={`${refCardCls} min-w-0 p-5 sm:p-6`}>
      <h2 className={`${cardTitleCls} mb-4`}>{title}</h2>
      {children}
    </section>
  )
}

/** Horizontal bar: label · track with fill · value. */
function Bar({ label, fill, value, color }: { label: ReactNode; fill: number; value: ReactNode; color: string }) {
  return (
    <>
      <span className="nums text-sm font-medium whitespace-nowrap text-dark">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-sand" aria-hidden>
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, fill))}%` }} />
      </span>
      <span className="nums text-right text-sm whitespace-nowrap text-slate-600">{value}</span>
    </>
  )
}

/** Two ways ratings come in, shown before the first one arrives. */
function NoRatingsYet({ canManage, onAdd }: { canManage: boolean; onAdd: () => void }) {
  return (
    <div className={`${refCardCls} px-6 py-12 text-center sm:px-10`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sand text-accent">
        <Star size={22} fill="currentColor" aria-hidden />
      </div>
      <h2 className="mt-4 font-display text-2xl font-semibold text-dark">No ratings yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-[15px] text-slate-600">Guest ratings and reviews arrive here in two ways:</p>
      <ul className="mx-auto mt-5 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
        <li className="rounded-2xl bg-sand px-5 py-4">
          <div className="flex items-center gap-2 font-semibold text-dark"><Link2 size={17} aria-hidden /> Guest feedback link</div>
          <p className="mt-1 text-sm text-slate-600">
            After check-out, open the booking and use Share → Feedback request on WhatsApp (or Get feedback link). The guest rates the stay on the website.
          </p>
        </li>
        <li className="rounded-2xl bg-sand px-5 py-4">
          <div className="flex items-center gap-2 font-semibold text-dark"><PenLine size={17} aria-hidden /> Staff entry</div>
          <p className="mt-1 text-sm text-slate-600">
            Record a rating the guest gave by phone, in person, or on Google and booking sites with Add rating.
          </p>
        </li>
      </ul>
      {canManage && <button type="button" onClick={onAdd} className={`${solidBtnCls} mt-6`}>+ Add rating</button>}
    </div>
  )
}

/** Rating: guest ratings and reviews (scores, trend, the review list with replies). */
export function Rating() {
  const { user } = useAuth()
  const { data, deleteRating } = useStore()
  const toast = useToast()
  const canManage = can(user, 'manage_ratings')
  const [popup, setPopup] = useState<Popup | null>(null)
  const close = () => setPopup(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ---- Filters (kept in the URL) ----
  const [params, setParams] = useSearchParams()
  const periodParam = params.get('period') as Period | null
  const period: Period = periodParam && PERIODS.includes(periodParam) ? periodParam : 'All time'
  const source = params.get('source') ?? ''
  const starsParam = (params.get('stars') ?? '') as StarsFilter
  const stars: StarsFilter = STARS_OPTIONS.some((o) => o.value === starsParam) ? starsParam : ''
  const onlyReply = params.get('reply') === '1'
  const q = params.get('q') ?? ''
  function update(patch: Record<string, string>) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      return next
    }, { replace: true })
  }

  const all = data.ratings
  // Period and source scope everything; stars, "needs reply" and search narrow the list
  const bySource = useMemo(() => (source ? all.filter((r) => r.source === source) : all), [all, source])
  const scoped = useMemo(() => {
    const start = periodStart(period)
    return start ? bySource.filter((r) => r.date >= start) : bySource
  }, [bySource, period])

  const avg = avgOf(scoped)
  const avgAllTime = avgOf(bySource)
  const fives = scoped.filter((r) => r.overall === 5).length
  const awaiting = scoped.filter(needsReply).length
  const dist = useMemo(() => distribution(scoped), [scoped])
  const aspects = useMemo(() => aspectAverages(scoped), [scoped])
  const trend = useMemo(() => monthlyTrend(bySource), [bySource])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scoped
      .filter((r) => matchesStars(r, stars))
      .filter((r) => !onlyReply || needsReply(r))
      .filter((r) => !needle || `${r.guest} ${r.bookingRef ?? ''} ${r.comment ?? ''}`.toLowerCase().includes(needle))
      .sort(byNewestRating)
  }, [scoped, stars, onlyReply, q])
  const listFiltered = !!(stars || onlyReply || q.trim())
  const sources = [...RATING_SOURCES, ...new Set(all.map((r) => r.source).filter((s) => !RATING_SOURCES.some((x) => x === s)))]

  function showList(patch: Record<string, string>) {
    update(patch)
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const addButton = canManage ? <button type="button" onClick={() => setPopup({ kind: 'add' })} className={solidBtnCls}>+ Add rating</button> : undefined

  const popups = (
    <>
      {popup?.kind === 'add' && <RatingFormModal onClose={close} />}
      {popup?.kind === 'reply' && (
        <ReplyModal rating={popup.rating} phone={data.bookings.find((b) => b.ref === popup.rating.bookingRef)?.phone} onClose={close} />
      )}
      {popup?.kind === 'delete' && (
        <ConfirmModal
          title="Delete rating?"
          subtitle={`${popup.rating.guest}${popup.rating.bookingRef ? ` · ${popup.rating.bookingRef}` : ''}`}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          danger
          onClose={close}
          onConfirm={async () => {
            await deleteRating(popup.rating.id)
            toast.show('Rating deleted', `${popup.rating.guest} · ${popup.rating.overall}★`)
          }}
        >
          Delete <span className="font-semibold text-dark">{popup.rating.guest}</span>’s {popup.rating.overall}★ rating
          {popup.rating.response?.trim() ? ' and its reply' : ''}? This can’t be undone.
          {popup.rating.bookingRef && ' The deletion is recorded in the booking’s stay history.'}
        </ConfirmModal>
      )}
    </>
  )

  if (all.length === 0) {
    return (
      <>
        <PageTitle title="Rating" subtitle="Guest ratings and reviews" actions={addButton} />
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <NoRatingsYet canManage={canManage} onAdd={() => setPopup({ kind: 'add' })} />
          {canManage && <CollectRatingsCard bookings={data.bookings} ratings={all} />}
        </div>
        {popups}
      </>
    )
  }

  const periodNote = period === 'All time' ? 'All time' : period

  return (
    <>
      <PageTitle title="Rating" subtitle="Guest ratings and reviews" actions={addButton} />

      {/* Scope: period and source */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Period">
          <ChoiceChips options={PERIODS} value={period} onChange={(v) => update({ period: v === 'All time' || !v ? '' : v })} small />
        </div>
        <SelectBox ariaLabel="Source" value={source} onChange={(v) => update({ source: v === 'all' ? '' : v })} className="lg:w-60">
          <option value="" hidden>All sources</option>
          <option value="all">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </SelectBox>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Average rating"
          value={<>{fmtAvg(avg)}<span className="ml-1 text-xl font-medium text-slate-400">/ 5</span></>}
          sub={
            <span className="flex flex-col gap-1.5">
              <StarDisplay value={avg ?? 0} />
              <span className="nums">{period === 'All time' ? `All time · ${reviews(bySource.length)}` : `${periodNote} · all time ${fmtAvg(avgAllTime)}`}</span>
            </span>
          }
        />
        <KpiCard label="Reviews" value={scoped.length} sub={period === 'All time' ? 'All time' : `${periodNote} · ${bySource.length} all time`} />
        <KpiCard label="5-star share" value={`${pct(fives, scoped.length)}%`} sub={scoped.length ? `${fives} of ${reviews(scoped.length)}` : 'No reviews in this period'} />
        <KpiCard
          label="Awaiting reply"
          value={awaiting}
          tone={awaiting > 0 ? 'due' : 'ink'}
          sub="≤ 3★ or with a comment, no reply yet"
          onClick={awaiting > 0 ? () => showList({ reply: '1', stars: '', q: '' }) : undefined}
        />
      </div>

      {/* Distribution, aspects, trend */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <ChartCard title="Rating distribution">
          <div className="space-y-1">
            {dist.map((d) => {
              const value: StarsFilter = d.stars <= 2 ? 'low' : (String(d.stars) as StarsFilter)
              return (
                <button
                  key={d.stars}
                  type="button"
                  onClick={() => showList({ stars: value })}
                  disabled={d.count === 0}
                  aria-label={`${d.stars} ${d.stars === 1 ? 'star' : 'stars'}: ${reviews(d.count)}, ${pct(d.count, scoped.length)}%. Show them`}
                  className="grid w-full grid-cols-[44px_minmax(0,1fr)_76px] items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-canvas disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <Bar label={<>{d.stars} <span className="text-accent">★</span></>} fill={pct(d.count, scoped.length)} color="bg-ink" value={`${d.count} · ${pct(d.count, scoped.length)}%`} />
                </button>
              )
            })}
          </div>
          {scoped.length === 0 && <p className="mt-3 text-sm text-slate-500">No reviews in this period.</p>}
        </ChartCard>

        <ChartCard title="By aspect">
          <div className="grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)_64px] items-center gap-x-3 gap-y-3.5">
            {aspects.map((a) => (
              <Bar
                key={a.aspect}
                label={RATING_ASPECT_LABELS[a.aspect]}
                fill={a.avg === null ? 0 : (a.avg / 5) * 100}
                color="bg-accent"
                value={a.avg === null ? <span className="text-slate-400">—</span> : <><span className="font-semibold text-dark">{fmtAvg(a.avg)}</span> <span className="text-xs">({a.count})</span></>}
              />
            ))}
          </div>
          <p className="mt-4 text-[13px] text-slate-500">Average out of 5 · (number of reviews that scored it)</p>
        </ChartCard>

        <ChartCard title="Average rating · last 6 months">
          <TrendChart data={trend} />
        </ChartCard>
      </div>

      {/* Reviews, with the collect-ratings helper beside them */}
      <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        {canManage && (
          <aside className="xl:order-2">
            <CollectRatingsCard bookings={data.bookings} ratings={all} />
          </aside>
        )}

        <div ref={listRef} className="min-w-0 scroll-mt-4 xl:order-1">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              type="search"
              aria-label="Search guest, booking ID or comment"
              placeholder="Search guest, booking ID or comment"
              className={`${fieldCls} md:flex-1`}
              value={q}
              onChange={(e) => update({ q: e.target.value })}
            />
            <div className="flex gap-2.5">
              <SelectBox ariaLabel="Stars" value={stars || 'all'} onChange={(v) => update({ stars: v === 'all' ? '' : v })} className="flex-1 md:w-44">
                {STARS_OPTIONS.map((o) => <option key={o.label} value={o.value || 'all'}>{o.label}</option>)}
              </SelectBox>
              <button
                type="button"
                aria-pressed={onlyReply}
                onClick={() => update({ reply: onlyReply ? '' : '1' })}
                className={`${chipCls(onlyReply)} shrink-0 !rounded-xl`}
              >
                Needs reply{awaiting > 0 && <span className={`nums ml-1.5 text-[13px] ${onlyReply ? 'text-white/70' : 'text-slate-500'}`}>{awaiting}</span>}
              </button>
            </div>
          </div>

          <div className={`${refCardCls} mt-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#efece4] px-5 py-4 sm:px-6">
              <h2 className={cardTitleCls}>Reviews</h2>
              <span className="nums text-sm text-slate-500">
                {rows.length === scoped.length ? reviews(rows.length) : `${rows.length} of ${reviews(scoped.length)}`} · {periodNote}{source ? ` · ${source}` : ''}
              </span>
            </div>
            {rows.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="font-display text-xl font-semibold text-dark">
                  {listFiltered ? 'No reviews match these filters.' : 'No reviews in this period.'}
                </p>
                {(listFiltered || period !== 'All time' || source) && (
                  <button type="button" onClick={() => update({ stars: '', reply: '', q: '', period: '', source: '' })} className={`${linkCls} mt-3 text-[15px]`}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-[#efece4]">
                {rows.map((r) => (
                  <li key={r.id} className="px-5 py-5 sm:px-6">
                    <RatingCard
                      rating={r}
                      canManage={canManage}
                      onReply={() => setPopup({ kind: 'reply', rating: r })}
                      onDelete={() => setPopup({ kind: 'delete', rating: r })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {popups}
    </>
  )
}
