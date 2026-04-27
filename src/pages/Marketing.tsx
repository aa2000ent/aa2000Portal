import { useEffect, useMemo } from 'react'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { useApplications } from '../contexts/ApplicationsContext'
import { appVisibleToPortalPath } from '../utils/departmentRouteMap'
import ActiveAnnouncementsCard from '../components/ActiveAnnouncementsCard'
import DashboardStories from '../components/DashboardStories'
import { useTheme } from '../contexts/ThemeContext'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

export default function Marketing() {
  const { addEntry } = useActivityLog()
  const { apps } = useApplications()
  const { theme } = useTheme()

  useEffect(() => {
    addEntry({ action: 'page_visited', actor: 'Marketing', target: 'Marketing dashboard', details: 'Viewed Marketing dashboard' })
  }, [addEntry])

  const marketingApps = useMemo(() => {
    return apps.filter((a) => appVisibleToPortalPath(a, '/marketing'))
  }, [apps])

  const visibilityMix = useMemo(() => {
    const singleRole = marketingApps.filter((a) => (a.visibleTo?.length ?? 0) <= 1).length
    const multiRole = marketingApps.filter((a) => (a.visibleTo?.length ?? 0) > 1).length
    const noDomain = marketingApps.filter((a) => !String(a.domain ?? '').trim()).length
    return [
      { name: 'Single-role', value: singleRole, color: '#3b82f6' },
      { name: 'Multi-role', value: multiRole, color: '#14b8a6' },
      { name: 'No domain', value: noDomain, color: '#f59e0b' },
    ].filter((x) => x.value > 0)
  }, [marketingApps])

  const marketingUseCases = useMemo(() => {
    const buckets = { Campaign: 0, Leads: 0, Content: 0, Analytics: 0, Other: 0 }
    for (const app of marketingApps) {
      const text = `${app.name} ${app.description}`.toLowerCase()
      if (/campaign|ads|promo|branding/.test(text)) buckets.Campaign += 1
      else if (/lead|crm|sales|pipeline/.test(text)) buckets.Leads += 1
      else if (/content|social|creative|media/.test(text)) buckets.Content += 1
      else if (/analytics|report|insight|dashboard/.test(text)) buckets.Analytics += 1
      else buckets.Other += 1
    }
    return Object.entries(buckets)
      .map(([name, value]) => ({ name, value }))
      .filter((x) => x.value > 0)
  }, [marketingApps])

  const campaignAppsCount = useMemo(() => {
    const found = marketingUseCases.find((x) => x.name === 'Campaign')
    return found?.value ?? 0
  }, [marketingUseCases])

  const needsDomainSetupCount = useMemo(
    () => marketingApps.filter((a) => !String(a.domain ?? '').trim()).length,
    [marketingApps],
  )

  const chartGrid = theme === 'dark' ? '#334155' : '#e2e8f0'
  const chartAxis = theme === 'dark' ? '#94a3b8' : '#64748b'
  const chartTooltip =
    theme === 'dark'
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
    <div className="dashboard-page dashboard-page--marketing">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Marketing</h1>
        <p className="dashboard-page-subtitle">Applications overview</p>
      </header>
      <div className="dashboard-page-content">
        <DashboardStories />
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
            <span className="dashboard-stat-value">{marketingUseCases.length}</span>
            <span className="dashboard-stat-label">Use-case groups</span>
            <span className="dashboard-stat-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h10" />
              </svg>
            </span>
          </div>
          <div className="dashboard-stat-card" style={{ animationDelay: '120ms' }}>
            <span className="dashboard-stat-value">{campaignAppsCount}</span>
            <span className="dashboard-stat-label">Campaign-focused apps</span>
            <span className="dashboard-stat-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6l-5 4H4a1 1 0 0 0-1 1z" />
                <path d="M15 9a5 5 0 0 1 0 6" />
                <path d="M17.5 6.5a8.5 8.5 0 0 1 0 11" />
              </svg>
            </span>
          </div>
          <div className="dashboard-stat-card" style={{ animationDelay: '180ms' }}>
            <span className="dashboard-stat-value">{needsDomainSetupCount}</span>
            <span className="dashboard-stat-label">Needs domain setup</span>
            <span className="dashboard-stat-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </span>
          </div>
        </section>

        <div className="dashboard-graphs">
          <section className="dashboard-graph-card" aria-label="Marketing app use-case mix">
            <h2 className="dashboard-graph-title">Use-case mix</h2>
            <p className="dashboard-graph-desc">How Marketing-assigned apps are distributed by workflow type.</p>
            <div className="dashboard-graph-wrap">
              {marketingUseCases.length === 0 ? (
                <div className="dashboard-graph-empty">No categorized app data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280} debounce={200}>
                  <BarChart data={marketingUseCases} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: chartAxis, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: chartAxis, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip contentStyle={chartTooltip} formatter={(v) => [v, 'Apps']} />
                    <Bar dataKey="value" name="Apps" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          <section className="dashboard-graph-card" aria-label="Marketing visibility scope">
            <h2 className="dashboard-graph-title">Visibility scope</h2>
            <p className="dashboard-graph-desc">Whether your apps are dedicated to one role or shared across multiple roles.</p>
            <div className="dashboard-graph-wrap">
              {visibilityMix.length === 0 ? (
                <div className="dashboard-graph-empty">No visibility data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280} debounce={200}>
                  <PieChart>
                    <Pie
                      data={visibilityMix}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={86}
                      paddingAngle={3}
                    >
                      {visibilityMix.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {visibilityMix.length > 0 && (
                <div className="dashboard-graph-legend">
                  {visibilityMix.map((slice) => (
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
        <ActiveAnnouncementsCard />
      </div>
    </div>
  )
}
