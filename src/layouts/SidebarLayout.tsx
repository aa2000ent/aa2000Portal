import { useState, useEffect, useRef, Suspense, useMemo } from 'react'
import { Outlet, NavLink, useNavigate, useLocation, matchPath } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import ErrorBoundary from '../components/ErrorBoundary'
import ConfirmDialog from '../components/ConfirmDialog'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { getConversationId, useChat } from '../contexts/ChatContext'
import { useSidebar } from '../contexts/SidebarContext'
import {
  apiRequest,
  clearAuthToken,
  clearPortalAccountId,
  clearPortalEmpId,
  clearPortalHomeSegment,
  clearPortalUsername,
  clearSessionId,
  getPortalAccountId,
  getPortalUsername,
} from '../api/client'
import { logoutSecurity } from '../api/auth'
import { getBaseUrl } from '../api/config'
import { fetchEmployees } from '../api/employees'
import { prefetchRoute } from '../prefetchRoutes'

export type NavItem = { to: string; label: string; end: boolean; icon?: string; children?: NavItem[] }

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  marketing: 'Marketing',
  sale: 'Sale',
  purchasing: 'Purchasing',
  customer: 'Customer',
  supplier: 'Supplier',
  operations: 'Operations',
  finance: 'Finance',
  financial: 'Financial',
  accounting: 'Accounting',
  engineering: 'Engineering',
  technical: 'Technical',
  ceo: 'CEO',
  'co-ceo': 'CO-CEO',
  'general-manager': 'General Manager',
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
    case 'announcements':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6l-5 4H4a1 1 0 0 0-1 1z" />
          <path d="M15 9a5 5 0 0 1 0 6" />
          <path d="M17.5 6.5a8.5 8.5 0 0 1 0 11" />
        </svg>
      )
    case 'memo':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
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
    case 'leave':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
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
    case 'announcement':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 11 16-8v18L3 13v-2z" />
          <path d="M11 20a3 3 0 0 1-3-3v-4" />
        </svg>
      )
    default:
      return null
  }
}

type SidebarLayoutProps = {
  navItems: NavItem[]
}

type SidebarWebhookRow = {
  timestamp?: string
  message?: string
  sender?: string
  senderName?: string
  senderEmpID?: string | number
  senderEmpId?: string | number
  from?: string | number
  fromName?: string
  toEmpID?: string | number
  receiverEmpID?: string | number
  receiverEmpId?: string | number
  toName?: string
  receiverName?: string
}

type SidebarWebhookResponse = {
  data?: Array<string | SidebarWebhookRow>
}

function toEmpIdTag(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^emp-id:\d+$/i.test(raw)) return raw.toLowerCase()
  const num = Number(raw.replace(/^emp:/i, '').replace(/^emp-id:/i, ''))
  if (!Number.isFinite(num) || num <= 0) return null
  return `emp-id:${num}`
}

function buildSidebarMessageId(senderId: string, receiverId: string, timestamp: string, text: string): string {
  return `sidebar-sync-${senderId}->${receiverId}-${timestamp}-${text}`.slice(0, 240)
}

function buildSocketBaseUrl(): string {
  const raw = String(import.meta.env.VITE_SOCKET_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '')
  try {
    const base = getBaseUrl()
    if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, '')
  } catch {
    // fall through
  }
  return window.location.origin
}

