import { useState } from 'react'
import { useStore } from '../../data/store'
import { fmtDate } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { fieldAreaCls, labelCls, outlineDangerBtnCls } from '../styles'
import { FormError, PopupActions, SandBox } from '../booking-detail/parts'
import { StarDisplay } from './Stars'
import { errText } from './utils'
import type { Rating } from '../../types'

/** Reply to a review (or edit / remove the reply): the resort's answer or follow-up note. */
export function ReplyModal({ rating: r, onClose }: { rating: Rating; onClose: () => void }) {
  const { updateRating } = useStore()
  const toast = useToast()
  const had = !!(r.response ?? '').trim()
  const [text, setText] = useState(r.response ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(response: string) {
    if (response === '' && !had) {
      setError('Write the reply first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await updateRating(r.id, { response })
      toast.show(response ? (had ? 'Reply updated' : 'Reply saved') : 'Reply removed', `${r.guest} · ${r.overall}★`)
      onClose()
    } catch (e) {
      setError(errText(e, 'Could not save the reply. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <Modal title={had ? 'Edit reply' : 'Reply'} subtitle={`${r.guest}${r.bookingRef ? ` · ${r.bookingRef}` : ''}`} size="lg" onClose={() => { if (!busy) onClose() }}>
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
          <p className="mt-1.5 text-[13px] text-slate-500">
            Kept with the review for the team. To answer the guest, send it on WhatsApp or reply on the review site too.
          </p>
        </div>
        <FormError>{error}</FormError>
        <PopupActions onCancel={onClose} onSubmit={() => void save(text.trim())} label="Save reply" busyLabel="Saving…" busy={busy} />
        {had && (
          <button type="button" onClick={() => void save('')} disabled={busy} className={`${outlineDangerBtnCls} w-full`}>
            Remove reply
          </button>
        )}
      </div>
    </Modal>
  )
}
