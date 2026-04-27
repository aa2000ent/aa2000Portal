import { useEffect, useMemo } from 'react'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { useApplications } from '../contexts/ApplicationsContext'
import { appVisibleToPortalPath } from '../utils/departmentRouteMap'
import ActiveAnnouncementsCard from '../components/ActiveAnnouncementsCard'
import DashboardStories from '../components/DashboardStories'

export default function Engineering() {
  const { addEntry, entries } = useActivityLog()
  const { apps } = useApplications()
  useEffect(() => {
    addEntry({ action: 'page_visited', actor: 'Engineering', target: 'Engineering dashboard', details: 'Viewed Engineering dashboard' })
  }, [addEntry])

  const engApps = useMemo(() => apps.filter((a) => appVisibleToPortalPath(a, '/engineering')), [apps])
  const devActivity = useMemo(
    () =>
      entries
        .filter((e) => /app_|launch|profile|chat|engineer|technical|issue|deploy/i.test(`${e.action} ${e.details ?? ''}`))
        .slice(-7)
        .reverse(),
    [entries],
  )

  return (
    <div className="dashboard-page dashboard-page--engineering">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Engineering</h1>
        <p className="dashboard-page-subtitle">Technical workspace and engineering activity</p>
      </header>
      <div className="dashboard-page-content">
        <DashboardStories />
        <section className="dashboard-stats" aria-label="Engineering metrics">
          <div className="dashboard-stat-card" style={{ animationDelay: '0ms' }}>
            <span className="dashboard-stat-value">{engApps.length}</span>
            <span className="dashboard-stat-label">Assigned tools/apps</span>
            <span className="dashboard-stat-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a5 5 0 0 0-7.07 7.07L3 18v3h3l4.63-4.63a5 5 0 0 0 7.07-7.07z" />
              </svg>
            </span>
          </div>
          <div className="dashboard-stat-card" style={{ animationDelay: '60ms' }}>
            <span className="dashboard-stat-value">{devActivity.length}</span>
            <span className="dashboard-stat-label">Recent engineering actions</span>
            <span className="dashboard-stat-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 18l6-6-6-6" />
                <path d="M8 6l-6 6 6 6" />
              </svg>
            </span>
          </div>
        </section>

        <div className="dashboard-graphs">
          <section className="dashboard-graph-card" aria-label="Engineering application list">
            <h2 className="dashboard-graph-title">Engineering applications</h2>
            <p className="dashboard-graph-desc">Tools currently available for Engineering.</p>
            <div className="dashboard-graph-wrap">
              {engApps.length === 0 ? (
                <div className="dashboard-graph-empty">No applications are assigned to Engineering yet.</div>
              ) : (
                <ul className="app-grid" aria-label="Engineering application list">
                  {engApps.slice(0, 8).map((app) => (
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

          <section className="dashboard-graph-card" aria-label="Engineering recent activity">
            <h2 className="dashboard-graph-title">Recent activity</h2>
            <p className="dashboard-graph-desc">Latest actions detected in this browser session.</p>
            <div className="dashboard-graph-wrap">
              {devActivity.length === 0 ? (
                <div className="dashboard-graph-empty">No engineering activity yet.</div>
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
                    {devActivity.map((e) => (
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