export default function SidebarLayout({ navItems }: SidebarLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { addEntry } = useActivityLog()
  const { messages, getUnreadCount, upsertMessages } = useChat()
  const { isOpen: isSidebarOpen, setOpen: setSidebarOpen, scrollContainerRef, savedScrollTopRef } = useSidebar()
  const [isCollapsed, setCollapsed] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({})
  const [isMobile, setIsMobile] = useState(false)
  const [isTransitioning, setTransitioning] = useState(false)
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  /** Scroll container for routed page content (nested inside dashboard-main). */
  const mainContentScrollRef = useRef<HTMLDivElement>(null)

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
    void (async () => {
      const username = getPortalUsername()
      await logoutSecurity(username)
      clearAuthToken()
      clearSessionId()
      clearPortalAccountId()
      clearPortalEmpId()
      clearPortalUsername()
      clearPortalHomeSegment()
      const path = location.pathname.replace(/^\//, '').split('/')[0] || 'admin'
      const roleLabel = ROLE_LABELS[path] ?? path
      addEntry({
        action: 'sign_out',
        actor: username ?? roleLabel,
        target: 'Portal',
        details: 'Session ended',
      })
      navigate('/', { replace: true })
    })()
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
  const signedUsername = String(getPortalUsername() ?? '').trim()
  const unreadSidebarCount = useMemo(() => {
    const conversationIds = Array.from(new Set(messages.map((m) => m.conversationId)))
    const currentAliases = [roleLabel, signedUsername].filter(Boolean)
    return conversationIds.reduce((sum, cid) => (
      getUnreadCount(cid, currentAliases) > 0 ? sum + 1 : sum
    ), 0)
  }, [messages, getUnreadCount, roleLabel, signedUsername])
  const showCollapsed = !isMobile && isCollapsed

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null
    let socket: Socket | null = null

    const syncUnreadMessages = async () => {
      const accId = Number(getPortalAccountId() ?? 0)
      const username = String(getPortalUsername() ?? '').trim().toLowerCase()
      if (!accId && !username) return

      const employees = await fetchEmployees().catch(() => [])
      if (!Array.isArray(employees) || employees.length === 0 || cancelled) return

      const signedEmployee =
        (accId > 0 ? employees.find((e) => Number(e.accId ?? 0) === accId) : undefined) ||
        (username ? employees.find((e) => String(e.email ?? '').trim().toLowerCase() === username) : undefined) ||
        (username ? employees.find((e) => String(e.name ?? '').trim().toLowerCase() === username) : undefined)
      const signedEmpId = Number(signedEmployee?.id ?? 0)
      if (!Number.isFinite(signedEmpId) || signedEmpId <= 0) return

      const res = await apiRequest<SidebarWebhookResponse>(`/ai-services-conversation-chat/webhook/conversation/${signedEmpId}?_ts=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        portal: { suppressFailureLog: true },
      }).catch(() => null)
      if (!res || cancelled) return

      const lines = Array.isArray(res.data) ? res.data : []
      const parsed = lines.flatMap((row): Array<{ id: string; conversationId: string; sender: string; text: string; timestamp: string; status?: 'delivered' }> => {
        let timestamp = ''
        let text = ''
        let senderName = ''
        let fromId: string | null = null
        let toId: string | null = null

        if (typeof row === 'string') {
          const raw = row.trim()
          const m = raw.match(/^\[(.+?)\]\s+EMP_ID:\s*(\d+)\s*\|\s*SENDER:\s*(.*?)\s*\|\s*MSG:\s*(.*)$/)
          if (!m) return []
          timestamp = String(m[1] ?? '').trim()
          const lineEmpId = toEmpIdTag(m[2])
          senderName = String(m[3] ?? '').trim()
          text = String(m[4] ?? '').trim()
          fromId = lineEmpId
          toId = `emp-id:${signedEmpId}`
        } else if (row && typeof row === 'object') {
          timestamp = String(row.timestamp ?? '').trim()
          text = String(row.message ?? '').trim()
          senderName = String(row.fromName ?? row.senderName ?? row.sender ?? '').trim()
          fromId = toEmpIdTag(row.from ?? row.senderEmpID ?? row.senderEmpId)
          toId = toEmpIdTag(row.toEmpID ?? row.receiverEmpID ?? row.receiverEmpId)
        }

        if (!timestamp || !text) return []
        const participantA = fromId || `emp-id:${signedEmpId}`
        const participantB = toId || `emp-id:${signedEmpId}`
        const conversationId = getConversationId(participantA, participantB)
        const fromEmpId = Number(participantA.replace(/^emp-id:/i, ''))
        const isOwn = Number.isFinite(fromEmpId) && fromEmpId === signedEmpId
        const senderLabel = isOwn
          ? (String(getPortalUsername() ?? '').trim() || String(signedEmployee?.name ?? '').trim() || 'Me')
          : (senderName || `Employee ${Number.isFinite(fromEmpId) ? fromEmpId : ''}`.trim())

        return [{
          id: buildSidebarMessageId(participantA, participantB, timestamp, text),
          conversationId,
          sender: senderLabel,
          text,
          timestamp,
          status: isOwn ? 'delivered' : undefined,
        }]
      })

      if (parsed.length > 0 && !cancelled) {
        upsertMessages(parsed)
      }
    }

    const attachRealtimeSocket = async () => {
      const accId = Number(getPortalAccountId() ?? 0)
      const username = String(getPortalUsername() ?? '').trim().toLowerCase()
      if (!accId && !username) return
      const employees = await fetchEmployees().catch(() => [])
      if (!Array.isArray(employees) || employees.length === 0 || cancelled) return
      const signedEmployee =
        (accId > 0 ? employees.find((e) => Number(e.accId ?? 0) === accId) : undefined) ||
        (username ? employees.find((e) => String(e.email ?? '').trim().toLowerCase() === username) : undefined) ||
        (username ? employees.find((e) => String(e.name ?? '').trim().toLowerCase() === username) : undefined)
      const signedEmpId = Number(signedEmployee?.id ?? 0)
      if (!Number.isFinite(signedEmpId) || signedEmpId <= 0 || cancelled) return

      socket = io(buildSocketBaseUrl(), { transports: ['websocket', 'polling'], withCredentials: true })
      socket.on('connect', () => {
        socket?.emit('join', { employeeID: signedEmpId })
        socket?.emit('join', { employeeId: signedEmpId })
        socket?.emit('join', signedEmpId)
        socket?.emit('joinRoom', { employeeID: signedEmpId })
        socket?.emit('joinRoom', { employeeId: signedEmpId })
        socket?.emit('joinRoom', signedEmpId)
        socket?.emit('join_room', { employeeID: signedEmpId })
        socket?.emit('join_room', { employeeId: signedEmpId })
        socket?.emit('join_room', signedEmpId)
        socket?.emit('join', `emp_${signedEmpId}`)
        socket?.emit('joinRoom', `emp_${signedEmpId}`)
      })

      const onIncoming = () => {
        // Re-sync immediately on realtime event to keep sidebar unread badge current.
        void syncUnreadMessages()
      }
      socket.on('message', onIncoming)
      socket.on('chat_message', onIncoming)
      socket.on('new_message', onIncoming)
      socket.on('receive_message', onIncoming)
      socket.on('receiveMessage', onIncoming)
      socket.on('conversation_message', onIncoming)
      socket.on('conversationMessage', onIncoming)
    }

    void syncUnreadMessages()
    void attachRealtimeSocket()
    timer = window.setInterval(() => {
      void syncUnreadMessages()
    }, 5000)

    return () => {
      cancelled = true
      if (timer != null) window.clearInterval(timer)
      if (socket) {
        socket.disconnect()
        socket = null
      }
    }
  }, [upsertMessages])

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

  // SPA: same scroll containers are reused across routes — reset to top when the path changes
  useEffect(() => {
    const outer = scrollContainerRef.current
    const inner = mainContentScrollRef.current
    if (outer) outer.scrollTop = 0
    if (inner) inner.scrollTop = 0
  }, [location.pathname])

  const routeIsActive = (to: string, end: boolean) => {
    if (end) return !!matchPath({ path: to, end: true }, location.pathname)
    return !!matchPath({ path: `${to}/*`, end: false }, location.pathname) || location.pathname === to
  }

  const hasActiveChild = (items: NavItem[] = []): boolean =>
    items.some((item) => (item.children?.length ? hasActiveChild(item.children) : routeIsActive(item.to, item.end)))

  useEffect(() => {
    setExpandedMenus((prev) => {
      const next = { ...prev }
      for (const item of navItems) {
        if (!item.children?.length) continue
        if (hasActiveChild(item.children)) {
          next[item.to] = true
        }
      }
      return next
    })
  }, [location.pathname, navItems])

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
        <nav className="sidebar-panel-nav flex flex-col gap-1 pt-1 px-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
          {navItems.length > 0 ? (
            navItems.map(({ to, label, end, icon, children }) => {
              const childItems = children ?? []
              const hasChildren = childItems.length > 0
              const isExpanded = Boolean(expandedMenus[to])
              const isParentActive = hasChildren && hasActiveChild(childItems)

              if (!hasChildren) {
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `sidebar-nav-link flex w-full min-w-0 items-center gap-3 py-3 px-3 min-h-[44px] rounded-lg no-underline text-sm font-medium
                      ${isActive ? 'active' : ''}
                      ${showCollapsed ? 'md:justify-center md:px-0 md:gap-0' : ''}
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
                        {icon === 'chat' && unreadSidebarCount > 0 && (
                          <span className="sidebar-chat-badge" aria-hidden>
                            {unreadSidebarCount > 99 ? '99+' : unreadSidebarCount}
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
                )
              }

              return (
                <div key={to} className="sidebar-nav-group">
                  <button
                    type="button"
                    className={`sidebar-nav-link sidebar-nav-link--parent flex w-full min-w-0 items-center gap-3 py-3 px-3 min-h-[44px] rounded-lg border-none text-sm font-medium bg-transparent cursor-pointer ${isParentActive ? 'active' : ''} ${showCollapsed ? 'md:justify-center md:px-0 md:gap-0' : ''}`}
                    onClick={() => setExpandedMenus((prev) => ({ ...prev, [to]: !prev[to] }))}
                    title={showCollapsed ? label : undefined}
                    aria-expanded={isExpanded}
                  >
                    {icon && (
                      <span className="flex items-center justify-center shrink-0 w-5 h-5 relative" aria-hidden>
                        <NavIcon name={icon} />
                      </span>
                    )}
                    <span
                      className="sidebar-nav-label overflow-hidden whitespace-nowrap block transition-[width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] md:min-w-0"
                      style={!isMobile ? { width: showCollapsed ? 0 : 176, opacity: showCollapsed ? 0 : 1 } : undefined}
                    >
                      {label}
                    </span>
                    {!showCollapsed && (
                      <span className={`sidebar-nav-chevron ${isExpanded ? 'expanded' : ''}`} aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    )}
                  </button>
                  {isExpanded && !showCollapsed && (
                    <div className="sidebar-subnav" role="group" aria-label={label}>
                      {childItems.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.end}
                          className={({ isActive }) => `sidebar-nav-link sidebar-nav-link--sub flex w-full min-w-0 items-center gap-3 py-2.5 px-3 min-h-[38px] rounded-lg no-underline text-sm font-medium ${isActive ? 'active' : ''}`}
                          onMouseEnter={() => prefetchRoute(child.to)}
                          onFocus={() => prefetchRoute(child.to)}
                          onClick={() => window.innerWidth <= 768 && setSidebarOpen(false)}
                        >
                          <span className="sidebar-nav-label overflow-hidden whitespace-nowrap block">{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <div className="py-3 px-3 text-sm font-semibold text-slate-400">{roleLabel}</div>
          )}
        </nav>
        <div className="sidebar-footer pt-4 mt-3 px-2 border-t flex flex-col gap-1.5 shrink-0 pb-2">
          <button
            type="button"
            className={`sidebar-footer-btn hidden md:flex items-center gap-3 w-full min-w-0 py-3 min-h-[44px] border-none rounded-lg bg-transparent text-sm font-semibold cursor-pointer transition-colors ${showCollapsed ? 'justify-center px-0 gap-0' : 'justify-start px-3'}`}
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
            className={`sidebar-footer-btn sidebar-footer-btn--danger flex items-center gap-3 w-full min-w-0 py-3 min-h-[44px] border-none rounded-lg bg-transparent text-sm font-semibold cursor-pointer transition-colors ${showCollapsed ? 'justify-center px-0 gap-0' : 'justify-start px-3'}`}
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
        ref={mainContentScrollRef}
        className="flex-1 min-w-0 pt-4 pb-10 px-8 max-md:pt-4 max-md:pb-8 max-md:px-5 max-md:block md:transition-[margin-left] md:duration-300 md:ease-[cubic-bezier(0.4,0,0.2,1)] overflow-y-auto overflow-x-hidden"
        style={!isMobile ? { marginLeft: isSidebarOpen ? (showCollapsed ? 76 : 240) : 0 } : undefined}
      >
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex min-h-[400px] flex-col items-center justify-center animate-in fade-in duration-500">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-[var(--aa-blue)]" />
                <span className="mt-4 text-xs font-medium text-slate-400">Loading content...</span>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}
