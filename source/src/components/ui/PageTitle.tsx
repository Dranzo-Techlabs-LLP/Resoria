import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Reference page header: optional back link, big serif title (+ pill), subtitle, actions on the right. */
export function PageTitle({
  title, subtitle, back, tag, actions, actionsNote,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: { to: string; label: string }
  tag?: ReactNode
  actions?: ReactNode
  actionsNote?: ReactNode
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="mb-3 inline-block text-[15px] text-slate-600 hover:text-dark">← {back.label}</Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[34px] font-semibold leading-tight tracking-tight text-dark sm:text-[40px]">{title}</h1>
            {tag}
          </div>
          {subtitle && <p className="mt-1.5 text-[17px] text-slate-600">{subtitle}</p>}
        </div>
        {(actions || actionsNote) && (
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            {actions && <div className="flex flex-wrap gap-2.5 sm:justify-end">{actions}</div>}
            {actionsNote && <div className="text-sm">{actionsNote}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
