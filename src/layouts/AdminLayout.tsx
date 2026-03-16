import SidebarLayout from './SidebarLayout'
import { RolesProvider } from '../contexts/RolesContext'
import { ApprovalsProvider } from '../contexts/ApprovalsContext'
import { EmployeesProvider } from '../contexts/EmployeesContext'

const adminNavItems = [
  { to: '/admin', label: 'Dashboard', end: true, icon: 'dashboard' },
  { to: '/admin/employees', label: 'Employees', end: false, icon: 'employees' },
  { to: '/admin/customer', label: 'Customer', end: false, icon: 'customer' },
  { to: '/admin/applications', label: 'Applications', end: false, icon: 'applications' },
  { to: '/admin/approvals', label: 'Approvals', end: false, icon: 'approvals' },
  { to: '/admin/history', label: 'Activity logs', end: false, icon: 'history' },
  { to: '/admin/chat', label: 'Chat', end: false, icon: 'chat' },
]

export default function AdminLayout() {
  return (
    <RolesProvider>
      <EmployeesProvider>
        <ApprovalsProvider>
          <SidebarLayout navItems={adminNavItems} />
        </ApprovalsProvider>
      </EmployeesProvider>
    </RolesProvider>
  )
}
