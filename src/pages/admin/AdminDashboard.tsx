import { useEffect, useMemo, useState } from 'react'
import {
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
import { apiRequest } from '../../api/client'
import { fetchAllActiveEmployees, forceLogoutSession, type ActiveEmployeeResponse } from '../../api/session'
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
      barPrimary: isDark ? '#3b82f6' : 'var(--aa-blue)',
      lineUsers: isDark ? '#6eb0ff' : 'var(--aa-blue)',
      lineApps: isDark ? '#ffb74d' : 'var(--aa-cyan)',
    }
  }, [theme])
}

export default function AdminDashboard() {
  const chart = useChartPalette()
  const { pendingCount } = useApprovals()
  const { totalCount: totalUsers } = useEmployees()
  const { apps } = useApplications()

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await apiRequest<any[]>('/project/get/projects')
        setProjects(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error('Failed to fetch projects:', err)
      }
    }
    void fetchProjects()
  }, [])

  const [projects, setProjects] = useState<any[]>([])
  const [activeEmployees, setActiveEmployees] = useState<ActiveEmployeeResponse[]>([])
  const [isOnlineModalOpen, setIsOnlineModalOpen] = useState(false)
  const [isLoadingActiveEmployees, setIsLoadingActiveEmployees] = useState(false)
  const [activeEmployeesError, setActiveEmployeesError] = useState<string | null>(null)
  const [offlineSubmittingSessionId, setOfflineSubmittingSessionId] = useState<string | null>(null)
  const [serverStats, setServerStats] = useState<{ origins: Record<string, number>, timeline: Record<string, number> } | null>(null)

  const projectsByAppData = useMemo(() => {
    const counts: Record<string, number> = {
      QUOTATION: 0,
      BOQ: 0,
      ESTIMATION: 0,
      TECHNCODE: 0,
      RDIS: 0
    }
    projects.forEach(p => {
      if (p.application && counts[p.application] !== undefined) {
        counts[p.application]++
      }
    })
    return Object.entries(counts).map(([name, count]) => ({ name, count }))
  }, [projects])

  const MAINTENANCE_APPS = useMemo(() => ['CRM', 'BOQ', 'KPI', 'Estimation App', 'ATO App'], [])

  const serverOriginsData = useMemo(() => {
    if (!serverStats?.origins) return []
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']
    return Object.entries(serverStats.origins)
      .filter(([name]) => !MAINTENANCE_APPS.includes(name))
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name,
        value,
        color: colors[i % colors.length]
      }))
  }, [serverStats, MAINTENANCE_APPS])

  const serverStatsSummary = useMemo(() => {
    if (!serverStats?.origins) return []
    const total = Object.values(serverStats.origins).reduce((a, b) => a + b, 0)

    const active = Object.entries(serverStats.origins).map(([name, count]) => ({
      name,
      count,
      percent: total > 0 ? (count / total) * 100 : 0,
      status: MAINTENANCE_APPS.includes(name) ? 'Maintenance' : 'Active'
    }))

    const maintenance = MAINTENANCE_APPS
      .filter(name => !serverStats.origins[name])
      .map(name => ({
        name,
        count: 0,
        percent: 0,
        status: 'Maintenance'
      }))

    return [...active, ...maintenance].sort((a, b) => b.count - a.count)
  }, [serverStats, MAINTENANCE_APPS])

  const serverTimelineData = useMemo(() => {
    if (!serverStats?.timeline) return []
    return Object.entries(serverStats.timeline)
      .map(([time, count]) => ({
        time: time.split(':').slice(1).join(':'), // Show MM:SS
        count
      }))
  }, [serverStats])

  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  const resolveSessionId = (employee: ActiveEmployeeResponse): string | null => {
    const root = asRecord(employee)
    const sessionObj = asRecord(root.Session)
    const accountObj = asRecord(root.Account)
    const candidate =
      employee.s_ID ??
      employee.sessionId ??
      employee.sessionID ??
      employee.acc_sessionID ??
      root.s_ID ??
      root.s_id ??
      root.sessionId ??
      root.sessionID ??
      root.acc_sessionID ??
      sessionObj.s_ID ??
      sessionObj.s_id ??
      sessionObj.sessionId ??
      sessionObj.sessionID ??
      accountObj.acc_sessionID
    if (candidate == null) return null
    const out = String(candidate).trim()
    return out ? out : null
  }

  const resolveEmployeeFullName = (employee: ActiveEmployeeResponse): string => {
    const root = asRecord(employee)
    const nestedEmployee = asRecord(root.Employee)
    const first = String(employee.Emp_fname ?? nestedEmployee.Emp_fname ?? '').trim()
    const middle = String(employee.Emp_mname ?? nestedEmployee.Emp_mname ?? '').trim()
    const last = String(employee.Emp_lname ?? nestedEmployee.Emp_lname ?? '').trim()
    return [first, middle, last].filter(Boolean).join(' ') || 'Unknown employee'
  }

  const resolveEmployeePhotoUrl = (employee: ActiveEmployeeResponse): string | null => {
    const root = asRecord(employee)
    const nestedEmployee = asRecord(root.Employee)
    const raw = employee.photoUrl ?? employee.photo ?? nestedEmployee.photoUrl ?? nestedEmployee.photo
    if (!raw) return null
    const s = String(raw).trim()
    return s ? s : null
  }

  const loadActiveEmployees = async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setIsLoadingActiveEmployees(true)
      setActiveEmployeesError(null)
    }
    try {
      const data = await fetchAllActiveEmployees()
      setActiveEmployees(Array.isArray(data) ? data : [])
      if (!options?.quiet) setActiveEmployeesError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load active employees.'
      if (!options?.quiet) setActiveEmployeesError(message)
      if (!options?.quiet) setActiveEmployees([])
    } finally {
      if (!options?.quiet) setIsLoadingActiveEmployees(false)
    }
  }

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

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await apiRequest<{ origins: Record<string, number>, timeline: Record<string, number> }>('/api/server-stats')
        setServerStats(data)
      } catch (err) {
        // Silently fail for dashboard stats
      }
    }
    void fetchStats()
    void loadActiveEmployees()
    const timer = window.setInterval(() => {
      void loadActiveEmployees({ quiet: true })
      void fetchStats()
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [])

  const handleOnlineNowClick = async () => {
    setIsOnlineModalOpen(true)
    await loadActiveEmployees()
  }

  const handleMarkEmployeeOffline = async (employee: ActiveEmployeeResponse) => {
    const sessionId = resolveSessionId(employee)
    if (!sessionId) {
      setActiveEmployeesError('Cannot logout this row: backend response is missing session s_ID.')
      return
    }
    setOfflineSubmittingSessionId(sessionId)
    setActiveEmployeesError(null)
    try {
      await forceLogoutSession(sessionId, 'Offline')
      await loadActiveEmployees()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to mark employee offline.'
      setActiveEmployeesError(message)
    } finally {
      setOfflineSubmittingSessionId(null)
    }
  }

  const stats: Array<{ label: string; value: number | string; icon: string }> = [
    { label: 'Total users', value: totalUsers, icon: 'users' },
    { label: 'Applications', value: apps.length, icon: 'apps' },
    { label: 'Online now', value: activeEmployees.length, icon: 'online' },
    { label: 'Pending approval', value: pendingCount, icon: 'pending' },
  ]

  return (
    <div className="dashboard-page">
      <div className="dashboard-page-content">
        <DashboardStories />
        <header className="dashboard-page-header">
          <h1 className="dashboard-page-title">Dashboard</h1>
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
          <section className="dashboard-graph-card" aria-label="Projects by application">
            <h2 className="dashboard-graph-title">PROJECT LOGS</h2>
            <p className="dashboard-graph-desc">Distribution of projects across applications.</p>
            <div className="dashboard-graph-wrap">
              {projects.length === 0 ? (
                <div className="dashboard-graph-empty">No projects found.</div>
              ) : (
                <ResponsiveContainer width="100%" height={300} debounce={200}>
                  <BarChart data={projectsByAppData} margin={{ top: 12, right: 16, left: 0, bottom: 32 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: chart.axis, fontWeight: 500 }}
                      axisLine={{ stroke: chart.axisLine }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{ ...chart.tooltip }}
                      cursor={{ fill: chart.barCursor }}
                    />
                    <Bar
                      dataKey="count"
                      name="Projects"
                      fill={chart.barPrimary}
                      radius={[4, 4, 0, 0]}
                      animationDuration={600}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          <section className="dashboard-graph-card" aria-label="Live application traffic stats">
            <h2 className="dashboard-graph-title">ONLINE APPLICATIONS</h2>
            <p className="dashboard-graph-desc">
              Real-time request distribution by application.
            </p>
            <div className="dashboard-graph-wrap">
              {serverOriginsData.length === 0 ? (
                <div className="dashboard-graph-empty">No traffic detected yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={300} debounce={200}>
                  <PieChart margin={{ bottom: 24 }}>
                    <Pie
                      data={serverOriginsData}
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
                      {serverOriginsData.map((entry, index) => (
                        <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} stroke={chart.dotStroke} strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ ...chart.tooltip, padding: '10px 14px' }}
                      itemStyle={{ color: chart.legendColor }}
                    />
                    <Legend
                      layout="horizontal"
                      align="center"
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: 11, paddingTop: 16, color: chart.legendColor }}
                      iconType="circle"
                      iconSize={6}
                      formatter={(value: string) => (
                        <span style={{ color: chart.legendColor, fontWeight: 500, marginLeft: 2 }}>{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="dashboard-graph-card dashboard-graph-card--full" aria-label="Server request timeline">
            <h2 className="dashboard-graph-title">LIVE TRAFFIC</h2>
            <p className="dashboard-graph-desc">Total server requests per second (last 60s).</p>
            <div className="dashboard-graph-wrap">
              {serverTimelineData.length === 0 ? (
                <div className="dashboard-graph-empty">Waiting for live data...</div>
              ) : (
                <ResponsiveContainer width="100%" height={300} debounce={200}>
                  <AreaChart data={serverTimelineData} margin={{ top: 12, right: 16, left: 0, bottom: 20 }}>
                    <defs>
                      <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chart.lineUsers} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={chart.lineUsers} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: chart.axis }}
                      axisLine={{ stroke: chart.axisLine }}
                      tickLine={false}
                      interval={9}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: chart.axis }}
                      axisLine={false}
                      tickLine={false}
                      width={24}
                    />
                    <Tooltip
                      contentStyle={{ ...chart.tooltip }}
                      labelStyle={chart.tooltipLabel}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Requests"
                      stroke={chart.lineUsers}
                      strokeWidth={2}
                      fill="url(#trafficGradient)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>



          <section className="dashboard-graph-card dashboard-graph-card--full mt-6" aria-label="Live traffic breakdown table">
            <h2 className="dashboard-graph-title">LIVE TRAFFIC BREAKDOWN</h2>
            <p className="dashboard-graph-desc">Detailed request share and status by application.</p>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider">Application</th>
                    <th className="py-3 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider">Requests</th>
                    <th className="py-3 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider">Share</th>
                    <th className="py-3 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {serverStatsSummary.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-400 italic">Waiting for traffic data...</td>
                    </tr>
                  ) : (
                    serverStatsSummary.map((app) => (
                      <tr key={app.name} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className={`font-semibold ${app.status === 'Maintenance' ? 'text-slate-400 line-through opacity-60' : 'text-[var(--aa-blue)] dark:text-blue-400'}`}>
                            {app.name}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs">
                          {app.count > 0 ? app.count.toLocaleString() : '-'}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium w-9">{app.percent.toFixed(1)}%</span>
                            <div className="flex-1 max-w-[100px] h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-500 ${app.status === 'Maintenance' ? 'bg-slate-300' : 'bg-blue-500'}`}
                                style={{ width: `${app.percent}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${app.status === 'Maintenance' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`} />
                            <span className={`text-[10px] font-bold uppercase tracking-tight ${app.status === 'Maintenance' ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {app.status === 'Maintenance' ? 'Under Maintenance' : 'Active'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
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
                    const fullName = resolveEmployeeFullName(employee)
                    const photoUrl = resolveEmployeePhotoUrl(employee)
                    const sessionId = resolveSessionId(employee)
                    const disabled = !sessionId || offlineSubmittingSessionId === sessionId
                    return (
                      <li key={`${fullName}-${sessionId ?? index}`} className="online-employees-list-item">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-shrink-0 shadow-sm">
                            {photoUrl ? (
                              <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 uppercase">
                                {fullName.charAt(0)}
                              </div>
                            )}
                          </div>
                          <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{fullName}</span>
                        </div>
                        <button
                          type="button"
                          className="employees-btn employees-btn-secondary !py-1.5 !px-3 !text-[11px] font-bold"
                          onClick={() => void handleMarkEmployeeOffline(employee)}
                          disabled={disabled}
                          aria-label={`Set ${fullName} offline`}
                        >
                          Offline
                        </button>
                      </li>
                    )
                  })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
