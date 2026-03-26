import { Outlet, useLocation, Link } from 'react-router-dom'
import logoImg from '../assets/logo/logo.avif'
import { SidebarProvider, useSidebar } from '../contexts/SidebarContext'

function DashboardMainWithScroll() {
  const { scrollContainerRef } = useSidebar()
  return (
    <main
      ref={scrollContainerRef as React.RefObject<HTMLElement>}
      className="dashboard-main flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden"
    >
      <Outlet />
    </main>
  )
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  marketing: 'Marketing',
  finance: 'Finance',
  engineering: 'Engineering',
}

function DashboardHeader() {
  const location = useLocation()
  const path = location.pathname.replace(/^\//, '').split('/')[0] || 'admin'
  const roleLabel = ROLE_LABELS[path] ?? path
  const isAdmin = location.pathname.startsWith('/admin')
  const profileTo = isAdmin ? '/admin/profile' : `/${path}/profile`
  const { isOpen, toggle } = useSidebar()

  return (
    <header className="dashboard-app-header flex-shrink-0 fixed top-0 left-0 right-0 z-50 flex items-center px-4 sm:px-6">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <button
          type="button"
          className="dashboard-header-burger md:hidden flex items-center justify-center w-10 h-10 min-w-10 min-h-10 rounded-lg border-0 bg-transparent text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-inset"
          onClick={toggle}
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isOpen}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <img src={logoImg} alt="AA2000" className="h-9 w-auto object-contain flex-shrink-0" />
        <span className="font-semibold text-base tracking-tight text-slate-800 hidden sm:inline">Portal</span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          {roleLabel}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2 flex-1 min-w-0 shrink-0">
        <Link
          to={profileTo}
          className="dashboard-app-header-profile flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 bg-white text-slate-500 no-underline transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2"
          title="Profile"
          aria-label="Profile"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </Link>
      </div>
    </header>
  )
}

export default function DashboardLayout() {
  return (
    <SidebarProvider>
      <div className="dashboard h-screen h-dvh flex flex-col bg-[#f8fafc]">
        <DashboardHeader />
        <DashboardMainWithScroll />
      </div>
    </SidebarProvider>
  )
}
