import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApplications, type App } from '../contexts/ApplicationsContext'
import { useActivityLog } from '../contexts/ActivityLogContext'

const ROLE_LABELS: Record<string, string> = {
  marketing: 'Marketing',
  finance: 'Finance',
  engineering: 'Engineering',
}

export default function PortalApplications() {
  const location = useLocation()
  const { apps } = useApplications()
  const { addEntry } = useActivityLog()
  const [search, setSearch] = useState('')

  const roleLabel = useMemo(() => {
    const segment = location.pathname.replace(/^\//, '').split('/')[0]
    return ROLE_LABELS[segment] ?? segment
  }, [location.pathname])

  const filtered = useMemo(() => {
    return apps.filter((app) => {
      const visibleToMe = app.visibleTo.includes(roleLabel)
      if (!visibleToMe) return false
      const matchSearch =
        !search ||
        app.name.toLowerCase().includes(search.toLowerCase()) ||
        app.description.toLowerCase().includes(search.toLowerCase()) ||
        app.domain.toLowerCase().includes(search.toLowerCase())
      return matchSearch
    })
  }, [apps, roleLabel, search])

  const handleLaunch = (app: App) => {
    if (app.domain) {
      addEntry({ action: 'app_launched', actor: roleLabel, target: app.name, details: app.domain })
      const url = app.domain.startsWith('http') ? app.domain : `https://${app.domain}`
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
                {apps.some((a) => a.visibleTo.includes(roleLabel))
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
                    {app.visibleTo.length > 0 ? (
                      <div className="app-card-depts">
                        {app.visibleTo.map((d) => (
                          <span key={d} className="app-card-dept-tag">{d}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="app-card-actions">
                      <button
                        type="button"
                        className="app-card-launch"
                        title="Launch"
                        onClick={() => handleLaunch(app)}
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
