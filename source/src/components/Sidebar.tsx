import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import { navItems } from './navItems'
import { useAuth } from '../auth/AuthContext'
import { PROPERTY_NAME, PROPERTY_TAGLINE } from '../lib/config'

interface SidebarProps {
  onNavigate?: () => void
  onClose?: () => void
}

export function Sidebar({ onNavigate, onClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const items = navItems.filter((item) => (Array.isArray(item.right) ? item.right : [item.right]).some((r) => user?.rights.includes(r)))

  return (
    <div className="flex h-full w-64 flex-col border-r border-[#e6e1d6] bg-white">
      {/* Brand */}
      <div className="flex items-start gap-2 px-6 pt-7 pb-6">
        <div className="min-w-0 leading-tight">
          <div className="font-display text-[26px] font-semibold text-dark">{PROPERTY_NAME}</div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b6b4f]">{PROPERTY_TAGLINE}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav (text only, as in the reference screens) */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `block rounded-xl px-4 py-2.5 text-[15px] transition-colors ${
                isActive ? 'bg-ink font-medium text-white' : 'text-slate-700 hover:bg-[#f3f1ea] hover:text-dark'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer: user + sign out */}
      <div className="px-6 py-5">
        <div className="truncate text-[15px] font-semibold text-dark">{user?.name}</div>
        <button onClick={logout} className="mt-0.5 text-sm text-slate-500 hover:text-dark hover:underline">
          Sign out
        </button>
      </div>
    </div>
  )
}
