import { useLocation } from 'react-router-dom'
import SidebarLayout from './SidebarLayout'
import type { NavItem } from './SidebarLayout'

function navForSegment(segment: string): NavItem[] {
  if (!segment) return []
  const navItems: NavItem[] = [
    { to: `/${segment}`, label: 'Dashboard', end: true, icon: 'dashboard' },
    { to: `/${segment}/applications`, label: 'Applications', end: false, icon: 'applications' },
    { to: `/${segment}/chat`, label: 'Chat', end: false, icon: 'chat' },
  ]
  if (segment === 'ceo' || segment === 'co-ceo') {
    navItems.splice(2, 0, {
      to: `/${segment}/announcement`,
      label: 'Announcement',
      end: false,
      icon: 'announcement',
      children: [
        { to: `/${segment}/announcement/public-announcement`, label: 'PUBLIC ANNOUNCEMENT', end: true },
        { to: `/${segment}/announcement/memo`, label: 'MEMO', end: true },
      ],
    })
  }
  return navItems
}

export default function PortalLayout() {
  const location = useLocation()
  const segment = location.pathname.replace(/^\//, '').split('/')[0]
  const navItems = navForSegment(segment)
  return <SidebarLayout navItems={navItems} />
}
