import { useLocation } from 'react-router-dom'
import SidebarLayout from './SidebarLayout'

function navForSegment(segment: string): { to: string; label: string; end: boolean; icon: string }[] {
  if (!segment) return []
  return [
    { to: `/${segment}`, label: 'Dashboard', end: true, icon: 'dashboard' },
    { to: `/${segment}/applications`, label: 'Applications', end: false, icon: 'applications' },
    { to: `/${segment}/chat`, label: 'Chat', end: false, icon: 'chat' },
  ]
}

export default function PortalLayout() {
  const location = useLocation()
  const segment = location.pathname.replace(/^\//, '').split('/')[0]
  const navItems = navForSegment(segment)
  return <SidebarLayout navItems={navItems} />
}
