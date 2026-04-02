import SidebarLayout from './SidebarLayout'
import { RolesProvider } from '../contexts/RolesContext'
import { EmployeesProvider } from '../contexts/EmployeesContext'
import { ApprovalsProvider } from '../contexts/ApprovalsContext'

const gmNavItems = [
  { to: '/general-manager', label: 'Dashboard', end: true, icon: 'dashboard' },
  { to: '/general-manager/applications', label: 'Applications', end: false, icon: 'applications' },
  { to: '/general-manager/history', label: 'Activity logs', end: false, icon: 'history' },
  { to: '/general-manager/chat', label: 'Chat', end: false, icon: 'chat' },
]

export default function GeneralManagerLayout() {
  return (
    <RolesProvider>
      <EmployeesProvider>
        <ApprovalsProvider>
          <SidebarLayout navItems={gmNavItems} />
        </ApprovalsProvider>
      </EmployeesProvider>
    </RolesProvider>
  )
}
