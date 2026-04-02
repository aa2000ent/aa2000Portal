import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { useApplications } from '../contexts/ApplicationsContext'

export default function Marketing() {
  const { addEntry, entries } = useActivityLog()
  const { apps } = useApplications()
  const location = useLocation()

  useEffect(() => {
    addEntry({ action: 'page_visited', actor: 'Marketing', target: 'Marketing dashboard', details: 'Viewed Marketing dashboard' })
  }, [addEntry])

  const portalSegment = useMemo(() => {
    return location.pathname.replace(/^\//, '').split('/')[0] || 'marketing'
  }, [location.pathname])

  const marketingApps = useMemo(() => {
    const want = 'marketing'
    return apps.filter((a) => (a.visibleTo ?? []).some((v) => String(v).trim().toLowerCase() === want))
  }, [apps])

  const recentEntries = useMemo(() => {
    // Privacy: hide Admin actor noise.
    return [...entries].filter((e) => e.actor !== 'Admin').slice(-6).reverse()
  }, [entries])

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Marketing</h1>
        <p className="dashboard-page-subtitle">Applications and recent actions</p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-stats" aria-label="Marketing metrics">
          <div className="dashboard-stat-card" style={{ animationDelay: '0ms' }}>
            <span className="dashboard-stat-value">{marketingApps.length}</span>
            <span className="dashboard-stat-label">Assigned apps</span>
            <span className="dashboard-stat-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </span>
          </div>

          <div className="dashboard-stat-card" style={{ animationDelay: '60ms' }}>
            <span className="dashboard-stat-value">{portalSegment}</span>
            <span className="dashboard-stat-label">Portal</span>
            <span className="dashboard-stat-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l10 6-10 6L2 8l10-6z" />
                <path d="M2 8v8l10 6 10-6V8" />
              </svg>
            </span>
          </div>
        </section>

        <div className="dashboard-graphs">
          <section className="dashboard-graph-card" aria-label="Top applications">
            <h2 className="dashboard-graph-title">Top applications</h2>
            <p className="dashboard-graph-desc">Apps your Marketing portal can access.</p>
            <div className="dashboard-graph-wrap">
              {marketingApps.length === 0 ? (
                <div className="dashboard-graph-empty">No applications are assigned to Marketing yet.</div>
              ) : (
                <ul className="app-grid" aria-label="Marketing application list">
                  {marketingApps.slice(0, 6).map((app) => (
                    <li key={app.id} className="app-card">
                      <h3 className="app-card-name">{app.name}</h3>
                      <p className="app-card-desc">{app.description || '—'}</p>
                      {app.domain ? (
                        <p className="app-card-domain" title={app.domain}>
                          {app.domain.replace(/^https?:\/\//, '')}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="dashboard-graph-card" aria-label="Recent activity">
            <h2 className="dashboard-graph-title">Recent activity</h2>
            <p className="dashboard-graph-desc">Latest actions in this browser.</p>
            <div className="dashboard-graph-wrap">
              {recentEntries.length === 0 ? (
                <div className="dashboard-graph-empty">No activity yet.</div>
              ) : (
                <table className="gm-activity-table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Action</th>
                      <th scope="col">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEntries.map((e) => (
                      <tr key={e.id}>
                        <td data-label="Time" className="gm-activity-time">{e.timestamp}</td>
                        <td data-label="Action" className="gm-activity-action">{e.action.replace(/_/g, ' ')}</td>
                        <td data-label="Target" className="gm-activity-target">{e.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
