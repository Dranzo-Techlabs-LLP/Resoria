import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, MessageCircle } from 'lucide-react'
import { addDays, isCompleted, roomLabel } from '../../lib/booking'
import { TODAY_ISO, fmtDateShort } from '../../lib/format'
import { Pill } from '../ui/Pill'
import { cardTitleCls, linkCls, outlineBtnCls, refCardCls } from '../styles'
import { datePart } from '../booking-detail/helpers'
import { useFeedbackShare } from './FeedbackLink'
import { ratingsOf } from './utils'
import type { Booking, Rating } from '../../types'

const DAYS = 14
const SHOWN = 5
const smallBtn = `${outlineBtnCls} !h-9 !gap-1.5 !px-3 !text-sm`
const enc = encodeURIComponent

const checkedOutOn = (b: Booking) => datePart(b.checkedOutAt) || datePart(b.completedAt) || b.checkOut

/** Completed stays from the last 14 days that have no rating yet, latest check-out first. */
export function awaitingFeedback(bookings: Booking[], ratings: Rating[], today = TODAY_ISO): Booking[] {
  const from = addDays(today, -DAYS)
  return bookings
    .filter((b) => isCompleted(b) && checkedOutOn(b) >= from && ratingsOf(ratings, b.ref).length === 0)
    .sort((a, b) => checkedOutOn(b).localeCompare(checkedOutOn(a)) || b.ref.localeCompare(a.ref))
}

function ShareRow({ booking: b }: { booking: Booking }) {
  const share = useFeedbackShare(b)
  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/bookings/${enc(b.ref)}`} className="block truncate text-[15px] font-semibold text-dark hover:underline">{b.guest}</Link>
          <div className="nums truncate text-[13px] text-slate-500">{b.ref} · {roomLabel(b.villa)} · out {fmtDateShort(checkedOutOn(b))}</div>
        </div>
        {share.link && <Pill tone="green" className="shrink-0">Link ready</Pill>}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={share.copyLink} disabled={share.busy} className={smallBtn} aria-label={`Copy feedback link for ${b.guest}`}>
          <Copy size={15} aria-hidden /> Copy feedback link
        </button>
        <button type="button" onClick={share.sendWhatsApp} disabled={share.busy} className={smallBtn} aria-label={`Send feedback link to ${b.guest} on WhatsApp`}>
          <MessageCircle size={15} aria-hidden /> Send on WhatsApp
        </button>
      </div>
      {share.error && <p role="alert" className="mt-1.5 text-sm text-red-700">{share.error}</p>}
    </li>
  )
}

/** Rating page helper: the quickest way to collect ratings from guests who just left. */
export function CollectRatingsCard({ bookings, ratings }: { bookings: Booking[]; ratings: Rating[] }) {
  const list = useMemo(() => awaitingFeedback(bookings, ratings), [bookings, ratings])
  const [all, setAll] = useState(false)
  const shown = all ? list : list.slice(0, SHOWN)
  return (
    <section className={`${refCardCls} p-5 sm:p-6`} aria-labelledby="collect-ratings-title">
      <h2 id="collect-ratings-title" className={cardTitleCls}>Collect ratings</h2>
      <p className="mt-1 text-sm text-slate-600">
        Guests who checked out in the last {DAYS} days without a rating. Send them their feedback link; their rating appears here once they submit it.
      </p>
      {list.length === 0 ? (
        <p className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm text-slate-600">Every guest who checked out in the last {DAYS} days has a rating.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-[#efece4]">
            {shown.map((b) => <ShareRow key={b.id} booking={b} />)}
          </ul>
          {list.length > SHOWN && (
            <button type="button" onClick={() => setAll((v) => !v)} className={`${linkCls} mt-4 text-sm`}>
              {all ? 'Show fewer' : `Show all ${list.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
