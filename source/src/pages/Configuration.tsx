import { useSearchParams } from 'react-router-dom'
import { can, useAuth } from '../auth/AuthContext'
import { useStore } from '../data/store'
import { sourceType } from '../lib/booking'
import { PageTitle } from '../components/ui/PageTitle'
import { InventoryMaster } from '../components/inventory/InventoryMaster'
import { TabBar, pickTab, type TabDef } from '../components/config/TabBar'
import { AgentsSettings } from '../components/config/AgentsSettings'
import { NamedListSettings } from '../components/config/NamedListSettings'
import { MenuSettings } from '../components/config/MenuSettings'
import { HallRatesSettings } from '../components/config/HallRatesSettings'
import { sameName } from '../components/config/kit'
import { RoomsSettings } from './Rooms'
import { InvoiceSettingsSection } from './Invoice'

type TabKey = 'rooms' | 'agents' | 'ota' | 'referrers' | 'menu' | 'hall' | 'inventory' | 'departments' | 'invoice'

const TABS: TabDef<TabKey>[] = [
  { key: 'rooms', label: 'Rooms' },
  { key: 'agents', label: 'B2B agents' },
  { key: 'ota', label: 'OTA platforms' },
  { key: 'referrers', label: 'Management referrals' },
  { key: 'menu', label: 'Restaurant menu' },
  { key: 'hall', label: 'Conference Hall' },
  { key: 'inventory', label: 'Inventory master' },
  { key: 'departments', label: 'Departments' },
  { key: 'invoice', label: 'Invoice' },
]

export function Configuration() {
  const { user } = useAuth()
  const { data, saveSettings } = useStore()
  const [params] = useSearchParams()
  const canConfig = can(user, 'manage_config')
  const tabs = TABS.filter((t) => t.key !== 'inventory' || can(user, 'view_inventory') || canConfig)
  const active = pickTab(tabs, params.get('tab'))

  // Bookings that name an OTA platform / referrer (by source detail), so names in use stay put.
  const usedBy = (type: ReturnType<typeof sourceType>) => (name: string) =>
    data.bookings.filter((b) => sourceType(b) === type && sameName(b.sourceDetail ?? '', name)).length

  return (
    <>
      <PageTitle title="Configuration" subtitle="Rooms, partners, menu and pricing used across bookings, expenses and inventory." />
      <TabBar tabs={tabs} active={active} label="Configuration sections" />

      {active === 'rooms' && <RoomsSettings />}
      {active === 'agents' && <AgentsSettings canEdit={canConfig} />}
      {active === 'ota' && (
        <NamedListSettings
          key="ota"
          title="OTA platforms"
          description="Online travel platforms offered when a booking's source is OTA."
          noun="platform"
          placeholder="e.g. Booking.com"
          emptyText="No OTA platforms yet. Add the ones you sell on, e.g. Booking.com, Agoda, MakeMyTrip, Airbnb."
          items={data.settings.otaPlatforms}
          hasActive
          activeHint="Only active platforms can be picked on new bookings."
          canEdit={canConfig}
          usage={usedBy('OTA')}
          persist={(items) => saveSettings('otaPlatforms', items)}
        />
      )}
      {active === 'referrers' && (
        <NamedListSettings
          key="referrers"
          title="Management referrals"
          description="Management members who can refer bookings. They appear in Referred By when a booking's source is Management Referral."
          noun="referrer"
          placeholder="e.g. Dr. Suresh"
          emptyText="No referrers yet. Add the management members allowed to refer bookings."
          items={data.settings.referrers}
          hasActive
          activeHint="Only active members can be picked on new bookings."
          canEdit={canConfig}
          usage={usedBy('Referral')}
          persist={(items) => saveSettings('referrers', items)}
        />
      )}
      {active === 'menu' && <MenuSettings canEdit={canConfig} />}
      {active === 'hall' && <HallRatesSettings canEdit={canConfig} />}
      {active === 'inventory' && <InventoryMaster />}
      {active === 'departments' && (
        <NamedListSettings
          key="departments"
          title="Departments"
          description="Departments that stock is issued to in Inventory → Record usage. Renaming one doesn't change usage already recorded."
          noun="department"
          placeholder="e.g. Housekeeping"
          emptyText="No departments yet. Add the ones that use stock, e.g. Housekeeping, Kitchen, Front Office, Maintenance, Pool."
          items={data.settings.departments.map((name) => ({ id: name, name, active: true }))}
          hasActive={false}
          canEdit={canConfig}
          persist={(items) => saveSettings('departments', items.map((i) => i.name))}
        />
      )}
      {active === 'invoice' && <InvoiceSettingsSection />}
    </>
  )
}
