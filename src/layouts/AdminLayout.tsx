import SidebarLayout from './SidebarLayout'
import type { NavItem } from './SidebarLayout'
import { RolesProvider } from '../contexts/RolesContext'
import { EmployeesProvider } from '../contexts/EmployeesContext'
import { ApprovalsProvider } from '../contexts/ApprovalsContext'

const adminNavItems: NavItem[] = [
  { to: '/admin', label: 'Dashboard', end: true, icon: 'dashboard' },
  { to: '/admin/employees', label: 'Employees', end: false, icon: 'employees' },
  { to: '/admin/customer', label: 'Customer', end: false, icon: 'customer' },
  { to: '/admin/applications', label: 'Applications', end: false, icon: 'applications' },
  {
    to: '/admin/announcement',
    label: 'Announcement',
    end: false,
    icon: 'announcement',
    children: [
      { to: '/admin/announcement/public-announcement', label: 'PUBLIC ANNOUNCEMENT', end: true },
      { to: '/admin/announcement/memo', label: 'MEMO', end: true },
      { to: '/admin/announcement/meeting-minutes', label: 'MEETING MINUTES', end: true },
    ],
  },
  {
    to: '/admin/approvals',
    label: 'Approvals',
    end: false,
    icon: 'approvals',
    children: [
      { to: '/admin/approvals/signups', label: 'Sign-ups', end: true },
      { to: '/admin/approvals/leave-requests', label: 'Leave requests', end: true },
    ],
  },
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
