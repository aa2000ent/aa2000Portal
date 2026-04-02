import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { useChat } from '../contexts/ChatContext'
import { useSidebar } from '../contexts/SidebarContext'
import { clearAuthToken, clearSessionId } from '../api/client'
import { prefetchRoute } from '../prefetchRoutes'

type NavItem = { to: string; label: string; end: boolean; icon?: string }

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  marketing: 'Marketing',
  finance: 'Finance',
  engineering: 'Engineering',
}

function NavIcon({ name }: { name: string }) {
  const size = 20
  switch (name) {
    case 'dashboard':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      )
    case 'employees':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'applications':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    case 'approvals':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      )
    case 'history':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    case 'profile':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'chat':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'customer':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    default:
      return null
  }
}

type SidebarLayoutProps = {
  navItems: NavItem[]
}

export default function SidebarLayout({ navItems }: SidebarLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { addEntry } = useActivityLog()
  const { messages } = useChat()
  const { isOpen: isSidebarOpen, setOpen: setSidebarOpen, scrollContainerRef, savedScrollTopRef } = useSidebar()
  const [isCollapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isTransitioning, setTransitioning] = useState(false)
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const fn = () => setIsMobile(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const handleSignOutClick = () => setSignOutConfirmOpen(true)

  const handleLogoutConfirm = () => {
    setSignOutConfirmOpen(false)
    clearAuthToken()
    clearSessionId()
    const path = location.pathname.replace(/^\//, '').split('/')[0] || 'admin'
    const roleLabel = ROLE_LABELS[path] ?? path
    addEntry({ action: 'sign_out', actor: roleLabel, target: 'Portal', details: 'Session ended' })
    navigate('/', { replace: true })
  }

  const handleCollapseClick = () => {
    if (isMobile) return
    if (scrollContainerRef.current) {
      savedScrollTopRef.current = scrollContainerRef.current.scrollTop
    }
    requestAnimationFrame(() => {
      setTransitioning(true)
      setCollapsed((c) => !c)
    })
  }

  useEffect(() => {
    if (!sidebarRef.current || !isTransitioning) return
    const el = sidebarRef.current
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'width') setTransitioning(false)
    }
    el.addEventListener('transitionend', onEnd)
    return () => el.removeEventListener('transitionend', onEnd)
  }, [isTransitioning, isCollapsed])

  const path = location.pathname.replace(/^\//, '').split('/')[0] || 'admin'
  const roleLabel = ROLE_LABELS[path] ?? path
  const showCollapsed = !isMobile && isCollapsed

  // Restore scroll position after sidebar open/close or collapse/expand
  useEffect(() => {
    const top = savedScrollTopRef.current
    if (top === null) return
    savedScrollTopRef.current = null
    const scrollEl = scrollContainerRef.current
    if (!scrollEl) return
    const restore = () => { scrollEl.scrollTop = top }
    requestAnimationFrame(() => requestAnimationFrame(restore))
    const t = setTimeout(restore, 320)
    return () => clearTimeout(t)
  }, [isSidebarOpen, showCollapsed])

  return (
    <div
      className={`dashboard-with-sidebar relative w-full min-h-full flex ${isSidebarOpen ? 'sidebar-open' : ''} ${showCollapsed ? 'sidebar-collapsed' : ''} ${isTransitioning ? 'overflow-x-hidden' : ''}`}
      data-collapsed={showCollapsed}
    >
      {isSidebarOpen && isMobile && (
        <div
          className="fixed inset-x-0 bottom-0 top-[var(--dashboard-header-h)] bg-black/30 z-[999] transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside
        ref={sidebarRef}
        className={`sidebar-panel
          flex flex-col px-4 pt-6 pb-3
          md:fixed md:top-[var(--dashboard-header-h)] md:left-0 md:bottom-0 md:z-40
          md:transition-[transform,width,min-width] md:duration-300 md:ease-[cubic-bezier(0.4,0,0.2,1)]
          w-[240px] min-w-[240px]
          md:[contain:layout_style] md:translate-z-0
          ${isTransitioning ? 'md:will-change-[width,min-width]' : ''}
          ${showCollapsed ? 'md:w-[76px] md:min-w-[76px] md:overflow-visible' : ''}
          max-md:fixed max-md:left-0 max-md:top-[var(--dashboard-header-h)] max-md:bottom-0 max-md:w-[200px] max-md:min-w-[200px] max-md:p-3 max-md:pt-4 max-md:pb-0
          max-md:-translate-x-full max-md:transition-transform max-md:duration-300 max-md:ease-[cubic-bezier(0.4,0,0.2,1)] max-md:z-[1001] max-md:flex max-md:flex-col max-md:overflow-hidden
          ${isSidebarOpen && isMobile ? 'max-md:translate-x-0 max-md:shadow-xl' : ''}
        `}
        aria-label={`${roleLabel} navigation`}
      >
        <nav className="flex flex-col gap-1 pt-1 px-2 flex-1 min-h-0 overflow-hidden">
          {navItems.length > 0 ? (
            navItems.map(({ to, label, end, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `sidebar-nav-link flex items-center gap-3 py-3 px-3 min-h-[44px] rounded-lg no-underline text-sm font-medium
                  ${isActive ? 'active' : ''}
                  ${showCollapsed ? 'md:justify-center md:px-0' : ''}
                  `
                }
                onMouseEnter={() => prefetchRoute(to)}
                onFocus={() => prefetchRoute(to)}
                onClick={() => window.innerWidth <= 768 && setSidebarOpen(false)}
                title={showCollapsed ? label : undefined}
              >
                {icon && (
                  <span className="flex items-center justify-center shrink-0 w-5 h-5 relative" aria-hidden>
                    <NavIcon name={icon} />
                    {icon === 'chat' && messages.length > 0 && (
                      <span className="sidebar-chat-badge" aria-hidden>
                        {messages.length > 99 ? '99+' : messages.length}
                      </span>
                    )}
                  </span>
                )}
                <span
                  className="sidebar-nav-label overflow-hidden whitespace-nowrap block transition-[width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] md:min-w-0"
                  style={!isMobile ? { width: showCollapsed ? 0 : 192, opacity: showCollapsed ? 0 : 1 } : undefined}
                >
                  {label}
                </span>
              </NavLink>
            ))
          ) : (
            <div className="py-3 px-3 text-sm font-semibold text-slate-400">{roleLabel}</div>
          )}
        </nav>
        <div className="sidebar-footer pt-4 mt-3 px-2 border-t flex flex-col gap-1.5 shrink-0 pb-2">
          <button
            type="button"
            className={`sidebar-footer-btn hidden md:flex items-center gap-3 w-full py-3 min-h-[44px] border-none rounded-lg bg-transparent text-sm font-semibold cursor-pointer transition-colors ${showCollapsed ? 'justify-center px-0' : 'justify-start px-3'}`}
            onClick={handleCollapseClick}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-hidden={isMobile}
          >
            <span className="flex items-center justify-center shrink-0 w-5 h-5 min-w-5 min-h-5">
              {isCollapsed ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              )}
            </span>
            <span
              className="overflow-hidden whitespace-nowrap block transition-[width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ width: showCollapsed ? 0 : 96, opacity: showCollapsed ? 0 : 1 }}
            >
              Collapse
            </span>
          </button>
          <button
            type="button"
            className={`sidebar-footer-btn sidebar-footer-btn--danger flex items-center gap-3 w-full py-3 min-h-[44px] border-none rounded-lg bg-transparent text-sm font-semibold cursor-pointer transition-colors ${showCollapsed ? 'justify-center px-0' : 'justify-start px-3'}`}
            onClick={handleSignOutClick}
            title="Sign out"
          >
            <span className="flex items-center justify-center shrink-0 w-5 h-5 min-w-5 min-h-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            <span
              className="overflow-hidden whitespace-nowrap block transition-[width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={!isMobile ? { width: showCollapsed ? 0 : 96, opacity: showCollapsed ? 0 : 1 } : undefined}
            >
              Sign out
            </span>
          </button>
        </div>
      </aside>
      <ConfirmDialog
        open={signOutConfirmOpen}
        title="Sign out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleLogoutConfirm}
        onCancel={() => setSignOutConfirmOpen(false)}
      />
      <div
        className="flex-1 min-w-0 pt-4 pb-10 px-8 max-md:pt-4 max-md:pb-8 max-md:px-5 max-md:block md:transition-[margin-left] md:duration-300 md:ease-[cubic-bezier(0.4,0,0.2,1)] overflow-y-auto overflow-x-hidden"
        style={!isMobile ? { marginLeft: isSidebarOpen ? (showCollapsed ? 76 : 240) : 0 } : undefined}
      >
        <Outlet />
      </div>
    </div>
  )
}
