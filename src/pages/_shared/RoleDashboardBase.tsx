import { useEffect, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { appVisibleToPortalPath } from '../../utils/departmentRouteMap'
import { useActivityLog } from '../../contexts/ActivityLogContext'
import { useApplications } from '../../contexts/ApplicationsContext'
import { useTheme } from '../../contexts/ThemeContext'

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
  activityFocusLabel,
  activityMatcher,
}: RoleDashboardBaseProps) {
  const { addEntry, entries } = useActivityLog()
  const { apps } = useApplications()
  const { theme } = useTheme()

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

  const actionBreakdown = useMemo(() => {
    const pretty = (raw: string): string =>
      raw
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    const map = new Map<string, number>()
    for (const e of recent) {
      const key = pretty(e.action.replace(/_/g, ' '))
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }, [recent])

  const appAudience = useMemo(() => {
    const single = roleApps.filter((a) => (a.visibleTo?.length ?? 0) <= 1).length
    const multi = roleApps.filter((a) => (a.visibleTo?.length ?? 0) > 1).length
    const noDomain = roleApps.filter((a) => !String(a.domain ?? '').trim()).length
    return [
      { name: 'Single-role', value: single, color: '#3b82f6' },
      { name: 'Multi-role', value: multi, color: '#14b8a6' },
      { name: 'No domain', value: noDomain, color: '#f59e0b' },
    ].filter((x) => x.value > 0)
  }, [roleApps])

  const chartGrid = theme === 'dark' ? '#334155' : '#e2e8f0'
  const chartAxis = theme === 'dark' ? '#94a3b8' : '#64748b'
  const actionColors = ['#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b']
  const chartTooltip = theme === 'dark'
    ? {
        background: 'rgba(30, 41, 59, 0.96)',
        border: '1px solid rgba(148, 163, 184, 0.28)',
        borderRadius: 10,
        color: '#e2e8f0',
      }
    : {
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        color: '#0f172a',
      }

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
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{actionBreakdown.length}</span>
            <span className="dashboard-stat-label">Action types</span>
          </div>
        </section>
        <div className="dashboard-graphs">
          <section className="dashboard-graph-card" aria-label={`${title} action breakdown`}>
            <h2 className="dashboard-graph-title">Activity breakdown</h2>
            <p className="dashboard-graph-desc">Top recent actions detected for {title.toLowerCase()} workflows.</p>
            <div className="dashboard-graph-wrap">
              {actionBreakdown.length === 0 ? (
                <div className="dashboard-graph-empty">No tracked actions yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280} debounce={200}>
                  <BarChart data={actionBreakdown} layout="vertical" margin={{ top: 8, right: 20, left: 24, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: chartAxis, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 11, fill: chartAxis, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                      width={108}
                    />
                    <Tooltip contentStyle={chartTooltip} formatter={(v) => [v, 'Events']} />
                    <Bar dataKey="value" name="Events" radius={[0, 6, 6, 0]}>
                      {actionBreakdown.map((row, i) => (
                        <Cell key={`${row.name}-${i}`} fill={actionColors[i % actionColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          <section className="dashboard-graph-card" aria-label={`${title} app exposure`}>
            <h2 className="dashboard-graph-title">App exposure mix</h2>
            <p className="dashboard-graph-desc">How assigned apps are scoped and configured in this role.</p>
            <div className="dashboard-graph-wrap">
              {appAudience.length === 0 ? (
                <div className="dashboard-graph-empty">No application visibility data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280} debounce={200}>
                  <PieChart>
                    <Pie
                      data={appAudience}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={86}
                      paddingAngle={3}
                    >
                      {appAudience.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {appAudience.length > 0 && (
                <div className="dashboard-graph-legend">
                  {appAudience.map((slice) => (
                    <span key={slice.name} className="dashboard-legend-chip">
                      <i className="dashboard-legend-dot" style={{ background: slice.color }} aria-hidden />
                      {slice.name}: {slice.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

