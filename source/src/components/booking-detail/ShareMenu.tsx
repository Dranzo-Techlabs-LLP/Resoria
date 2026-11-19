import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, Copy, Link2, MessageCircle, Share2 } from 'lucide-react'
import { can, useAuth } from '../../auth/AuthContext'
import { isCompleted, isInHouse } from '../../lib/booking'
import { useToast } from '../ui/Toast'
import { outlineBtnCls } from '../styles'
import { useFeedbackShare } from '../rating/FeedbackLink'
import { bookingMessage, copyText, errText, openInNewTab, waNumber, waUrl } from '../rating/utils'
import type { Booking } from '../../types'

function Item({ icon, children, onClick, disabled }: { icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-[15px] text-dark hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none disabled:opacity-50"
    >
      <span className="shrink-0 text-slate-500" aria-hidden>{icon}</span>
      {children}
    </button>
  )
}

const Group = ({ children }: { children: ReactNode }) => (
  <div className="px-5 pt-2.5 pb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" aria-hidden>{children}</div>
)

/**
 * Header "Share" menu: the booking details for the guest on WhatsApp (or copied), and for in-house /
 * completed stays the feedback request with the guest's feedback link (created when first needed).
 */
export function ShareMenu({ booking: b }: { booking: Booking }) {
  const { user } = useAuth()
  const toast = useToast()
  const feedback = useFeedbackShare(b)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const stayStarted = isInHouse(b) || isCompleted(b)
  // A new link needs manage_ratings; an existing one can be shared by anyone who sees the booking
  const canFeedback = stayStarted && (!!b.feedbackToken || can(user, 'manage_ratings'))
  const number = waNumber(b.phone)

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  function close() {
    setOpen(false)
    buttonRef.current?.focus()
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      // close the menu only, not a popup behind it
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
      items[next]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  /** Run a menu action inside the click (pop-ups and the clipboard need that), then close the menu. */
  function act(fn: () => Promise<void> | void) {
    setError('')
    setOpen(false)
    const done = fn()
    buttonRef.current?.focus()
    Promise.resolve(done).catch((e: unknown) => setError(errText(e, 'Something went wrong. Please try again.')))
  }

  const sendBooking = () => act(() => openInNewTab(waUrl(b.phone, bookingMessage(b))))
  const copyBooking = () => act(async () => {
    await copyText(bookingMessage(b))
    toast.show('Booking message copied', `${b.guest} · ${b.ref}`)
  })

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={outlineBtnCls}
      >
        <Share2 size={17} aria-hidden /> Share <ChevronDown size={16} aria-hidden className="-mr-1 text-slate-500" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Share ${b.ref}`}
          onKeyDown={onMenuKey}
          className="absolute top-[calc(100%+6px)] right-0 z-30 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-[#e6e1d6] bg-white py-2 shadow-xl max-sm:left-0 max-sm:right-auto"
        >
          <Group>Booking details</Group>
          <Item icon={<MessageCircle size={17} />} onClick={sendBooking}>Booking confirmation on WhatsApp</Item>
          <Item icon={<Copy size={17} />} onClick={copyBooking}>Copy message</Item>
          {canFeedback && (
            <>
              <div className="my-1.5 border-t border-[#efece4]" role="separator" />
              <Group>Guest feedback</Group>
              <Item icon={<MessageCircle size={17} />} onClick={() => act(feedback.sendWhatsApp)} disabled={feedback.busy}>Feedback request on WhatsApp</Item>
              <Item icon={<Copy size={17} />} onClick={() => act(feedback.copyMessage)} disabled={feedback.busy}>Copy feedback request</Item>
              <Item icon={<Link2 size={17} />} onClick={() => act(feedback.copyLink)} disabled={feedback.busy}>Copy feedback link</Item>
            </>
          )}
          <p className="nums mt-1.5 border-t border-[#efece4] px-5 pt-2.5 pb-1 text-[13px] text-slate-500">
            {number ? <>WhatsApp to +{number}</> : 'No usable phone number: WhatsApp will ask who to send it to.'}
          </p>
        </div>
      )}
      {(error || feedback.error) && (
        <p role="alert" className="mt-1.5 max-w-[260px] text-sm text-red-700 sm:text-right">{error || feedback.error}</p>
      )}
    </div>
  )
}
