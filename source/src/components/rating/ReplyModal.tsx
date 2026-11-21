import { useState } from 'react'
import { useStore } from '../../data/store'
import { fmtDate } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { fieldAreaCls, labelCls, outlineBtnCls, outlineDangerBtnCls } from '../styles'
import { FormError, PopupActions, SandBox } from '../booking-detail/parts'
import { StarDisplay } from './Stars'
import { errText } from './utils'
import type { Rating } from '../../types'

/** WhatsApp link for an Indian mobile number ("98765 43210" → 919876543210); null when it isn't a phone number. */
function waLink(phone: string | undefined, text: string): string | null {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 10) digits = `91${digits}`
  else if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`
  if (digits.length < 11 || digits.length > 15) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/**
 * Reply to a review (or edit / remove the reply). The reply is the resort's response to the guest: it is saved
 * with the review (so the team sees it was answered and it leaves "Needs reply"), and it can be sent to the guest
 * on WhatsApp when the review belongs to a booking with a phone number.
 */
export function ReplyModal({ rating: r, phone, onClose }: { rating: Rating; phone?: string; onClose: () => void }) {
  const { updateRating } = useStore()
  const toast = useToast()
  const had = !!(r.response ?? '').trim()
  const [text, setText] = useState(r.response ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const canWhatsApp = !!waLink(phone, 'x')

  async function save(response: string, send = false) {
    if (response === '' && !had) {
      setError('Write the reply first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await updateRating(r.id, { response })
      const link = send ? waLink(phone, response) : null
      if (link) window.open(link, '_blank', 'noopener')
      toast.show(response ? (link ? 'Reply saved · opening WhatsApp' : had ? 'Reply updated' : 'Reply saved') : 'Reply removed', `${r.guest} · ${r.overall}★`)
      onClose()
    } catch (e) {
      setError(errText(e, 'Could not save the reply. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <Modal title={had ? 'Edit reply' : 'Reply to review'} subtitle={`${r.guest}${r.bookingRef ? ` · ${r.bookingRef}` : ''}`} size="lg" onClose={() => { if (!busy) onClose() }}>
      <div className="space-y-4">
        <SandBox>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <StarDisplay value={r.overall} />
            <span className="nums">{fmtDate(r.date)} · {r.source}</span>
          </div>
          {r.comment?.trim()
            ? <p className="mt-2 line-clamp-5 whitespace-pre-line text-[15px] text-slate-700">“{r.comment.trim()}”</p>
            : <p className="mt-2 text-sm text-slate-500">No comment, stars only.</p>}
        </SandBox>
        <div>
          <label htmlFor="rating-reply" className={labelCls}>Your reply</label>
          <textarea
            id="rating-reply"
            rows={5}
            maxLength={3000}
            className={fieldAreaCls}
            placeholder="Thank the guest, or note what was done about their feedback"
            value={text}
            onChange={(e) => { setText(e.target.value); setError('') }}
            autoFocus
          />
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
            The resort’s response to this review. It’s saved with the review, so the team can see it has been answered (it leaves
            “Needs reply”). {canWhatsApp ? 'Use “Save & send on WhatsApp” to send it to the guest as well.' : 'To reach the guest, send it to them too.'}
            {' '}For a Google or OTA review, post the same reply on that site.
          </p>
        </div>
        <FormError>{error}</FormError>
        <PopupActions onCancel={onClose} onSubmit={() => void save(text.trim())} label="Save reply" busyLabel="Saving…" busy={busy} />
        {canWhatsApp && (
          <button type="button" onClick={() => void save(text.trim(), true)} disabled={busy || !text.trim()} className={`${outlineBtnCls} w-full`}>
            Save &amp; send on WhatsApp
          </button>
        )}
        {had && (
          <button type="button" onClick={() => void save('')} disabled={busy} className={`${outlineDangerBtnCls} w-full`}>
            Remove reply
          </button>
        )}
      </div>
    </Modal>
  )
}
