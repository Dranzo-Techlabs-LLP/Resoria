import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth, RequireRight } from './auth/guards'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Calendar } from './pages/Calendar'
import { RoomAvailability } from './pages/RoomAvailability'
import { Bookings } from './pages/Bookings'
import { NewBooking } from './pages/NewBooking'
import { EditBooking } from './pages/EditBooking'
import { BookingInvoice } from './pages/BookingInvoice'
import { BookingBills } from './pages/BookingBills'
import { BookingDetail } from './pages/BookingDetail'
import { Accounting } from './pages/Accounting'
import { Expenses } from './pages/Expenses'
import { Reports } from './pages/Reports'
import { UsersAndRoles } from './pages/UsersAndRoles'
import { Configuration } from './pages/Configuration'
import { Rating } from './pages/Rating'
import { InventoryOverview } from './pages/inventory/InventoryOverview'
import { AddStock } from './pages/inventory/AddStock'
import { RecordUsage } from './pages/inventory/RecordUsage'
import { StockHistory } from './pages/inventory/StockHistory'
import { StockDetails } from './pages/inventory/StockDetails'
import { NotFound } from './pages/NotFound'

function BillsRedirect() {
  const { ref = '' } = useParams()
  return <Navigate to={`/bookings/${encodeURIComponent(ref)}/bills`} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="bookings" element={<RequireRight right="view_bookings"><Bookings /></RequireRight>} />
          <Route path="bookings/new" element={<RequireRight right="edit_bookings"><NewBooking /></RequireRight>} />
          <Route path="bookings/:ref/edit" element={<RequireRight right="edit_bookings"><EditBooking /></RequireRight>} />
          <Route path="bookings/:ref/invoice" element={<RequireRight right="view_bookings"><BookingInvoice /></RequireRight>} />
          {/* Bills & receipts: ?payment=<id> prints one receipt, no query prints every bill of the booking */}
          <Route path="bookings/:ref/bills" element={<RequireRight right="view_bookings"><BookingBills /></RequireRight>} />
          <Route path="bookings/:ref/receipt" element={<BillsRedirect />} />
          <Route path="bookings/:ref" element={<RequireRight right="view_bookings"><BookingDetail /></RequireRight>} />
          <Route path="calendar" element={<RequireRight right="view_calendar"><Calendar /></RequireRight>} />
          <Route path="calendar/:date" element={<RequireRight right="view_calendar"><RoomAvailability /></RequireRight>} />
          <Route path="expenses" element={<RequireRight right="view_expenses"><Expenses /></RequireRight>} />
          <Route path="inventory" element={<RequireRight right="view_inventory"><InventoryOverview /></RequireRight>} />
          <Route path="inventory/add-stock" element={<RequireRight right="edit_inventory"><AddStock /></RequireRight>} />
          <Route path="inventory/record-usage" element={<RequireRight right="edit_inventory"><RecordUsage /></RequireRight>} />
          <Route path="inventory/history" element={<RequireRight right="view_inventory"><StockHistory /></RequireRight>} />
          <Route path="inventory/items/:id" element={<RequireRight right="view_inventory"><StockDetails /></RequireRight>} />
          <Route path="reports" element={<RequireRight right="view_reports"><Reports /></RequireRight>} />
          <Route path="financial-overview" element={<RequireRight right="view_accounting"><Accounting /></RequireRight>} />
          <Route path="users" element={<RequireRight right="view_users"><UsersAndRoles /></RequireRight>} />
          <Route path="configuration" element={<RequireRight right={['view_villas', 'manage_config']}><Configuration /></RequireRight>} />
          <Route path="rating" element={<Rating />} />
          {/* Older links */}
          <Route path="accounting" element={<Navigate to="/financial-overview" replace />} />
          <Route path="roles" element={<Navigate to="/users?tab=roles" replace />} />
          <Route path="rooms" element={<Navigate to="/configuration?tab=rooms" replace />} />
          <Route path="invoice" element={<Navigate to="/configuration?tab=invoice" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}
