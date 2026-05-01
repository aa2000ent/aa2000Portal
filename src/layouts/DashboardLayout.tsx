import { useEffect, useState } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import logoImg from '../assets/logo/logo.avif'
import { SidebarProvider, useSidebar } from '../contexts/SidebarContext'
import { fetchEmployees } from '../api/employees'
import { getPortalAccountId, getPortalEmpId, getPortalUsername } from '../api/client'

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

function DashboardHeader() {
  const location = useLocation()
  const path = location.pathname.replace(/^\//, '').split('/')[0] || 'admin'
  const roleLabel = ROLE_LABELS[path] ?? path
  const isAdmin = location.pathname.startsWith('/admin')
  const profileTo = isAdmin ? '/admin/profile' : `/${path}/profile`
  const { isOpen, toggle } = useSidebar()
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false
    const accIdNum = Number(getPortalAccountId() ?? 0)
    const empIdNum = Number(getPortalEmpId() ?? 0)
    const username = String(getPortalUsername() ?? '').trim().toLowerCase()

    if (accIdNum <= 0 && empIdNum <= 0 && !username) {
      setProfilePhotoUrl(undefined)
      return
    }

    void (async () => {
      try {
        const list = await fetchEmployees()
        const me =
          (accIdNum > 0 ? list.find((e) => e.accId === accIdNum) : undefined) ??
          (empIdNum > 0 ? list.find((e) => Number(e.id ?? 0) === empIdNum) : undefined) ??
          (username ? list.find((e) => e.email.toLowerCase() === username || e.name.toLowerCase() === username) : undefined)
        if (!cancelled) {
          setProfilePhotoUrl(me?.photoUrl)
        }
      } catch {
        if (!cancelled) setProfilePhotoUrl(undefined)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <header className="dashboard-app-header flex flex-col gap-0 px-4 sm:px-6">
      <div className="flex items-center w-full min-h-[3.25rem]">
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
        <Link
          to={profileTo}
          className="dashboard-app-header-profile flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-white/10 text-slate-200 no-underline transition-all duration-200 hover:bg-white/18 hover:text-white hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:ring-offset-2 focus:ring-offset-slate-900"
          title="Profile"
          aria-label="Profile"
        >
          {profilePhotoUrl ? (
            <img
              src={profilePhotoUrl}
              alt="Profile"
              className="dashboard-app-header-profile-photo"
              onError={() => setProfilePhotoUrl(undefined)}
            />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </Link>
      </div>
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
