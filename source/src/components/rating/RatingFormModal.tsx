import { useMemo, useState } from 'react'
import { useStore } from '../../data/store'
import { RATING_ASPECTS, RATING_ASPECT_LABELS, RATING_SOURCES, type Booking, type Rating, type RatingAspect } from '../../types'
import { fmtStay, roomLabel } from '../../lib/booking'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { Field, SelectBox, invalidCls } from '../booking/FormParts'
import { fieldAreaCls, fieldCls, labelCls } from '../styles'
import { FormError, PopupActions, SandBox } from '../booking-detail/parts'
import { todayISO } from '../booking-detail/helpers'
import { BookingPicker } from './BookingPicker'
import { StarInput } from './Stars'
import { GUEST_LINK_SOURCE, errText, rateableBookings } from './utils'

type Aspects = Record<RatingAspect, number>
const NO_ASPECTS = Object.fromEntries(RATING_ASPECTS.map((a) => [a, 0])) as Aspects

/** Sources staff can pick (guest-link ratings only come from the guest's own page). */
const STAFF_SOURCES = RATING_SOURCES.filter((s) => s !== GUEST_LINK_SOURCE)

interface Errors { guest?: string; source?: string; date?: string; overall?: string }

/**
 * Add a rating, or edit one staff recorded. `booking` links it to that stay (fixed, from the booking page);
 * otherwise a booking can be picked from in-house and completed stays.
 */
