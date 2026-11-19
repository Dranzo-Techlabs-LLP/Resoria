import type { ReactNode } from 'react'
import { cardTitleCls, fieldCls, outlineBtnCls, refCardCls, solidBtnCls } from '../styles'

/** Reference card with a serif title. `flush` lets a table run edge to edge. */
export function DetailCard({
  title, action, children, flush = false, className = '',
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  flush?: boolean
  className?: string
}) {
  return (
    <section className={`@container ${refCardCls} ${flush ? 'overflow-hidden py-5 sm:py-6' : 'p-5 sm:p-6'} ${className}`}>
      {(title || action) && (
        <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 ${flush ? 'px-5 sm:px-6' : ''}`}>
          {title && <h2 className={cardTitleCls}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Small-caps label over a value ("PHONE / 7864536786"). */
export function Info({ label, children, sub, className = '' }: { label: string; children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1.5 break-words text-[17px] font-medium text-dark">{children}</div>
      {sub && <div className="mt-0.5 text-sm text-slate-500">{sub}</div>}
    </div>
  )
}

export const Dash = () => <span className="text-slate-400">—</span>

/** Label ··· value line in the summary cards. */
export function SumRow({ label, children, tone = 'dark', strong = false }: { label: ReactNode; children: ReactNode; tone?: 'dark' | 'due' | 'ok'; strong?: boolean }) {
  const color = tone === 'due' ? 'text-due' : tone === 'ok' ? 'text-ok' : 'text-dark'
  return (
    <div className="flex items-baseline justify-between gap-4 text-[15px]">
      <span className={strong ? 'font-semibold text-dark' : 'text-slate-600'}>{label}</span>
      <span className={`nums text-right font-semibold ${color}`}>{children}</span>
    </div>
  )
}

/** ₹ amount field: shows "₹10,000", reports the digits. */
export function MoneyInput({ id, value, onChange, disabled }: { id: string; value: string; onChange: (digits: string) => void; disabled?: boolean }) {
  return (
    <input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      className={`${fieldCls} nums`}
      value={value ? `₹${Number(value).toLocaleString('en-IN')}` : ''}
      placeholder="₹0"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, ''))}
    />
  )
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{children}</p>
}

/** Cancel + primary action row at the bottom of a popup. */
export function PopupActions({
  onCancel, onSubmit, label, busyLabel, busy, disabled, danger = false,
}: {
  onCancel: () => void
  onSubmit: () => void
  label: string
  busyLabel: string
  busy: boolean
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <div className="flex gap-2.5 pt-1">
      <button type="button" onClick={onCancel} disabled={busy} className={`${outlineBtnCls} flex-1`}>Cancel</button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || disabled}
        className={`${solidBtnCls} flex-[2] ${danger ? '!bg-red-700 hover:!bg-red-800' : ''}`}
      >
        {busy ? busyLabel : label}
      </button>
    </div>
  )
}

/** Sand info box at the top of a popup. */
export function SandBox({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-sand px-5 py-4 ${className}`}>{children}</div>
}
