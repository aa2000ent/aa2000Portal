import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApplications, type App } from '../contexts/ApplicationsContext'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { fetchApplications } from '../api/applications'
import { hasApiBase } from '../api/client'
import { appendSessionIdToLaunchUrl } from '../utils/appendSessionToUrl'

/** URL segment → same labels used in Admin “Departments” checkboxes (DB role names). */
const PORTAL_SEGMENT_TO_ROLE_LABEL: Record<string, string> = {
  marketing: 'Marketing',
  finance: 'Finance',
  engineering: 'Engineering',
  'general-manager': 'General Manager',
  admin: 'Admin',
}

function viewerRoleLabels(pathname: string): string[] {
  const segment = pathname.replace(/^\//, '').split('/')[0] || ''
  const mapped = PORTAL_SEGMENT_TO_ROLE_LABEL[segment]
  if (mapped) return [mapped]
  if (!segment) return []
  const title = segment
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ')
  return [title]
}

function appIsVisibleToViewer(app: App, pathname: string): boolean {
  const vt = app.visibleTo ?? []
  if (vt.length === 0) return false
  const want = new Set(viewerRoleLabels(pathname).map((s) => s.trim().toLowerCase()))
  return vt.some((r) => want.has(String(r).trim().toLowerCase()))
}

export default function PortalApplications() {
  const location = useLocation()
  const { apps, setApps } = useApplications()
  const { addEntry } = useActivityLog()
  const [search, setSearch] = useState('')

  const roleLabel = useMemo(() => viewerRoleLabels(location.pathname)[0] ?? 'Portal', [location.pathname])

  useEffect(() => {
    if (!hasApiBase()) return
    let cancelled = false
    fetchApplications()
      .then((list) => {
        if (!cancelled) setApps(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [setApps, location.pathname])

  const filtered = useMemo(() => {
    return apps.filter((app) => {
      if (!appIsVisibleToViewer(app, location.pathname)) return false
      const matchSearch =
        !search ||
        app.name.toLowerCase().includes(search.toLowerCase()) ||
        app.description.toLowerCase().includes(search.toLowerCase()) ||
        app.domain.toLowerCase().includes(search.toLowerCase())
      return matchSearch
    })
  }, [apps, location.pathname, search])

  const handleLaunch = async (app: App) => {
    if (app.domain) {
      addEntry({ action: 'app_launched', actor: roleLabel, target: app.name, details: app.domain })
      const base = app.domain.startsWith('http') ? app.domain : `https://${app.domain}`
      const url = await appendSessionIdToLaunchUrl(base)
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Applications</h1>
        <p className="dashboard-page-subtitle">Apps available for your department</p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-card applications-card">
          <div className="employees-toolbar">
            <div className="employees-search-wrap">
              <svg className="employees-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                className="employees-search"
                placeholder="Search by app name, description, or domain..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search apps"
              />
            </div>
          </div>

          <div className="app-grid-wrap">
            {filtered.length === 0 ? (
              <div className="app-grid-empty">
                {apps.some((a) => appIsVisibleToViewer(a, location.pathname))
                  ? 'No apps match your search.'
                  : 'No applications are assigned to your department yet.'}
              </div>
            ) : (
              <ul className="app-grid" aria-label="Application list">
                {filtered.map((app) => (
                  <li key={app.id} className="app-card">
                    <div className="app-card-icon" aria-hidden>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                      </svg>
                    </div>
                    <h3 className="app-card-name">{app.name}</h3>
                    <p className="app-card-desc">{app.description || '—'}</p>
                    {app.domain ? (
                      <p className="app-card-domain" title={app.domain}>
                        {app.domain.replace(/^https?:\/\//, '')}
                      </p>
                    ) : null}
                    <div className="app-card-actions">
                      <button
                        type="button"
                        className="app-card-launch"
                        title="Launch"
                        onClick={() => { void handleLaunch(app) }}
                        disabled={!app.domain}
                      >
                        Launch
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
