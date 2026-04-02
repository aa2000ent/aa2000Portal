/**
 * Prefetch route chunks on hover/focus so navigation feels instant.
 * Maps pathname to the dynamic import for that route's component.
 */
const routeLoaders: Record<string, () => Promise<unknown>> = {
  '/': () => import('./pages/Login'),
  '/register': () => import('./pages/Register'),
  '/admin': () => import('./pages/admin/AdminDashboard'),
  '/admin/employees': () => import('./pages/admin/AdminEmployees'),
  '/admin/customer': () => import('./pages/admin/AdminCustomers'),
  '/admin/profile': () => import('./pages/admin/AdminProfile'),
  '/admin/applications': () => import('./pages/admin/AdminApplications'),
  '/admin/approvals': () => import('./pages/admin/AdminApprovals'),
  '/admin/history': () => import('./pages/admin/AdminHistory'),
  '/admin/chat': () => import('./pages/ChatPage'),
  '/marketing': () => import('./pages/Marketing'),
  '/marketing/applications': () => import('./pages/PortalApplications'),
  '/marketing/profile': () => import('./pages/PortalProfile'),
  '/marketing/chat': () => import('./pages/ChatPage'),
  '/finance': () => import('./pages/Finance'),
  '/finance/applications': () => import('./pages/PortalApplications'),
  '/finance/profile': () => import('./pages/PortalProfile'),
  '/finance/chat': () => import('./pages/ChatPage'),
  '/engineering': () => import('./pages/Engineering'),
  '/engineering/applications': () => import('./pages/PortalApplications'),
  '/engineering/profile': () => import('./pages/PortalProfile'),
  '/engineering/chat': () => import('./pages/ChatPage'),
  '/general-manager': () => import('./pages/general-manager/GeneralManagerDashboard'),
  '/general-manager/applications': () => import('./pages/PortalApplications'),
  '/general-manager/profile': () => import('./pages/PortalProfile'),
  '/general-manager/chat': () => import('./pages/ChatPage'),
  '/general-manager/history': () => import('./pages/admin/AdminHistory'),
}

const prefetched = new Set<string>()

export function prefetchRoute(pathname: string): void {
  const path = pathname.replace(/\/$/, '') || '/'
  if (prefetched.has(path)) return
  const loader = routeLoaders[path]
  if (!loader) return
  prefetched.add(path)
  loader().catch(() => {
    prefetched.delete(path)
  })
}
