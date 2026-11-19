import { useState } from 'react'
import { Copy, Link2, MessageCircle } from 'lucide-react'
import { useStore } from '../../data/store'
import { useToast } from '../ui/Toast'
import { fieldCls, outlineBtnCls } from '../styles'
import type { Booking } from '../../types'
import { copyText, errText, feedbackMessage, feedbackUrl, openInNewTab, waUrl } from './utils'

const smallBtn = `${outlineBtnCls} !h-10 !px-4 !text-sm`

/**
 * The booking's guest feedback link: created on first use (the server keeps one token per booking),
 * then copied or sent to the guest's WhatsApp with a short message.
 */
export function useFeedbackShare(b: Booking) {
  const { feedbackLink } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const link = b.feedbackToken ? feedbackUrl(b.feedbackToken) : ''
  const ensureLink = async () => link || feedbackUrl(await feedbackLink(b.ref))
  // Called inside the click: the clipboard / new tab are reached before any await
  const withLink = <T,>(fn: (l: string) => T): T | Promise<T> => (link ? fn(link) : ensureLink().then(fn))

  async function run(fn: () => Promise<void>, fallback: string) {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(errText(e, fallback))
    } finally {
      setBusy(false)
    }
  }

  return {
    link,
    busy,
    error,
    create: () => run(async () => { await ensureLink() }, 'Could not create the feedback link.'),
    copyLink: () => run(async () => {
      await copyText(withLink((l) => l))
      toast.show('Feedback link copied', `${b.guest} · ${b.ref}`)
    }, 'Could not copy the feedback link.'),
    copyMessage: () => run(async () => {
      await copyText(withLink((l) => feedbackMessage(b, l)))
      toast.show('Feedback request copied', `${b.guest} · ${b.ref}`)
    }, 'Could not copy the message.'),
    sendWhatsApp: () => run(async () => {
      await openInNewTab(withLink((l) => waUrl(b.phone, feedbackMessage(b, l))))
    }, 'Could not open WhatsApp.'),
  }
}

/** "Get feedback link", then the link with Copy and Send on WhatsApp (Booking details → Guest rating). */
export function FeedbackLinkPanel({ booking: b, canCreate }: { booking: Booking; canCreate: boolean }) {
  const share = useFeedbackShare(b)
  if (!share.link && !canCreate) return null
  return (
    <div className="min-w-0">
      {share.link ? (
        <div className="rounded-2xl bg-sand px-4 py-4 sm:px-5">
          <label htmlFor={`fb-link-${b.id}`} className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Guest feedback link</label>
          <input
            id={`fb-link-${b.id}`}
            readOnly
            value={share.link}
            onFocus={(e) => e.currentTarget.select()}
            className={`${fieldCls} nums mt-2 !bg-white text-sm`}
          />
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button type="button" onClick={share.copyLink} disabled={share.busy} className={smallBtn}><Copy size={16} aria-hidden /> Copy link</button>
            <button type="button" onClick={share.sendWhatsApp} disabled={share.busy} className={smallBtn}><MessageCircle size={16} aria-hidden /> Send on WhatsApp</button>
          </div>
          <p className="mt-2 text-[13px] text-slate-500">The guest rates the stay on the website; the rating shows here and on the Rating page.</p>
        </div>
      ) : (
        <button type="button" onClick={share.create} disabled={share.busy} className={smallBtn}>
          <Link2 size={16} aria-hidden /> {share.busy ? 'Creating link…' : 'Get feedback link'}
        </button>
      )}
      {share.error && <p role="alert" className="mt-2 text-sm text-red-700">{share.error}</p>}
    </div>
  )
}
