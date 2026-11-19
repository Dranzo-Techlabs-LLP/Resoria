import {
  BarChart3, Boxes, CalendarCheck2, CalendarDays, Landmark, LayoutDashboard, Receipt, Settings, Star, Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  right: string | string[] // any of these
  end?: boolean
}

// Order from the change sheet (Inventory, from section 5, sits after Expenses). `right` gates visibility per role.
export const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, right: 'view_dashboard', end: true },
  { to: '/bookings', label: 'Bookings', icon: CalendarCheck2, right: 'view_bookings' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, right: 'view_calendar' },
  { to: '/expenses', label: 'Expenses', icon: Receipt, right: 'view_expenses' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, right: 'view_inventory' },
  { to: '/reports', label: 'Reports', icon: BarChart3, right: 'view_reports' },
  { to: '/financial-overview', label: 'Financial Overview', icon: Landmark, right: 'view_accounting' },
  { to: '/users', label: 'Users and Role', icon: Users, right: 'view_users' },
  { to: '/configuration', label: 'Configuration', icon: Settings, right: ['view_villas', 'manage_config'] },
  { to: '/rating', label: 'Rating', icon: Star, right: 'view_ratings' },
]
