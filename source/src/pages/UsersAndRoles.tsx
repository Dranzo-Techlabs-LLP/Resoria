import { useSearchParams } from 'react-router-dom'
import { can, useAuth } from '../auth/AuthContext'
import { PageTitle } from '../components/ui/PageTitle'
import { TabBar, pickTab, type TabDef } from '../components/config/TabBar'
import { UsersSection } from './Users'
import { RolesSection } from './Roles'

type TabKey = 'users' | 'roles'
const TABS: TabDef<TabKey>[] = [
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles & rights' },
]

/** Users and Role: team members and role rights (`?tab=roles`, managers only). */
export function UsersAndRoles() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const tabs = can(user, 'manage_users') ? TABS : TABS.filter((t) => t.key === 'users')
  const active = pickTab(tabs, params.get('tab'))

  return (
    <>
      <PageTitle title="Users and Role" subtitle="Who can sign in, and what each role can see and do." />
      {tabs.length > 1 && <TabBar tabs={tabs} active={active} label="Users and Role sections" />}
      {active === 'users' ? <UsersSection /> : <RolesSection />}
    </>
  )
}
