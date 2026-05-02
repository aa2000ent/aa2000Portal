import { useEffect, useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from 'recharts'
import { useApprovals } from '../../contexts/ApprovalsContext'
import { useEmployees } from '../../contexts/EmployeesContext'
import { useApplications } from '../../contexts/ApplicationsContext'
import { useActivityLog } from '../../contexts/ActivityLogContext'
import { useTheme } from '../../contexts/ThemeContext'
import { buildAdminDashboardSeries, buildPortalAppsAudiencePie } from '../../utils/dashboardAnalytics'
import { fetchAllActiveEmployees, type ActiveEmployeeResponse } from '../../api/session'
import ActiveAnnouncementsCard from '../../components/ActiveAnnouncementsCard'
import DashboardStories from '../../components/DashboardStories'

function useChartPalette() {
  const { theme } = useTheme()
  return useMemo(() => {
    const isDark = theme === 'dark'
    return {
      grid: isDark ? '#343b45' : '#e2e6ec',
      axis: isDark ? '#b8c2cc' : '#5c6570',
      axisLine: isDark ? 'rgba(184, 194, 204, 0.28)' : 'rgba(92, 101, 112, 0.28)',
      tooltip: isDark
        ? {
            background: '#1c2128',
            border: '1px solid rgba(236, 237, 238, 0.12)',
            borderRadius: 10,
            fontSize: 12,
            padding: '12px 16px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
          }
        : {
            background: '#ffffff',
            border: '1px solid #e2e6ec',
            borderRadius: 10,
            fontSize: 12,
            padding: '12px 16px',
            boxShadow: '0 4px 16px rgba(17, 24, 28, 0.08)',
          },
      tooltipLabel: isDark
        ? ({ color: '#ecedee', fontWeight: 600, marginBottom: 8, fontSize: 13 } as const)
        : ({ color: '#11181c', fontWeight: 600, marginBottom: 8, fontSize: 13 } as const),
      dotStroke: isDark ? '#1c2128' : '#ffffff',
      legendColor: isDark ? '#c5ccd4' : '#5c6570',
      barCursor: isDark ? 'rgba(92, 157, 237, 0.15)' : 'rgba(26, 77, 153, 0.12)',
      weeklyCursor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(17, 24, 28, 0.04)',
      lineUsers: isDark ? '#6eb0ff' : 'var(--aa-blue)',
      lineApps: isDark ? '#ffb74d' : 'var(--aa-cyan)',
      barPrimary: isDark ? '#5c9ded' : 'var(--aa-blue)',
      weeklyLogins: isDark ? '#8b9cff' : '#1565c0',
      weeklyActions: isDark ? '#ffb74d' : '#c9a227',
      growthStroke: isDark ? '#81c784' : '#2e7d32',
      growthFillTop: isDark ? '#81c784' : '#2e7d32',
    }
  }, [theme])
}

export default function AdminDashboard() {
  const chart = useChartPalette()
  const { pendingCount } = useApprovals()
  const { totalCount: totalUsers } = useEmployees()
  const { apps } = useApplications()
  const { entries } = useActivityLog()

  const { activityData, monthlyAppsData, growthData, weeklyActivityData } = useMemo(
    () => buildAdminDashboardSeries(entries, totalUsers),
    [entries, totalUsers],
  )

  const appsAudienceData = useMemo(() => buildPortalAppsAudiencePie(apps), [apps])
  const hasActivitySeries = useMemo(
    () => activityData.some((r) => (r.users ?? 0) > 0 || (r.applications ?? 0) > 0),
    [activityData],
  )
  const hasMonthlyApps = useMemo(() => monthlyAppsData.some((r) => (r.count ?? 0) > 0), [monthlyAppsData])
  const hasGrowthSeries = useMemo(() => growthData.some((r) => (r.total ?? 0) > 0), [growthData])
  const hasWeeklyActivity = useMemo(
    () => weeklyActivityData.some((r) => (r.logins ?? 0) > 0 || (r.actions ?? 0) > 0),
    [weeklyActivityData],
  )
  const [activeEmployees, setActiveEmployees] = useState<ActiveEmployeeResponse[]>([])
  const [isOnlineModalOpen, setIsOnlineModalOpen] = useState(false)
  const [isLoadingActiveEmployees, setIsLoadingActiveEmployees] = useState(false)
  const [activeEmployeesError, setActiveEmployeesError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOnlineModalOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOnlineModalOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOnlineModalOpen])

  const handleOnlineNowClick = async () => {
    setIsOnlineModalOpen(true)
    setIsLoadingActiveEmployees(true)
    setActiveEmployeesError(null)
    try {
      const data = await fetchAllActiveEmployees()
      setActiveEmployees(Array.isArray(data) ? data : [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load active employees.'
      setActiveEmployeesError(message)
      setActiveEmployees([])
    } finally {
      setIsLoadingActiveEmployees(false)
    }
  }

  const stats: Array<{ label: string; value: number | string; icon: string }> = [
    { label: 'Total users', value: totalUsers, icon: 'users' },
    { label: 'Applications', value: apps.length, icon: 'apps' },
    { label: 'Online now', value: activeEmployees.length > 0 ? activeEmployees.length : '—', icon: 'online' },
    { label: 'Pending approval', value: pendingCount, icon: 'pending' },
  ]

  return (
    <div className="dashboard-page">
      <div className="dashboard-page-content">
        <DashboardStories />
        <header className="dashboard-page-header">
          <h1 className="dashboard-page-title">Dashboard</h1>
          <p className="dashboard-page-subtitle">Overview and quick actions</p>
        </header>
        <section className="dashboard-stats" aria-label="Key metrics">
          {stats.map(({ label, value, icon }, i) => (
              <div
                key={label}
                className={`dashboard-stat-card${icon === 'online' ? ' dashboard-stat-card--interactive' : ''}`}
                style={{ animationDelay: `${i * 60}ms` }}
                role={icon === 'online' ? 'button' : undefined}
                tabIndex={icon === 'online' ? 0 : undefined}
                onClick={icon === 'online' ? handleOnlineNowClick : undefined}
                onKeyDown={
                  icon === 'online'
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          void handleOnlineNowClick()
                        }
                      }
                    : undefined
                }
                aria-label={icon === 'online' ? 'Open online employees list' : undefined}
              >
                <span className="dashboard-stat-value">
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </span>
                <span className="dashboard-stat-label">{label}</span>
                <span className="dashboard-stat-icon" aria-hidden data-icon={icon}>
                  {icon === 'users' && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  )}
                  {icon === 'apps' && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>
                  )}
                  {icon === 'online' && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" fill="currentColor" /></svg>
                  )}
                  {icon === 'pending' && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  )}
                </span>
              </div>
          ))}
        </section>

        <div className="dashboard-graphs">
          <section className="dashboard-graph-card" aria-label="Activity over time">
            <h2 className="dashboard-graph-title">ACTIVITY LOGS</h2>
            <p className="dashboard-graph-desc">Graph of your online activities</p>
            <div className="dashboard-graph-wrap">
              {!hasActivitySeries ? (
                <div className="dashboard-graph-empty">No activity trend data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={300} debounce={200}>
                  <LineChart data={activityData} margin={{ top: 12, right: 16, left: 0, bottom: 32 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={{ stroke: chart.axisLine }} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={false} tickLine={false} width={32} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      contentStyle={{ ...chart.tooltip }}
                      labelStyle={chart.tooltipLabel}
                      itemStyle={{ fontSize: 12, padding: '2px 0', color: chart.legendColor }}
                      cursor={{ stroke: chart.axisLine, strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="users" name="Users added" stroke={chart.lineUsers} strokeWidth={2.5} dot={{ fill: chart.lineUsers, r: 4, strokeWidth: 2, stroke: chart.dotStroke }} activeDot={{ r: 6, strokeWidth: 2, stroke: chart.dotStroke, fill: chart.lineUsers }} animationDuration={600} animationEasing="ease-out" />
                    <Line yAxisId="right" type="monotone" dataKey="applications" name="Apps added" stroke={chart.lineApps} strokeWidth={2.5} dot={{ fill: chart.lineApps, r: 4, strokeWidth: 2, stroke: chart.dotStroke }} activeDot={{ r: 6, strokeWidth: 2, stroke: chart.dotStroke, fill: chart.lineApps }} animationDuration={600} animationEasing="ease-out" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          <section className="dashboard-graph-card" aria-label="Portal applications by visibility">
            <h2 className="dashboard-graph-title">ONLINE APPLICATIONS</h2>
            <p className="dashboard-graph-desc">
            Performance chart of leading applications.
            </p>
            <div className="dashboard-graph-wrap">
              {apps.length === 0 ? (
                <div className="dashboard-graph-empty">No portal applications loaded yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={300} debounce={200}>
                  <PieChart margin={{ bottom: 24 }}>
                    <Pie
                      data={appsAudienceData}
                      cx="50%"
                      cy="45%"
                      innerRadius={56}
                      outerRadius={88}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      animationDuration={600}
                      animationEasing="ease-out"
                      cornerRadius={4}
                    >
                      {appsAudienceData.map((entry, index) => (
                        <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} stroke={chart.dotStroke} strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ ...chart.tooltip, padding: '10px 14px' }} />
                    <Legend
                      layout="horizontal"
                      align="center"
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: 12, paddingTop: 16, marginBottom: 0, color: chart.legendColor }}
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => (
                        <span style={{ color: chart.legendColor, fontWeight: 500, marginLeft: 2 }}>{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <div className="dashboard-graphs-row">
            <section className="dashboard-graph-card" aria-label="Applications per month">
              <h2 className="dashboard-graph-title">Applications per month</h2>
              <p className="dashboard-graph-desc">Applications added per month (activity log).</p>
              <div className="dashboard-graph-wrap">
                {!hasMonthlyApps ? (
                  <div className="dashboard-graph-empty">No app additions recorded yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%" debounce={200}>
                    <BarChart data={monthlyAppsData} margin={{ top: 16, right: 16, left: 8, bottom: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={{ stroke: chart.axisLine }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip
                        contentStyle={{ ...chart.tooltip }}
                        cursor={{ fill: chart.barCursor }}
                      />
                      <Bar dataKey="count" name="Applications" fill={chart.barPrimary} radius={[4, 4, 0, 0]} animationDuration={500} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
            <section className="dashboard-graph-card" aria-label="User growth">
              <h2 className="dashboard-graph-title">User growth</h2>
              <p className="dashboard-graph-desc">Cumulative users; aligns with current headcount and logged user additions.</p>
              <div className="dashboard-graph-wrap">
                {!hasGrowthSeries ? (
                  <div className="dashboard-graph-empty">No user-growth data available yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%" debounce={200}>
                    <AreaChart data={growthData} margin={{ top: 16, right: 16, left: 8, bottom: 32 }}>
                      <defs>
                        <linearGradient id="growthGradientBottom" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chart.growthFillTop} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={chart.growthFillTop} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={{ stroke: chart.axisLine }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip
                        contentStyle={{ ...chart.tooltip }}
                        cursor={{ stroke: chart.axisLine, strokeDasharray: '4 4' }}
                      />
                      <Area type="monotone" dataKey="total" name="Total users" stroke={chart.growthStroke} strokeWidth={2} fill="url(#growthGradientBottom)" animationDuration={500} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
            <section className="dashboard-graph-card" aria-label="Weekly activity">
              <h2 className="dashboard-graph-title">Weekly activity</h2>
              <p className="dashboard-graph-desc">Last 7 days: sign-ins vs other actions (page views excluded).</p>
              <div className="dashboard-graph-wrap">
                {!hasWeeklyActivity ? (
                  <div className="dashboard-graph-empty">No weekly activity yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%" debounce={200}>
                    <BarChart data={weeklyActivityData} margin={{ top: 16, right: 16, left: 8, bottom: 32 }} barGap={8} barCategoryGap="12%">
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={{ stroke: chart.axisLine }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip
                        contentStyle={{ ...chart.tooltip }}
                        cursor={{ fill: chart.weeklyCursor }}
                      />
                      <Bar dataKey="logins" name="Logins" fill={chart.weeklyLogins} radius={[4, 4, 0, 0]} animationDuration={500} />
                      <Bar dataKey="actions" name="Actions" fill={chart.weeklyActions} radius={[4, 4, 0, 0]} animationDuration={500} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>
        </div>
        <ActiveAnnouncementsCard />
      </div>
      {isOnlineModalOpen && (
        <div
          className="confirm-dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="online-employees-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsOnlineModalOpen(false)
          }}
        >
          <div className="confirm-dialog-box online-employees-modal">
            <div className="online-employees-modal-header">
              <h2 id="online-employees-title" className="confirm-dialog-title">
                Online employees
              </h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Close online employees list"
                onClick={() => setIsOnlineModalOpen(false)}
              >
                x
              </button>
            </div>
            {isLoadingActiveEmployees ? (
              <p className="confirm-dialog-message">Loading active sessions...</p>
            ) : activeEmployeesError ? (
              <p className="confirm-dialog-message">{activeEmployeesError}</p>
            ) : activeEmployees.length === 0 ? (
              <p className="confirm-dialog-message">No active employees found.</p>
            ) : (
              <ul className="online-employees-list">
                {activeEmployees.map((employee, index) => {
                  const middle = employee.Emp_mname?.trim()
                  const fullName = [employee.Emp_fname, middle, employee.Emp_lname].filter(Boolean).join(' ')
                  return <li key={`${fullName}-${index}`}>{fullName}</li>
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
