import { Outlet, useLocation, Link } from 'react-router-dom'
import logoImg from '../assets/logo/logo.avif'
import { SidebarProvider, useSidebar } from '../contexts/SidebarContext'
import { useTheme } from '../contexts/ThemeContext'

function IconSun() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function IconMoon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

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
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <header className="dashboard-app-header flex items-center px-4 sm:px-6">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <button
          type="button"
          className="dashboard-header-burger md:hidden flex items-center justify-center w-10 h-10 min-w-10 min-h-10 rounded-lg border-0 bg-transparent hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/35 focus:ring-inset"
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
        <span className="font-semibold text-base tracking-tight text-slate-100 hidden sm:inline">Portal</span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white/12 text-sky-200 border border-white/18">
          {roleLabel}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2 flex-1 min-w-0 shrink-0">
        <button
          type="button"
          className="dashboard-theme-toggle"
          onClick={toggleTheme}
          title={isDark ? 'Light mode' : 'Dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <IconSun /> : <IconMoon />}
        </button>
        <Link
          to={profileTo}
          className="dashboard-app-header-profile flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-white/10 text-slate-200 no-underline transition-all duration-200 hover:bg-white/18 hover:text-white hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:ring-offset-2 focus:ring-offset-slate-900"
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
      <div className="dashboard h-screen h-dvh flex flex-col">
        <DashboardHeader />
        <DashboardMainWithScroll />
      </div>
    </SidebarProvider>
  )
}
