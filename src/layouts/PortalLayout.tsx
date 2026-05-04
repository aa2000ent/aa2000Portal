import { useLocation } from 'react-router-dom'
import SidebarLayout from './SidebarLayout'
import type { NavItem } from './SidebarLayout'
import { RolesProvider } from '../contexts/RolesContext'
import { EmployeesProvider } from '../contexts/EmployeesContext'

function navForSegment(segment: string): NavItem[] {
  if (!segment) return []
  const navItems: NavItem[] = [
    { to: `/${segment}`, label: 'Dashboard', end: true, icon: 'dashboard' },
    { to: `/${segment}/applications`, label: 'Applications', end: false, icon: 'applications' },
    {
      to: `/${segment}/leave-menu`,
      label: 'Leave',
      end: false,
      icon: 'leave',
      children: [
        { to: `/${segment}/leave`, label: 'Request leave', end: true },
        { to: `/${segment}/leave/status`, label: 'Leave status', end: true },
      ],
    },
    {
      to: `/${segment}/announcement`,
      label: 'Announcement',
      end: false,
      icon: 'announcement',
      children: [
        { to: `/${segment}/announcement/public-announcement`, label: 'PUBLIC ANNOUNCEMENT', end: true },
        { to: `/${segment}/announcement/memo`, label: 'MEMO', end: true },
        { to: `/${segment}/announcement/meeting-minutes`, label: 'MEETING MINUTES', end: true },
      ],
    },
    { to: `/${segment}/project-files`, label: 'Project Files', end: false, icon: 'files' },
    { to: `/${segment}/chat`, label: 'Chat', end: false, icon: 'chat' },
  ]
  return navItems
}

export default function PortalLayout() {
  const location = useLocation()
  const segment = location.pathname.replace(/^\//, '').split('/')[0]
  const navItems = navForSegment(segment)
  return (
    <RolesProvider>
      <EmployeesProvider>
        <SidebarLayout navItems={navItems} />
      </EmployeesProvider>
    </RolesProvider>
  )
}
