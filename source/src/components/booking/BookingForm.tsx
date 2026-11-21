// ------------------------------------------------------------------
//  New / Edit booking form (change sheet 3.0 rows 36–45): guest, stay,
//  source, payment and notes on the left, a live sticky summary with the
//  submit button on the right (below the form on small screens).
// ------------------------------------------------------------------
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { can, useAuth } from '../../auth/AuthContext'
import { effectiveRate, useStore } from '../../data/store'
import { api, openFile, readFileUpload, type BookingWrite, type FileUpload } from '../../lib/api'
import { PAY_METHODS, addDays, agentCommission, isCancelled, isInHouse, nightsOf, roomPaid, sourceType } from '../../lib/booking'
import { FULL_PROPERTY, ROOM_NAMES, bookingRooms, roomCapacity } from '../../lib/config'
import { fmtDateShort, formatINR } from '../../lib/format'
import { ChoiceChips, MultiChips } from '../ui/Chips'
import { bigPrimaryBtnCls, capsLabelCls, cardTitleCls, fieldAreaCls, fieldCls, labelCls, refCardCls } from '../styles'
import type { AppData, Booking, BookingSource, NamedOption } from '../../types'
import { DocumentField, Field, MoneyInput, SelectBox, invalidCls, isAllowedDocument } from './FormParts'

const SOURCES: readonly BookingSource[] = ['Direct', 'B2B', 'OTA', 'Management Referral']
type PayMethod = (typeof PAY_METHODS)[number]

type FieldKey =
  | 'guest' | 'phone' | 'place' | 'document' | 'rooms' | 'checkIn' | 'checkOut' | 'adults'
  | 'source' | 'agent' | 'platform' | 'referrer' | 'total' | 'advance' | 'method'

const FIELD_LABEL: Record<FieldKey, string> = {
  guest: 'Guest name', phone: 'Phone', place: 'Place', document: 'Attach document', rooms: 'Rooms',
  checkIn: 'Check-in', checkOut: 'Check-out', adults: 'Adults', source: 'Source', agent: 'Agent name',
  platform: 'OTA platform', referrer: 'Referred by', total: 'Total amount', advance: 'Advance amount', method: 'Payment mode',
}

interface FormState {
  guest: string
  phone: string
  place: string
  rooms: string[]
  checkIn: string
  checkOut: string
  adults: string
  kids: string
  source: BookingSource | ''
  agent: string
  platform: string
  referrer: string
  total: string // digits; used once the amount was typed (totalManual)
  totalManual: boolean // false = follow the calculated amount
  advance: string
  method: PayMethod | ''
  notes: string
}

/** Room amount for the chosen rooms and dates: Σ nightly rate × nights. */
function calcTotal(data: AppData, rooms: string[], checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0
  return rooms.reduce((s, r) => s + effectiveRate(r, data), 0) * nightsOf({ checkIn, checkOut })
}

function initialState(data: AppData, booking?: Booking, room?: string, checkIn?: string): FormState {
  if (!booking) {
    return {
      guest: '', phone: '', place: '',
      rooms: room ? [room] : [], checkIn: checkIn ?? '', checkOut: checkIn ? addDays(checkIn, 1) : '',
      adults: '', kids: '0',
      source: '', agent: '', platform: '', referrer: '',
      total: '', totalManual: false, advance: '', method: '', notes: '',
    }
  }
  const rooms = bookingRooms(booking.villa).filter((r) => ROOM_NAMES.includes(r))
  const type = sourceType(booking)
  const detail = (booking.sourceDetail ?? '').trim()
  const adv = booking.payments.find((p) => p.advance)
  const calc = calcTotal(data, rooms, booking.checkIn, booking.checkOut)
  return {
    guest: booking.guest,
    phone: booking.phone,
    place: booking.place ?? '',
    rooms,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    adults: String(booking.adults ?? Math.max(1, booking.guests - (booking.kids ?? 0))),
    kids: String(booking.kids ?? 0),
    source: type === 'Referral' ? 'Management Referral' : type === 'Other' ? '' : type,
    agent: type === 'B2B' ? detail : '',
    // older OTA bookings kept the platform in `source` ("Booking.com")
    platform: type === 'OTA' ? detail || (/^ota\b/i.test(booking.source) ? '' : booking.source) : '',
    referrer: type === 'Referral' ? detail : '',
    total: String(booking.total),
    totalManual: calc <= 0 || booking.total !== calc,
    advance: adv ? String(adv.amount) : '',
    method: PAY_METHODS.find((m) => m.toLowerCase() === (adv?.method ?? '').toLowerCase()) ?? '',
    notes: booking.notes ?? '',
  }
}

