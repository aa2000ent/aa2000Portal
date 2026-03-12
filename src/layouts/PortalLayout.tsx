import { Outlet, useLocation } from 'react-router-dom'
import SidebarLayout from './SidebarLayout'

const PORTAL_NAV_ITEMS: Record<string, { to: string; label: string; end: boolean; icon: string }[]> = {
  marketing: [
    { to: '/marketing', label: 'Dashboard', end: true, icon: 'dashboard' },
    { to: '/marketing/applications', label: 'Applications', end: false, icon: 'applications' },
    { to: '/marketing/chat', label: 'Chat', end: false, icon: 'chat' },
  ],
  finance: [
    { to: '/finance', label: 'Dashboard', end: true, icon: 'dashboard' },
    { to: '/finance/applications', label: 'Applications', end: false, icon: 'applications' },
    { to: '/finance/chat', label: 'Chat', end: false, icon: 'chat' },
  ],
  engineering: [
    { to: '/engineering', label: 'Dashboard', end: true, icon: 'dashboard' },
    { to: '/engineering/applications', label: 'Applications', end: false, icon: 'applications' },
    { to: '/engineering/chat', label: 'Chat', end: false, icon: 'chat' },
  ],
}

export default function PortalLayout() {
  const location = useLocation()
  const segment = location.pathname.replace(/^\//, '').split('/')[0] as keyof typeof PORTAL_NAV_ITEMS
  const navItems = PORTAL_NAV_ITEMS[segment] ?? []
  return (
    <SidebarLayout navItems={navItems}>
      <Outlet />
    </SidebarLayout>
  )
}
