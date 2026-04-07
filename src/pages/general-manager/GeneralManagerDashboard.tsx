import { useMemo, useEffect } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { useActivityLog } from '../../contexts/ActivityLogContext'
import { useApprovals } from '../../contexts/ApprovalsContext'
import { useEmployees } from '../../contexts/EmployeesContext'
import { useApplications } from '../../contexts/ApplicationsContext'
import { useRoles } from '../../contexts/RolesContext'
import { useTheme } from '../../contexts/ThemeContext'
import { roleNameToRoute } from '../../api/auth'

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
    }
  }, [theme])
}

export default function GeneralManagerDashboard() {
  const chart = useChartPalette()
  const { addEntry } = useActivityLog()
  const { pendingCount, approvedCount, rejectedCount } = useApprovals()
  const { totalCount: headcount } = useEmployees()
  const { apps } = useApplications()
  const { roleOptions, loading: rolesLoading } = useRoles()

  useEffect(() => {
    addEntry({
      action: 'page_visited',
      actor: 'General Manager',
      target: 'GM dashboard',
      details: 'Viewed General Manager dashboard',
    })
  }, [addEntry])

  const statusData = [
    { name: 'Approved', value: approvedCount, color: 'var(--aa-cyan)' },
    { name: 'Pending', value: pendingCount, color: 'var(--aa-blue)' },
    { name: 'Rejected', value: rejectedCount, color: 'var(--aa-blue-dark)' },
  ]

  const rolesByPortal = useMemo(() => {
    const m: Record<string, number> = {
      admin: 0,
      marketing: 0,
      finance: 0,
      engineering: 0,
      'general-manager': 0,
    }
    for (const r of roleOptions) {
      const seg = roleNameToRoute(r.role_name)
      if (seg in m) m[seg] += 1
      else m.admin += 1
    }
    return [
      { name: 'Admin', short: 'ADM', value: m.admin, fill: '#3b82f6' },
      { name: 'Marketing', short: 'MKT', value: m.marketing, fill: '#06b6d4' },
      { name: 'Finance', short: 'FIN', value: m.finance, fill: '#10b981' },
      { name: 'Engineering', short: 'ENG', value: m.engineering, fill: '#8b5cf6' },
      { name: 'GM / Exec', short: 'GM', value: m['general-manager'], fill: '#f59e0b' },
    ]
  }, [roleOptions])

  const stats: Array<{ label: string; value: number | string; icon: string }> = [
    { label: 'Headcount', value: headcount, icon: 'users' },
    { label: 'Portal apps', value: apps.length, icon: 'apps' },
    { label: 'Pending approvals', value: pendingCount, icon: 'pending' },
    { label: 'Role types', value: rolesLoading ? '…' : roleOptions.length, icon: 'roles' },
  ]

  return (
    <div className="dashboard-page dashboard-page--gm">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">General Manager</h1>
        <p className="dashboard-page-subtitle">
          Organization overview and approvals pipeline for your role
        </p>
      </header>

      <div className="dashboard-page-content">
        <section className="dashboard-stats" aria-label="Executive metrics">
          {stats.map(({ label, value, icon }, i) => (
            <div key={label} className="dashboard-stat-card" style={{ animationDelay: `${i * 50}ms` }}>
              <span className="dashboard-stat-value">
                {typeof value === 'number' ? value.toLocaleString() : value}
              </span>
              <span className="dashboard-stat-label">{label}</span>
              <span className="dashboard-stat-icon" aria-hidden data-icon={icon}>
                {icon === 'users' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                )}
                {icon === 'apps' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                )}
                {icon === 'pending' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                )}
                {icon === 'roles' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                )}
              </span>
            </div>
          ))}
        </section>

        <div className="dashboard-graphs gm-dashboard-graphs">
          <section className="dashboard-graph-card" aria-label="Approvals pipeline">
            <h2 className="dashboard-graph-title">Approvals pipeline</h2>
            <p className="dashboard-graph-desc">Signup and request decisions across the organization.</p>
            <div className="dashboard-graph-wrap">
              <ResponsiveContainer width="100%" height={280} debounce={200}>
                <PieChart margin={{ bottom: 24 }}>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="45%"
                    innerRadius={52}
                    outerRadius={86}
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

          <section className="dashboard-graph-card" aria-label="Roles by portal area">
            <h2 className="dashboard-graph-title">Roles by portal area</h2>
            <p className="dashboard-graph-desc">DB roles mapped to portal segments (same rules as login routing).</p>
            <div className="dashboard-graph-wrap">
              {roleOptions.length === 0 && !rolesLoading ? (
                <div className="dashboard-graph-empty">No roles loaded yet. Check API / roles endpoint.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280} debounce={200}>
                  <BarChart data={rolesByPortal} margin={{ top: 16, right: 16, left: 8, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis
                      dataKey="short"
                      tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }}
                      axisLine={{ stroke: chart.axisLine }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: chart.axis, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{ ...chart.tooltip }}
                      cursor={{ fill: chart.barCursor }}
                      formatter={(value: number | undefined) => [value ?? 0, 'Roles']}
                      labelFormatter={(label, payload) =>
                        payload?.[0] && typeof payload[0] === 'object' && 'payload' in payload[0]
                          ? (payload[0] as { payload: { name: string } }).payload.name
                          : String(label)
                      }
                    />
                    <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]} animationDuration={500}>
                      {rolesByPortal.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
