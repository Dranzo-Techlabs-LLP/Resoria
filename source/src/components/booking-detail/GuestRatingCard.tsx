import { useState } from 'react'
import { Link } from 'react-router-dom'
import { can, useAuth } from '../../auth/AuthContext'
import { useStore } from '../../data/store'
import { isInHouse } from '../../lib/booking'
import { useToast } from '../ui/Toast'
import { linkCls, solidBtnCls } from '../styles'
import { RatingCard } from '../rating/RatingCard'
import { RatingFormModal } from '../rating/RatingFormModal'
import { ReplyModal } from '../rating/ReplyModal'
import { FeedbackLinkPanel } from '../rating/FeedbackLink'
import { byNewestRating, ratingsOf } from '../rating/utils'
import { ConfirmModal } from './PaymentModals'
import { DetailCard } from './parts'
import type { Booking, Rating } from '../../types'

type Popup = { kind: 'add' } | { kind: 'edit' | 'reply' | 'delete'; rating: Rating }

/** In-house and completed stays: the stay's rating(s), or ways to get one. */
export function GuestRatingCard({ booking: b }: { booking: Booking }) {
  const { user } = useAuth()
  const { data, deleteRating } = useStore()
  const toast = useToast()
  const canManage = can(user, 'manage_ratings')
  const [popup, setPopup] = useState<Popup | null>(null)
  const close = () => setPopup(null)
  const list = ratingsOf(data.ratings, b.ref).sort(byNewestRating)

  return (
    <DetailCard
      title="Guest rating"
      action={list.length > 0 ? (
        <span className="flex items-center gap-4 text-sm">
          {canManage && <button type="button" onClick={() => setPopup({ kind: 'add' })} className={linkCls}>+ Add rating</button>}
          <Link to="/rating" className="text-slate-600 hover:text-dark">All ratings</Link>
        </span>
      ) : undefined}
    >
      {list.length > 0 ? (
        <ul className="divide-y divide-[#efece4]">
          {list.map((r) => (
            <li key={r.id} className="py-4 first:pt-0 last:pb-0">
              <RatingCard
                rating={r}
                showGuest={r.guest.trim().toLowerCase() !== b.guest.trim().toLowerCase()}
                showBooking={false}
                canManage={canManage}
                onReply={() => setPopup({ kind: 'reply', rating: r })}
                onEdit={() => setPopup({ kind: 'edit', rating: r })}
                onDelete={() => setPopup({ kind: 'delete', rating: r })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div>
          <p className="text-[17px] font-medium text-dark">No rating yet</p>
          <p className="mt-1 text-[15px] text-slate-600">
            {isInHouse(b)
              ? 'Send the guest their feedback link during or after the stay, or record a rating they gave you.'
              : 'Send the guest their feedback link, or record a rating they gave by phone, in person or online.'}
          </p>
          {(canManage || b.feedbackToken) && (
            <div className="mt-4 flex flex-col gap-3">
              {canManage && (
                <div>
                  <button type="button" onClick={() => setPopup({ kind: 'add' })} className={`${solidBtnCls} !h-10 !px-4 !text-sm`}>Add rating</button>
                </div>
              )}
              <FeedbackLinkPanel booking={b} canCreate={canManage} />
            </div>
          )}
        </div>
      )}

      {popup?.kind === 'add' && <RatingFormModal booking={b} onClose={close} />}
      {popup?.kind === 'edit' && <RatingFormModal rating={popup.rating} booking={b} onClose={close} />}
      {popup?.kind === 'reply' && <ReplyModal rating={popup.rating} onClose={close} />}
      {popup?.kind === 'delete' && (
        <ConfirmModal
          title="Delete rating?"
          subtitle={`${b.guest} · ${b.ref}`}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          danger
          onClose={close}
          onConfirm={async () => {
            await deleteRating(popup.rating.id)
            toast.show('Rating deleted', `${popup.rating.guest} · ${popup.rating.overall}★`)
          }}
        >
          Delete the <span className="font-semibold text-dark">{popup.rating.overall}★</span> rating from {popup.rating.source}
          {popup.rating.response?.trim() ? ' and its reply' : ''}? This can’t be undone.
        </ConfirmModal>
      )}
    </DetailCard>
  )
}
