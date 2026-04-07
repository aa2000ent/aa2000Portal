import { useEffect, useMemo } from 'react'
import { appVisibleToPortalPath } from '../../utils/departmentRouteMap'
import { useActivityLog } from '../../contexts/ActivityLogContext'
import { useApplications } from '../../contexts/ApplicationsContext'

type RoleDashboardBaseProps = {
  segment: string
  title: string
  subtitle: string
  appSectionTitle: string
  appSectionDesc: string
  activitySectionDesc: string
  activityFocusLabel: string
  activityMatcher?: RegExp
}

export default function RoleDashboardBase({
  segment,
  title,
  subtitle,
  appSectionTitle,
  appSectionDesc,
  activitySectionDesc,
  activityFocusLabel,
  activityMatcher,
}: RoleDashboardBaseProps) {
  const { addEntry, entries } = useActivityLog()
  const { apps } = useApplications()

  useEffect(() => {
    addEntry({ action: 'page_visited', actor: title, target: `${title} dashboard`, details: `Viewed ${title} dashboard` })
  }, [addEntry, title])

  const roleApps = useMemo(() => apps.filter((a) => appVisibleToPortalPath(a, `/${segment}`)), [apps, segment])
  const recent = useMemo(
    () =>
      [...entries]
        .filter((e) => e.actor !== 'Admin')
        .filter((e) => (activityMatcher ? activityMatcher.test(`${e.action} ${e.details ?? ''} ${e.target}`) : true))
        .slice(-6)
        .reverse(),
    [entries, activityMatcher],
  )

  return (
    <div className={`dashboard-page dashboard-page--${segment}`}>
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">{title}</h1>
        <p className="dashboard-page-subtitle">{subtitle}</p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-stats" aria-label={`${title} metrics`}>
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{roleApps.length}</span>
            <span className="dashboard-stat-label">Assigned apps</span>
          </div>
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{recent.length}</span>
            <span className="dashboard-stat-label">{activityFocusLabel}</span>
          </div>
        </section>
        <div className="dashboard-graphs">
          <section className="dashboard-graph-card" aria-label={`${title} apps`}>
            <h2 className="dashboard-graph-title">{appSectionTitle}</h2>
            <p className="dashboard-graph-desc">{appSectionDesc}</p>
            <div className="dashboard-graph-wrap">
              {roleApps.length === 0 ? (
                <div className="dashboard-graph-empty">No applications are assigned to {title} yet.</div>
              ) : (
                <ul className="app-grid">
                  {roleApps.slice(0, 8).map((app) => (
                    <li key={app.id} className="app-card">
                      <h3 className="app-card-name">{app.name}</h3>
                      <p className="app-card-desc">{app.description || '—'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section className="dashboard-graph-card" aria-label={`${title} activity`}>
            <h2 className="dashboard-graph-title">Recent activity</h2>
            <p className="dashboard-graph-desc">{activitySectionDesc}</p>
            <div className="dashboard-graph-wrap">
              {recent.length === 0 ? (
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
                    {recent.map((e) => (
                      <tr key={e.id}>
                        <td className="gm-activity-time">{e.timestamp}</td>
                        <td className="gm-activity-action">{e.action.replace(/_/g, ' ')}</td>
                        <td className="gm-activity-target">{e.target}</td>
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

