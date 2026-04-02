import { useMemo } from 'react'
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
import { useTheme } from '../../contexts/ThemeContext'

function useChartPalette() {
  const { theme } = useTheme()
  return useMemo(() => {
    const isDark = theme === 'dark'
    return {
      grid: isDark ? '#334155' : '#e2e8f0',
      axis: isDark ? '#94a3b8' : '#64748b',
      axisLine: isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)',
      tooltip: isDark
        ? {
            background: 'rgba(30, 41, 59, 0.96)',
            border: '1px solid rgba(148, 163, 184, 0.28)',
            borderRadius: 10,
            fontSize: 12,
            padding: '12px 16px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          }
        : {
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            fontSize: 12,
            padding: '12px 16px',
            boxShadow: '0 8px 24px rgba(15,23,42,0.1)',
          },
      tooltipLabel: isDark
        ? ({ color: '#f1f5f9', fontWeight: 600, marginBottom: 8, fontSize: 13 } as const)
        : ({ color: '#0f172a', fontWeight: 600, marginBottom: 8, fontSize: 13 } as const),
      dotStroke: isDark ? '#1e293b' : '#ffffff',
      legendColor: isDark ? '#cbd5e1' : '#475569',
      barCursor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.18)',
      weeklyCursor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.06)',
    }
  }, [theme])
}

export default function AdminDashboard() {
  const chart = useChartPalette()
  const { pendingCount, approvedCount, rejectedCount } = useApprovals()
  const { totalCount: totalUsers } = useEmployees()
  const { apps } = useApplications()

  const stats: Array<{ label: string; value: number | string; icon: string }> = [
    { label: 'Total users', value: totalUsers, icon: 'users' },
    { label: 'Applications', value: apps.length, icon: 'apps' },
    { label: 'Online now', value: '—', icon: 'online' },
    { label: 'Pending approval', value: pendingCount, icon: 'pending' },
  ]

  const statusData = [
    { name: 'Approved', value: approvedCount, color: 'var(--aa-cyan)' },
    { name: 'Pending', value: pendingCount, color: 'var(--aa-blue)' },
    { name: 'Rejected', value: rejectedCount, color: 'var(--aa-blue-dark)' },
  ]

  const activityData: Array<{ month: string; users: number; applications: number }> = []
  const monthlyAppsData: Array<{ month: string; count: number }> = []
  const growthData: Array<{ month: string; total: number }> = []
  const weeklyActivityData: Array<{ day: string; logins: number; actions: number }> = []

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Dashboard</h1>
        <p className="dashboard-page-subtitle">Overview and quick actions</p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-stats" aria-label="Key metrics">
          {stats.map(({ label, value, icon }, i) => (
              <div
                key={label}
                className="dashboard-stat-card"
                style={{ animationDelay: `${i * 60}ms` }}
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
            <h2 className="dashboard-graph-title">Activity over time</h2>
            <p className="dashboard-graph-desc">Users and applications by month.</p>
            <div className="dashboard-graph-wrap">
              {activityData.length === 0 ? (
                <div className="dashboard-graph-empty">No analytics data available.</div>
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
                    <Line yAxisId="left" type="monotone" dataKey="users" name="Users" stroke="var(--aa-blue)" strokeWidth={2.5} dot={{ fill: 'var(--aa-blue)', r: 4, strokeWidth: 2, stroke: chart.dotStroke }} activeDot={{ r: 6, strokeWidth: 2, stroke: chart.dotStroke, fill: 'var(--aa-blue)' }} animationDuration={600} animationEasing="ease-out" />
                    <Line yAxisId="right" type="monotone" dataKey="applications" name="Applications" stroke="var(--aa-cyan)" strokeWidth={2.5} dot={{ fill: 'var(--aa-cyan)', r: 4, strokeWidth: 2, stroke: chart.dotStroke }} activeDot={{ r: 6, strokeWidth: 2, stroke: chart.dotStroke, fill: 'var(--aa-cyan)' }} animationDuration={600} animationEasing="ease-out" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          <section className="dashboard-graph-card" aria-label="Applications by status">
            <h2 className="dashboard-graph-title">Applications by status</h2>
            <p className="dashboard-graph-desc">Distribution of application statuses.</p>
            <div className="dashboard-graph-wrap">
              <ResponsiveContainer width="100%" height={300} debounce={200}>
                <PieChart margin={{ bottom: 24 }}>
                  <Pie
                    data={statusData}
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
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke={chart.dotStroke} strokeWidth={2} />
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
            </div>
          </section>

          <div className="dashboard-graphs-row">
            <section className="dashboard-graph-card" aria-label="Applications per month">
              <h2 className="dashboard-graph-title">Applications per month</h2>
              <p className="dashboard-graph-desc">New applications submitted.</p>
              <div className="dashboard-graph-wrap">
                {monthlyAppsData.length === 0 ? (
                  <div className="dashboard-graph-empty">No analytics data available.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260} debounce={200}>
                    <BarChart data={monthlyAppsData} margin={{ top: 16, right: 16, left: 8, bottom: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={{ stroke: chart.axisLine }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip
                        contentStyle={{ ...chart.tooltip }}
                        cursor={{ fill: chart.barCursor }}
                      />
                      <Bar dataKey="count" name="Applications" fill="var(--aa-blue)" radius={[4, 4, 0, 0]} animationDuration={500} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
            <section className="dashboard-graph-card" aria-label="User growth">
              <h2 className="dashboard-graph-title">User growth</h2>
              <p className="dashboard-graph-desc">Cumulative registered users.</p>
              <div className="dashboard-graph-wrap">
                {growthData.length === 0 ? (
                  <div className="dashboard-graph-empty">No analytics data available.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260} debounce={200}>
                    <AreaChart data={growthData} margin={{ top: 16, right: 16, left: 8, bottom: 32 }}>
                      <defs>
                        <linearGradient id="growthGradientBottom" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={{ stroke: chart.axisLine }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip
                        contentStyle={{ ...chart.tooltip }}
                        cursor={{ stroke: chart.axisLine, strokeDasharray: '4 4' }}
                      />
                      <Area type="monotone" dataKey="total" name="Total users" stroke="#10b981" strokeWidth={2} fill="url(#growthGradientBottom)" animationDuration={500} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
            <section className="dashboard-graph-card" aria-label="Weekly activity">
              <h2 className="dashboard-graph-title">Weekly activity</h2>
              <p className="dashboard-graph-desc">Logins and actions by day.</p>
              <div className="dashboard-graph-wrap">
                {weeklyActivityData.length === 0 ? (
                  <div className="dashboard-graph-empty">No analytics data available.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260} debounce={200}>
                    <BarChart data={weeklyActivityData} margin={{ top: 16, right: 16, left: 8, bottom: 32 }} barGap={8} barCategoryGap="12%">
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={{ stroke: chart.axisLine }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip
                        contentStyle={{ ...chart.tooltip }}
                        cursor={{ fill: chart.weeklyCursor }}
                      />
                      <Bar dataKey="logins" name="Logins" fill="#6366f1" radius={[4, 4, 0, 0]} animationDuration={500} />
                      <Bar dataKey="actions" name="Actions" fill="#f59e0b" radius={[4, 4, 0, 0]} animationDuration={500} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