export function RatingFormModal({ rating, booking, onClose }: { rating?: Rating; booking?: Booking; onClose: () => void }) {
  const { data, addRating, updateRating } = useStore()
  const toast = useToast()
  const editing = !!rating
  const [bookingRef, setBookingRef] = useState(rating?.bookingRef ?? booking?.ref ?? '')
  const [guest, setGuest] = useState(rating?.guest ?? booking?.guest ?? '')
  const [source, setSource] = useState(rating?.source ?? '')
  const [date, setDate] = useState(rating?.date ?? todayISO())
  const [overall, setOverall] = useState(rating?.overall ?? 0)
  const [aspects, setAspects] = useState<Aspects>({ ...NO_ASPECTS, ...(rating?.aspects ?? {}) })
  const [comment, setComment] = useState(rating?.comment ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // In-house and completed stays, plus the stay this rating is already linked to
  const choices = useMemo(() => {
    const list = rateableBookings(data.bookings)
    const linked = rating?.bookingRef ? data.bookings.find((b) => b.ref === rating.bookingRef) : undefined
    return linked && !list.includes(linked) ? [linked, ...list] : list
  }, [data.bookings, rating?.bookingRef])
  const sources = rating && !STAFF_SOURCES.some((s) => s === rating.source) ? [...STAFF_SOURCES, rating.source] : STAFF_SOURCES
  const today = todayISO()

  function validate(): Errors {
    const e: Errors = {}
    if (!guest.trim()) e.guest = 'Enter the guest name.'
    if (!source) e.source = 'Choose where the rating came from.'
    if (!date) e.date = 'Choose the date of the review.'
    else if (date > today) e.date = 'The review date can’t be in the future.'
    if (overall < 1) e.overall = 'Choose the overall rating.'
    return e
  }

  async function save() {
    const found = validate()
    setErrors(found)
    setError('')
    if (Object.keys(found).length) return
    const filled = Object.fromEntries(RATING_ASPECTS.filter((a) => aspects[a] > 0).map((a) => [a, aspects[a]])) as Partial<Aspects>
    const fields = { bookingRef, guest: guest.trim(), source, date, overall, aspects: filled, comment: comment.trim() }
    setBusy(true)
    try {
      if (rating) await updateRating(rating.id, fields)
      else await addRating(fields)
      toast.show(editing ? 'Rating updated' : 'Rating added', `${fields.guest} · ${overall}★${bookingRef ? ` · ${bookingRef}` : ''}`)
      onClose()
    } catch (e) {
      setError(errText(e, 'Could not save the rating. Please try again.'))
      setBusy(false)
    }
  }

  const fixed = booking ?? null
  const clear = (k: keyof Errors) => setErrors((x) => ({ ...x, [k]: undefined }))

  return (
    <Modal
      title={editing ? 'Edit rating' : 'Add rating'}
      subtitle={fixed ? `${fixed.guest} · ${fixed.ref}` : 'A rating the guest gave by phone, in person or online'}
      size="lg"
      onClose={() => { if (!busy) onClose() }}
    >
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save() }} noValidate>
        {fixed ? (
          <SandBox>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Booking</div>
            <div className="mt-1 font-semibold text-dark">{fixed.guest} · {fixed.ref}</div>
            <div className="nums text-sm text-slate-600">{roomLabel(fixed.villa)} · {fmtStay(fixed)}</div>
          </SandBox>
        ) : (
          <div>
            <label htmlFor="rating-booking" className={labelCls}>Booking <span className="font-normal text-slate-500">(optional)</span></label>
            <BookingPicker
              id="rating-booking"
              bookings={choices}
              ratings={data.ratings}
              value={bookingRef}
              describedBy="rating-booking-hint"
              onChange={(b) => {
                setBookingRef(b?.ref ?? '')
                if (b) { setGuest(b.guest); clear('guest') }
              }}
            />
            <p id="rating-booking-hint" className="mt-1.5 text-[13px] text-slate-500">
              Link the stay it’s about (in-house and completed bookings). Leave empty for a public review you can’t match to a booking.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Guest name*" htmlFor="rating-guest" error={errors.guest} className="sm:col-span-2">
            <input
              id="rating-guest"
              className={`${fieldCls} ${errors.guest ? invalidCls : ''}`}
              value={guest}
              autoComplete="off"
              aria-invalid={!!errors.guest || undefined}
              aria-describedby={errors.guest ? 'rating-guest-error' : undefined}
              onChange={(e) => { setGuest(e.target.value); clear('guest') }}
            />
          </Field>
          <Field label="Source*" htmlFor="rating-source" error={errors.source}>
            <SelectBox id="rating-source" value={source} invalid={!!errors.source} onChange={(v) => { setSource(v); clear('source') }}>
              <option value="" disabled>Choose a source</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </SelectBox>
          </Field>
          <Field label="Date*" htmlFor="rating-date" error={errors.date}>
            <input
              id="rating-date"
              type="date"
              max={today}
              className={`${fieldCls} ${errors.date ? invalidCls : ''}`}
              value={date}
              aria-invalid={!!errors.date || undefined}
              aria-describedby={errors.date ? 'rating-date-error' : undefined}
              onChange={(e) => { setDate(e.target.value); clear('date') }}
            />
          </Field>
        </div>

        <StarInput label="Overall rating" required value={overall} error={errors.overall} onChange={(v) => { setOverall(v); clear('overall') }} />

        <div className="rounded-2xl border border-[#e6e1d6] px-4 py-4 sm:px-5">
          <div className="mb-2 text-sm font-medium text-slate-700">Aspects <span className="font-normal text-slate-500">(optional)</span></div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {RATING_ASPECTS.map((a) => (
              <StarInput
                key={a}
                size="sm"
                clearable
                label={RATING_ASPECT_LABELS[a]}
                value={aspects[a]}
                onChange={(v) => setAspects((x) => ({ ...x, [a]: v }))}
              />
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="rating-comment" className={labelCls}>Comment <span className="font-normal text-slate-500">(optional)</span></label>
          <textarea
            id="rating-comment"
            rows={4}
            maxLength={3000}
            className={fieldAreaCls}
            placeholder="What the guest said about the stay"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        <FormError>{error}</FormError>
        <PopupActions
          onCancel={onClose}
          onSubmit={() => void save()}
          label={editing ? 'Save changes' : 'Add rating'}
          busyLabel="Saving…"
          busy={busy}
        />
      </form>
    </Modal>
  )
}
