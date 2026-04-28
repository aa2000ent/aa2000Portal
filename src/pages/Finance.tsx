import { useEffect, useMemo } from 'react'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { useApplications } from '../contexts/ApplicationsContext'
import { appVisibleToPortalPath } from '../utils/departmentRouteMap'
import ActiveAnnouncementsCard from '../components/ActiveAnnouncementsCard'
import DashboardStories from '../components/DashboardStories'

export default function Finance() {
  const { addEntry, entries } = useActivityLog()
  const { apps } = useApplications()
  useEffect(() => {
    addEntry({ action: 'page_visited', actor: 'Finance', target: 'Finance dashboard', details: 'Viewed Finance dashboard' })
  }, [addEntry])

  const financeApps = useMemo(() => apps.filter((a) => appVisibleToPortalPath(a, '/finance')), [apps])
  const financeOps = useMemo(
    () =>
      entries
        .filter((e) => /approve|reject|payment|invoice|budget|finance|expense/i.test(`${e.action} ${e.details ?? ''}`))
        .slice(-6)
        .reverse(),
    [entries],
  )

  return (
    <div className="dashboard-page dashboard-page--finance">
      <div className="dashboard-page-content">
        <DashboardStories />
        <header className="dashboard-page-header">
          <h1 className="dashboard-page-title">Finance</h1>
          <p className="dashboard-page-subtitle">Financial access overview and approvals activity</p>
        </header>
        <section className="dashboard-stats" aria-label="Finance metrics">
          <div className="dashboard-stat-card" style={{ animationDelay: '0ms' }}>
            <span className="dashboard-stat-value">{financeApps.length}</span>
            <span className="dashboard-stat-label">Assigned apps</span>
            <span className="dashboard-stat-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M8 8h8M8 12h8M8 16h5" />
              </svg>
            </span>
          </div>
          <div className="dashboard-stat-card" style={{ animationDelay: '60ms' }}>
            <span className="dashboard-stat-value">{financeOps.length}</span>
            <span className="dashboard-stat-label">Recent finance events</span>
            <span className="dashboard-stat-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
          </div>
        </section>

        <div className="dashboard-graphs">
          <section className="dashboard-graph-card" aria-label="Finance application access">
            <h2 className="dashboard-graph-title">Application access</h2>
            <p className="dashboard-graph-desc">Apps visible to Finance users.</p>
            <div className="dashboard-graph-wrap">
              {financeApps.length === 0 ? (
                <div className="dashboard-graph-empty">No applications are assigned to Finance yet.</div>
              ) : (
                <ul className="app-grid" aria-label="Finance application list">
                  {financeApps.slice(0, 8).map((app) => (
                    <li key={app.id} className="app-card">
                      <h3 className="app-card-name">{app.name}</h3>
                      <p className="app-card-desc">{app.description || '—'}</p>
                      {app.domain ? <p className="app-card-domain">{app.domain.replace(/^https?:\/\//, '')}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="dashboard-graph-card" aria-label="Finance recent activity">
            <h2 className="dashboard-graph-title">Recent activity</h2>
            <p className="dashboard-graph-desc">Approval and finance-related actions in this session.</p>
            <div className="dashboard-graph-wrap">
              {financeOps.length === 0 ? (
                <div className="dashboard-graph-empty">No finance activity yet.</div>
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
                    {financeOps.map((e) => (
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
        <ActiveAnnouncementsCard />
      </div>
    </div>
  )
}
