import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

export interface TabDef<K extends string> {
  key: K
  label: string
}

/** Underlined page tabs synced to `?tab=` (Configuration, Users and Role). Scrolls sideways on small screens. */
export function TabBar<K extends string>({ tabs, active, label }: { tabs: TabDef<K>[]; active: K; label: string }) {
  const activeRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  return (
    <nav aria-label={label} className="mb-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max min-w-full gap-7 border-b border-[#e2ddd2]">
        {tabs.map((t) => {
          const on = t.key === active
          return (
            <Link
              key={t.key}
              ref={on ? activeRef : undefined}
              to={{ search: `?tab=${t.key}` }}
              replace
              aria-current={on ? 'page' : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 pt-1 pb-3 text-[15px] font-medium transition-colors ${
                on ? 'border-ink text-dark' : 'border-transparent text-slate-500 hover:text-dark'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/** The `?tab=` value when it is one of `tabs`, else the first tab. */
export function pickTab<K extends string>(tabs: TabDef<K>[], requested: string | null): K {
  return tabs.find((t) => t.key === requested)?.key ?? tabs[0].key
}
