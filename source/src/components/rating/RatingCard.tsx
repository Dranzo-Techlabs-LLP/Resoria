import { Link } from 'react-router-dom'
import { MessageSquareReply } from 'lucide-react'
import { RATING_ASPECTS, RATING_ASPECT_LABELS, type Rating } from '../../types'
import { fmtDate } from '../../lib/format'
import { fmtDateTime } from '../../lib/booking'
import { KebabMenu } from '../ui/KebabMenu'
import { Pill } from '../ui/Pill'
import { linkCls, outlineBtnCls } from '../styles'
import { StarDisplay } from './Stars'
import { isGuestSubmitted, needsReply } from './utils'

const enc = encodeURIComponent

/** One review: stars, date, source, linked booking, aspect scores, comment and the resort's reply. */
export function RatingCard({
  rating: r, showGuest = true, showBooking = true, canManage, onReply, onDelete,
}: {
  rating: Rating
  showGuest?: boolean
  showBooking?: boolean
  canManage: boolean
  onReply: () => void
  onDelete: () => void
}) {
  const guestLink = isGuestSubmitted(r)
  const aspects = RATING_ASPECTS.filter((a) => (r.aspects?.[a] ?? 0) > 0)
  const comment = (r.comment ?? '').trim()
  const reply = (r.response ?? '').trim()
  const who = `${r.guest}’s rating`
  return (
    <article className="min-w-0" aria-label={`${who}, ${r.overall} out of 5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showGuest && <h3 className="truncate text-[17px] font-semibold text-dark">{r.guest}</h3>}
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-500 ${showGuest ? 'mt-1' : ''}`}>
            <span className="inline-flex items-center gap-1.5">
              <StarDisplay value={r.overall} />
              <span className="nums font-semibold text-dark" aria-hidden>{r.overall}</span>
            </span>
            <span className="nums">{fmtDate(r.date)}</span>
            <Pill tone={guestLink ? 'green' : 'grey'}>{r.source}</Pill>
            {showBooking && r.bookingRef && (
              <Link to={`/bookings/${enc(r.bookingRef)}`} className={`${linkCls} nums`} aria-label={`Booking ${r.bookingRef}`}>{r.bookingRef}</Link>
            )}
            {needsReply(r) && <Pill tone="amber">Needs reply</Pill>}
          </div>
        </div>
        {canManage && (
          <KebabMenu
            label={`Actions for ${who}`}
            items={[{ label: 'Delete', onClick: onDelete, danger: true }]}
          />
        )}
      </div>

      {aspects.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Aspect scores">
          {aspects.map((a) => (
            <li key={a} className="nums inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 text-[13px] text-slate-700">
              {RATING_ASPECT_LABELS[a]} <span className="font-semibold text-dark">{r.aspects[a]}</span>
              <span aria-hidden className="text-accent">★</span>
            </li>
          ))}
        </ul>
      )}

      {comment
        ? <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-relaxed text-slate-700">“{comment}”</p>
        : <p className="mt-3 text-sm text-slate-400">No comment.</p>}
      {guestLink && canManage && <p className="mt-2 text-[13px] text-slate-500">Submitted by the guest through the feedback link.</p>}

      {reply ? (
        <div className="mt-4 rounded-xl border-l-[3px] border-ink bg-canvas px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Our reply{r.respondedAt ? <span className="nums font-normal normal-case tracking-normal"> · {fmtDateTime(r.respondedAt)}</span> : null}
            </span>
            {canManage && <button type="button" onClick={onReply} className={`${linkCls} text-sm`}>Edit reply</button>}
          </div>
          <p className="mt-1.5 whitespace-pre-line break-words text-[15px] text-slate-700">{reply}</p>
        </div>
      ) : canManage ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button type="button" onClick={onReply} className={`${outlineBtnCls} !h-10 !px-4 !text-sm`}>
            <MessageSquareReply size={16} aria-hidden /> Reply
          </button>
          <span className="text-[13px] text-slate-500">Write the resort’s response: it’s saved with the review{r.bookingRef ? ' and can be sent to the guest on WhatsApp' : ''}.</span>
        </div>
      ) : null}
    </article>
  )
}