/** What an in-house booking may still change: the guest details only. */
export type GuestDetailsWrite = Pick<BookingWrite, 'guest' | 'phone' | 'altPhone' | 'email' | 'place' | 'document'>
const GUEST_KEYS: readonly FieldKey[] = ['guest', 'phone', 'place', 'document']

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
function joinList(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function BookingForm({ booking, initialRoom, initialCheckIn, submitLabel, busyLabel, onSubmit, onSubmitGuest }: {
  /** Edit mode when given. */
  booking?: Booking
  /** New booking prefill (?room=…&checkIn=…). */
  initialRoom?: string
  initialCheckIn?: string
  submitLabel: string
  busyLabel: string
  /** Saves the booking; throws with a readable message on failure. */
  onSubmit: (input: BookingWrite) => Promise<void>
  /** In-house bookings: saves the guest details only (everything else is locked after check-in). */
  onSubmitGuest?: (input: GuestDetailsWrite) => Promise<void>
}) {
  const { user } = useAuth()
  const { data } = useStore()
  const isEdit = !!booking
  const inHouse = !!booking && isInHouse(booking)
  const guestOnly = inHouse && !!onSubmitGuest // after check-in only the guest details can change
  const canEditAmount = can(user, 'edit_bookings')

  const [f, setF] = useState<FormState>(() => initialState(data, booking, initialRoom, initialCheckIn))
  const [touched, setTouched] = useState<ReadonlySet<FieldKey>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)
  const [doc, setDoc] = useState<{ file: File; upload: FileUpload } | null>(null)
  const [docBusy, setDocBusy] = useState(false)
  const [docError, setDocError] = useState('')
  const [viewError, setViewError] = useState('')
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const touch = (k: FieldKey) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)))

  // ---- Derived values ----
  const datesOk = !!f.checkIn && !!f.checkOut && f.checkOut > f.checkIn
  const nights = datesOk ? nightsOf(f) : 0
  const rooms = ROOM_NAMES.filter((r) => f.rooms.includes(r)) // ROOMS order
  const villa = booking?.villa === FULL_PROPERTY && rooms.length === ROOM_NAMES.length ? FULL_PROPERTY : rooms.join(', ')
  const calculated = calcTotal(data, rooms, f.checkIn, f.checkOut)
  const totalStr = f.totalManual ? f.total : calculated > 0 ? String(calculated) : ''
  const total = Number(totalStr || 0)
  const advance = Number(f.advance || 0)
  const adults = Number(f.adults || 0)
  const kids = Number(f.kids || 0)

  // Rooms another booking holds on any night of the chosen stay
  const taken = useMemo(() => {
    const m = new Map<string, Booking>()
    if (!datesOk) return m
    for (const b of data.bookings) {
      if (isCancelled(b) || b.ref === booking?.ref) continue
      if (!(b.checkIn < f.checkOut && f.checkIn < b.checkOut)) continue
      for (const r of bookingRooms(b.villa)) if (!m.has(r)) m.set(r, b)
    }
    return m
  }, [data.bookings, booking?.ref, datesOk, f.checkIn, f.checkOut])
  const clashes = rooms.filter((r) => taken.has(r))
  // "Book all rooms": every room that's free for the chosen dates
  const freeRooms = ROOM_NAMES.filter((r) => !taken.has(r))
  const allFreeChosen = freeRooms.length > 0 && freeRooms.every((r) => rooms.includes(r))
  // Nightly rate of each room as booked (kept for rooms already on the booking): splits a group booking by room
  const rateOf = (r: string) => booking?.roomRates?.[r] ?? effectiveRate(r, data)

  const capacity = rooms.reduce((s, r) => s + (data.villaOverrides[r]?.maxGuests ?? roomCapacity(r).max), 0)
  const overCapacity = rooms.length > 0 && adults + kids > capacity

  // B2B commission: keep the saved figure while agent and amount are unchanged
  const sameB2b = !!booking && sourceType(booking) === 'B2B' && (booking.sourceDetail ?? '') === f.agent && booking.total === total
  const commission = f.source === 'B2B' && f.agent
    ? (sameB2b && booking?.commission != null ? booking.commission : agentCommission(data, f.agent, total))
    : 0

  // Payments already on the booking besides its advance (edit)
  const advPay = booking?.payments.find((p) => p.advance)
  const otherPaid = booking ? roomPaid(booking) - (advPay?.amount ?? 0) + (booking.b2bExternal ?? 0) : 0
  const balance = Math.max(0, total - advance - otherPaid)

  // ---- Validation ----
  const errors: Partial<Record<FieldKey, string>> = {}
  if (!f.guest.trim()) errors.guest = 'Enter the guest name.'
  if (!f.phone.trim()) errors.phone = 'Enter the phone number.'
  else if (f.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a valid phone number (at least 10 digits).'
  if (!f.place.trim()) errors.place = 'Enter the place.'
  if (!isEdit && !doc) errors.document = docError || 'Attach the guest’s ID proof (PDF, JPG, PNG or WEBP, up to 5 MB).'
  if (!rooms.length) errors.rooms = 'Select at least one room.'
  else if (clashes.length) errors.rooms = `${joinList(clashes)} ${clashes.length === 1 ? 'is' : 'are'} already booked for these dates.`
  if (!f.checkIn) errors.checkIn = 'Select the check-in date.'
  if (!f.checkOut) errors.checkOut = 'Select the check-out date.'
  else if (f.checkIn && f.checkOut <= f.checkIn) errors.checkOut = 'Check-out must be after check-in.'
  if (!f.adults) errors.adults = 'Enter the number of adults.'
  else if (adults < 1) errors.adults = 'At least 1 adult.'
  if (!f.source) errors.source = 'Select the booking source.'
  else if (f.source === 'B2B' && !f.agent) errors.agent = 'Select the agent.'
  else if (f.source === 'OTA' && !f.platform) errors.platform = 'Select the OTA platform.'
  else if (f.source === 'Management Referral' && !f.referrer) errors.referrer = 'Select who referred the booking.'
  const zeroAllowed = f.source === 'Management Referral' || booking?.total === 0
  if (totalStr === '') errors.total = 'Enter the total amount.'
  else if (total === 0 && !zeroAllowed) errors.total = 'Only a Management Referral can be ₹0 (complimentary).'
  if (totalStr !== '' && advance > total) errors.advance = 'The advance can’t be more than the total amount.'
  if (advance > 0 && !f.method) errors.method = 'Select the payment mode of the advance.'

  if (guestOnly) for (const k of Object.keys(errors) as FieldKey[]) if (!GUEST_KEYS.includes(k)) delete errors[k]
  const errorKeys = Object.keys(errors) as FieldKey[]
  const valid = errorKeys.length === 0
  const shown = (k: FieldKey) => ((submitted || touched.has(k)) ? errors[k] : undefined)
  const docMessage = docError || shown('document')
  const roomsMessage = clashes.length ? errors.rooms : shown('rooms') // a clash shows right away (e.g. a prefilled room)

  // ---- Handlers ----
  function setCheckIn(v: string) {
    // keep at least one night: move check-out to the next day when needed
    setF((s) => ({ ...s, checkIn: v, checkOut: v && (!s.checkOut || s.checkOut <= v) ? addDays(v, 1) : s.checkOut }))
    touch('checkIn')
  }

  async function pickDocument(file: File) {
    setViewError('')
    touch('document')
    if (!isAllowedDocument(file)) { setDocError('Use a PDF, JPG, PNG or WEBP file.'); return }
    setDocBusy(true)
    try {
      const upload = await readFileUpload(file, 5)
      setDoc({ file, upload })
      setDocError('')
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'Could not read the file.')
    } finally {
      setDocBusy(false)
    }
  }

  function viewDocument() {
    setViewError('')
    if (doc) {
      const url = URL.createObjectURL(doc.file)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } else if (booking) {
      openFile(api.documentPath(booking.ref)).catch((e: unknown) => setViewError(e instanceof Error ? e.message : 'Could not open the document.'))
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!valid || busy) return
    setBusy(true)
    setServerError('')
    if (guestOnly && onSubmitGuest) {
      const guestInput: GuestDetailsWrite = {
        guest: f.guest.trim(), phone: f.phone.trim(), place: f.place.trim(),
        altPhone: booking?.altPhone ?? '', email: booking?.email ?? '',
      }
      if (doc) guestInput.document = doc.upload
      try {
        await onSubmitGuest(guestInput)
      } catch (err) {
        setServerError(err instanceof Error ? err.message : 'Could not save the guest details.')
        setBusy(false)
      }
      return
    }
    const source = f.source as BookingSource
    const sourceDetail = source === 'B2B' ? f.agent : source === 'OTA' ? f.platform : source === 'Management Referral' ? f.referrer : ''
    const sameStay = !!booking && booking.villa === villa && booking.checkIn === f.checkIn && booking.checkOut === f.checkOut
    const input: BookingWrite = {
      guest: f.guest.trim(),
      phone: f.phone.trim(),
      altPhone: booking?.altPhone ?? '',
      email: booking?.email ?? '',
      place: f.place.trim(),
      villa,
      checkIn: f.checkIn,
      checkOut: f.checkOut,
      adults,
      kids,
      guests: adults + kids,
      status: booking?.status ?? 'confirmed',
      total,
      // the calculated room amount, kept for reporting (the typed amount when no room rates are set)
      originalTotal: sameStay && booking?.originalTotal != null ? booking.originalTotal : calculated > 0 ? calculated : total,
      source,
      sourceDetail,
      commission: source === 'B2B' ? commission : 0,
      roomRates: Object.fromEntries(rooms.map((r) => [r, rateOf(r)])),
      advance,
      advanceMethod: advance > 0 ? f.method : undefined,
      notes: f.notes.trim(),
    }
    if (doc) input.document = doc.upload // edit: only when a new file was picked
    try {
      await onSubmit(input)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save the booking.')
      setBusy(false)
    }
  }

  // ---- Summary text ----
  const roomText = villa === FULL_PROPERTY ? 'Full Property' : rooms.join(', ')
  const stayText = datesOk ? `${fmtDateShort(f.checkIn)} – ${fmtDateShort(f.checkOut)} · ${plural(nights, 'night', 'nights')}` : ''
  const guestText = f.adults ? [plural(adults, 'adult', 'adults'), kids > 0 ? plural(kids, 'kid', 'kids') : ''].filter(Boolean).join(', ') : ''

  let totalHint: ReactNode = null
  if (f.totalManual && calculated > 0 && total !== calculated) {
    totalHint = (
      <>Calculated {formatINR(calculated)} ·{' '}
        <button type="button" className="font-medium text-dark underline underline-offset-2" onClick={() => setF((s) => ({ ...s, totalManual: false }))}>Use calculated</button>
      </>
    )
  } else if (!f.totalManual && calculated > 0) {
    totalHint = `Room rate × ${plural(nights, 'night', 'nights')}`
  } else if (rooms.length && datesOk && calculated === 0) {
    totalHint = 'No room rate set in Configuration → Rooms. Enter the amount.'
  }

  return (
    <form onSubmit={submit} noValidate className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        {serverError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
        )}
        {guestOnly && (
          <div className="rounded-xl border border-[#e6e1d6] bg-sand px-4 py-3 text-sm leading-relaxed text-slate-700">
            <span className="font-semibold text-dark">The guest is in-house.</span> Only the guest details can be edited now. Rooms, dates, source,
            payment and notes are locked after check-in.
          </div>
        )}

        {/* A · Guest details */}
        <Section title="A · Guest details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guest name*" htmlFor="bk-guest" error={shown('guest')}>
              <input id="bk-guest" className={`${fieldCls} ${shown('guest') ? invalidCls : ''}`} value={f.guest} autoComplete="off"
                placeholder="Enter guest name" aria-invalid={!!shown('guest') || undefined} aria-describedby={shown('guest') ? 'bk-guest-error' : undefined}
                onChange={(e) => set('guest', e.target.value)} onBlur={() => touch('guest')} />
            </Field>
            <Field label="Phone*" htmlFor="bk-phone" error={shown('phone')}>
              <input id="bk-phone" type="tel" inputMode="tel" className={`${fieldCls} nums ${shown('phone') ? invalidCls : ''}`} value={f.phone} autoComplete="off"
                placeholder="Enter phone number" aria-invalid={!!shown('phone') || undefined} aria-describedby={shown('phone') ? 'bk-phone-error' : undefined}
                onChange={(e) => set('phone', e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 20))} onBlur={() => touch('phone')} />
            </Field>
            <Field label="Place*" htmlFor="bk-place" error={shown('place')}>
              <input id="bk-place" className={`${fieldCls} ${shown('place') ? invalidCls : ''}`} value={f.place} autoComplete="off"
                placeholder="Enter place" aria-invalid={!!shown('place') || undefined} aria-describedby={shown('place') ? 'bk-place-error' : undefined}
                onChange={(e) => set('place', e.target.value)} onBlur={() => touch('place')} />
            </Field>
            <Field label={isEdit ? 'Attach document' : 'Attach document*'} htmlFor="bk-doc" error={docMessage || viewError || undefined}
              hint={isEdit && !doc && !booking?.documentName ? 'No ID proof attached yet.' : undefined}>
              <DocumentField id="bk-doc" fileName={doc?.file.name ?? booking?.documentName ?? ''} busy={docBusy}
                invalid={!!docMessage} onPick={pickDocument} onView={viewDocument} />
            </Field>
          </div>
        </Section>

        {/* B–E are locked once the guest is in-house */}
        <fieldset disabled={guestOnly} className={`min-w-0 space-y-5 ${guestOnly ? 'opacity-60' : ''}`} aria-label={guestOnly ? 'Locked after check-in' : undefined}>
        {/* B · Stay details */}
        <Section title="B · Stay details">
          <div role="group" aria-labelledby="bk-rooms-label">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span id="bk-rooms-label" className={capsLabelCls}>Rooms*</span>
              {!guestOnly && freeRooms.length > 1 && (
                <button
                  type="button"
                  className="mb-2 text-sm font-medium text-dark underline underline-offset-2 hover:text-ink-hover"
                  onClick={() => { set('rooms', allFreeChosen ? [] : freeRooms); touch('rooms') }}
                >
                  {allFreeChosen
                    ? 'Clear all rooms'
                    : freeRooms.length === ROOM_NAMES.length ? `Book all rooms (${freeRooms.length})` : `Book all available rooms (${freeRooms.length})`}
                </button>
              )}
            </div>
            <MultiChips
              options={ROOM_NAMES}
              value={rooms}
              onChange={(v) => { set('rooms', v); touch('rooms') }}
              isDisabled={(r) => taken.has(r)}
              title={(r) => {
                const b = taken.get(r)
                return b ? `Booked by ${b.guest} (${b.ref}), ${fmtDateShort(b.checkIn)} – ${fmtDateShort(b.checkOut)}` : undefined
              }}
            />
            {roomsMessage
              ? <p className="mt-2 text-[13px] text-red-700">{roomsMessage}</p>
              : taken.size > 0 && <p className="mt-2 text-[13px] text-slate-500">Greyed-out rooms are already booked for these dates.</p>}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Check-in*" htmlFor="bk-in" error={shown('checkIn')} hint={inHouse ? 'Locked after check-in.' : undefined}>
              <input id="bk-in" type="date" className={`${fieldCls} ${shown('checkIn') ? invalidCls : ''}`} value={f.checkIn} disabled={inHouse}
                aria-invalid={!!shown('checkIn') || undefined} onChange={(e) => setCheckIn(e.target.value)} onBlur={() => touch('checkIn')} />
            </Field>
            <Field label="Check-out*" htmlFor="bk-out" error={shown('checkOut')}>
              <input id="bk-out" type="date" className={`${fieldCls} ${shown('checkOut') ? invalidCls : ''}`} value={f.checkOut}
                min={f.checkIn ? addDays(f.checkIn, 1) : undefined} aria-invalid={!!shown('checkOut') || undefined}
                onChange={(e) => { set('checkOut', e.target.value); touch('checkOut') }} onBlur={() => touch('checkOut')} />
            </Field>
            <Field label="Adults*" htmlFor="bk-adults" error={shown('adults')}>
              <input id="bk-adults" inputMode="numeric" className={`${fieldCls} nums ${shown('adults') ? invalidCls : ''}`} value={f.adults}
                placeholder="Enter number" autoComplete="off" aria-invalid={!!shown('adults') || undefined}
                onChange={(e) => set('adults', e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => touch('adults')} />
            </Field>
            <Field label="Kids" htmlFor="bk-kids">
              <input id="bk-kids" inputMode="numeric" className={`${fieldCls} nums`} value={f.kids} placeholder="0" autoComplete="off"
                onChange={(e) => set('kids', e.target.value.replace(/\D/g, '').slice(0, 3))} />
            </Field>
          </div>
          {overCapacity && (
            <p className="mt-3 rounded-xl bg-due-soft px-4 py-2.5 text-[13px] text-due">
              {plural(adults + kids, 'guest', 'guests')} is more than the selected {rooms.length === 1 ? 'room holds' : 'rooms hold'} ({capacity}). Add a room or check the guest count.
            </p>
          )}
        </Section>

        {/* C · Booking source */}
        <Section title="C · Booking source">
          <div role="group" aria-labelledby="bk-source-label">
            <span id="bk-source-label" className={capsLabelCls}>Source*</span>
            <ChoiceChips options={SOURCES} value={f.source} onChange={(v) => { set('source', v); touch('source') }} />
            {shown('source') && <p className="mt-2 text-[13px] text-red-700">{shown('source')}</p>}
          </div>

          {f.source === 'B2B' && (
            <div className="mt-5 space-y-4">
              <DetailSelect id="bk-agent" label="Agent name*" placeholder="Select agent" value={f.agent}
                options={data.settings.agents} error={shown('agent')} emptyText="No agents yet." configTab="agents" configLabel="Add agents in Configuration"
                onChange={(v) => { set('agent', v); touch('agent') }} />
              <InfoBox>
                <span className="font-semibold text-dark">B2B commission:</span> calculated from the agent’s configuration
                {' '}(<span className="nums font-medium text-dark">{f.agent ? formatINR(commission) : 'select an agent'}</span>) and recorded
                {' '}automatically under Expenses as pending. Pay it from there when it’s due.
              </InfoBox>
            </div>
          )}
          {f.source === 'OTA' && (
            <div className="mt-5">
              <DetailSelect id="bk-ota" label="OTA platform*" placeholder="Select platform" value={f.platform}
                options={data.settings.otaPlatforms} error={shown('platform')} emptyText="No OTA platforms yet." configTab="ota" configLabel="Add OTA platforms in Configuration"
                onChange={(v) => { set('platform', v); touch('platform') }} />
            </div>
          )}
          {f.source === 'Management Referral' && (
            <div className="mt-5 space-y-4">
              <DetailSelect id="bk-ref" label="Referred by*" placeholder="Select management member" value={f.referrer}
                options={data.settings.referrers} error={shown('referrer')} emptyText="No management members yet." configTab="referrers" configLabel="Add referrers in Configuration"
                onChange={(v) => { set('referrer', v); touch('referrer') }} />
              <InfoBox>
                <span className="font-semibold text-dark">Calculated amount:</span>{' '}
                <span className="nums font-medium text-dark">{calculated > 0 ? formatINR(calculated) : '—'}</span>, kept for management reporting.
                {' '}Set the final amount under Payment: it can be reduced, increased or ₹0 for a complimentary stay.
              </InfoBox>
            </div>
          )}
        </Section>

        {/* D · Payment */}
        <Section title="D · Payment">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={totalStr ? 'Total amount (editable if authorised)' : 'Total amount'} htmlFor="bk-total" error={shown('total')} hint={totalHint}>
              <MoneyInput id="bk-total" value={totalStr} placeholder="Auto-calculated" disabled={!canEditAmount} invalid={!!shown('total')}
                onChange={(v) => setF((s) => ({ ...s, total: v, totalManual: true }))} onBlur={() => touch('total')} />
            </Field>
            <Field label="Advance amount" htmlFor="bk-advance" error={shown('advance')}
              hint={inHouse ? 'Already collected. Record further payments on the booking page.' : undefined}>
              <MoneyInput id="bk-advance" value={f.advance} placeholder="₹0" disabled={inHouse} invalid={!!shown('advance')}
                onChange={(v) => set('advance', v)} onBlur={() => touch('advance')} />
            </Field>
          </div>
          <div role="group" aria-labelledby="bk-method-label" className="mt-5">
            <div className="mb-2 text-xs text-slate-500">
              <span id="bk-method-label" className="font-semibold uppercase tracking-[0.12em]">Payment mode</span> · required when an advance is entered
            </div>
            <ChoiceChips options={PAY_METHODS} value={f.method} disabled={inHouse} clearable={!inHouse}
              onChange={(v) => { set('method', v); touch('method') }} />
            {shown('method') && <p className="mt-2 text-[13px] text-red-700">{shown('method')}</p>}
          </div>
        </Section>

        {/* E · Notes */}
        <Section title="E · Notes">
          <label htmlFor="bk-notes" className={labelCls}>Special requests and staff instructions</label>
          <textarea id="bk-notes" rows={3} className={fieldAreaCls} value={f.notes} placeholder="Anything to remember about this booking…"
            onChange={(e) => set('notes', e.target.value)} />
        </Section>
        </fieldset>
      </div>

      {/* Booking summary (sticky on wide screens, below the form on phones) */}
      <aside className="min-w-0 lg:sticky lg:top-8">
        <div className={`${refCardCls} p-5 sm:p-6`}>
          <div className={capsLabelCls}>Booking summary</div>
          <dl className="mt-3 space-y-3 text-[15px]">
            <SummaryRow label={rooms.length > 1 ? `Rooms (${rooms.length})` : 'Room'} value={roomText} />
            {rooms.length > 1 && datesOk && calculated > 0 && (
              <ul className="space-y-1 rounded-xl bg-canvas px-3 py-2.5 text-[13px] text-slate-600" aria-label="Room-wise amount">
                {rooms.map((r) => (
                  <li key={r} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{r} <span className="nums text-slate-500">· {formatINR(rateOf(r))} × {nights}</span></span>
                    <span className="nums shrink-0 font-medium text-dark">{formatINR(rateOf(r) * nights)}</span>
                  </li>
                ))}
              </ul>
            )}
            <SummaryRow label="Stay" value={stayText} />
            <SummaryRow label="Guests" value={guestText} />
          </dl>
          <dl className="mt-4 space-y-3 border-t border-[#e6e1d6] pt-4 text-[15px]">
            <SummaryRow label="Total amount" value={formatINR(total)} />
            <SummaryRow label="Advance amount" value={formatINR(advance)} />
            {otherPaid !== 0 && <SummaryRow label="Other payments" value={formatINR(otherPaid)} />}
            <div className="flex items-baseline justify-between gap-4 pt-1">
              <dt className="text-[17px] font-semibold text-dark">Balance</dt>
              <dd className={`nums text-[17px] font-semibold ${balance > 0 ? 'text-due' : 'text-dark'}`}>{formatINR(balance)}</dd>
            </div>
          </dl>
          <button type="submit" disabled={!valid || busy} className={`${bigPrimaryBtnCls} mt-5 disabled:!bg-[#9aa5a1]`}>
            {busy ? busyLabel : submitLabel}
          </button>
          {serverError ? (
            <p className="mt-3 text-[13px] text-red-700">{serverError}</p>
          ) : !valid && (
            <p className="mt-3 text-[13px] leading-snug text-slate-500">
              Complete all required fields (*) to enable {submitLabel}.
              {(touched.size > 0 || submitted) && <> Still needed: {errorKeys.map((k) => FIELD_LABEL[k]).join(', ')}.</>}
            </p>
          )}
        </div>
      </aside>
    </form>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${refCardCls} p-5 sm:p-6`}>
      <h2 className={`${cardTitleCls} mb-4 !text-[21px]`}>{title}</h2>
      {children}
    </section>
  )
}

function InfoBox({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-sand px-4 py-3 text-sm leading-relaxed text-slate-600">{children}</div>
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="nums min-w-0 text-right font-semibold break-words text-dark">{value || '—'}</dd>
    </div>
  )
}

/** Agent / OTA platform / referrer picker: active entries from Configuration (plus the saved one). */
function DetailSelect({ id, label, placeholder, value, options, error, emptyText, configTab, configLabel, onChange }: {
  id: string
  label: string
  placeholder: string
  value: string
  options: NamedOption[]
  error?: string
  emptyText: string
  configTab: string
  configLabel: string
  onChange: (v: string) => void
}) {
  const names = options.filter((o) => o.active).map((o) => o.name)
  if (value && !names.includes(value)) names.unshift(value) // kept on older / deactivated entries
  if (!names.length) {
    return (
      <div>
        <span className={labelCls}>{label}</span>
        <InfoBox>
          {emptyText}{' '}
          <Link to={`/configuration?tab=${configTab}`} className="font-medium text-dark underline underline-offset-2">{configLabel}</Link>
        </InfoBox>
        {error && <p className="mt-1.5 text-[13px] text-red-700">{error}</p>}
      </div>
    )
  }
  return (
    <Field label={label} htmlFor={id} error={error} className="sm:max-w-[calc(50%-0.5rem)]">
      <SelectBox id={id} value={value} onChange={onChange} invalid={!!error}>
        <option value="">{placeholder}</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
      </SelectBox>
    </Field>
  )
}
