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
  '/sale': () => import('./pages/sale/Dashboard'),
  '/sale/applications': () => import('./pages/PortalApplications'),
  '/sale/profile': () => import('./pages/PortalProfile'),
  '/sale/chat': () => import('./pages/ChatPage'),
  '/purchasing': () => import('./pages/purchasing/Dashboard'),
  '/purchasing/applications': () => import('./pages/PortalApplications'),
  '/purchasing/profile': () => import('./pages/PortalProfile'),
  '/purchasing/chat': () => import('./pages/ChatPage'),
  '/customer': () => import('./pages/customer/Dashboard'),
  '/customer/applications': () => import('./pages/PortalApplications'),
  '/customer/profile': () => import('./pages/PortalProfile'),
  '/customer/chat': () => import('./pages/ChatPage'),
  '/supplier': () => import('./pages/supplier/Dashboard'),
  '/supplier/applications': () => import('./pages/PortalApplications'),
  '/supplier/profile': () => import('./pages/PortalProfile'),
  '/supplier/chat': () => import('./pages/ChatPage'),
  '/operations': () => import('./pages/operations/Dashboard'),
  '/operations/applications': () => import('./pages/PortalApplications'),
  '/operations/profile': () => import('./pages/PortalProfile'),
  '/operations/chat': () => import('./pages/ChatPage'),
  '/finance': () => import('./pages/Finance'),
  '/finance/applications': () => import('./pages/PortalApplications'),
  '/finance/profile': () => import('./pages/PortalProfile'),
  '/finance/chat': () => import('./pages/ChatPage'),
  '/financial': () => import('./pages/financial/Dashboard'),
  '/financial/applications': () => import('./pages/PortalApplications'),
  '/financial/profile': () => import('./pages/PortalProfile'),
  '/financial/chat': () => import('./pages/ChatPage'),
  '/accounting': () => import('./pages/accounting/Dashboard'),
  '/accounting/applications': () => import('./pages/PortalApplications'),
  '/accounting/profile': () => import('./pages/PortalProfile'),
  '/accounting/chat': () => import('./pages/ChatPage'),
  '/engineering': () => import('./pages/Engineering'),
  '/engineering/applications': () => import('./pages/PortalApplications'),
  '/engineering/profile': () => import('./pages/PortalProfile'),
  '/engineering/chat': () => import('./pages/ChatPage'),
  '/technical': () => import('./pages/technical/Dashboard'),
  '/technical/applications': () => import('./pages/PortalApplications'),
  '/technical/profile': () => import('./pages/PortalProfile'),
  '/technical/chat': () => import('./pages/ChatPage'),
  '/ceo': () => import('./pages/ceo/Dashboard'),
  '/ceo/applications': () => import('./pages/PortalApplications'),
  '/ceo/profile': () => import('./pages/PortalProfile'),
  '/ceo/chat': () => import('./pages/ChatPage'),
  '/co-ceo': () => import('./pages/co-ceo/Dashboard'),
  '/co-ceo/applications': () => import('./pages/PortalApplications'),
  '/co-ceo/profile': () => import('./pages/PortalProfile'),
  '/co-ceo/chat': () => import('./pages/ChatPage'),
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
