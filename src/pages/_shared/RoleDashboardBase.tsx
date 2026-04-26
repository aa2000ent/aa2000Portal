import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useActivityLog } from '../../contexts/ActivityLogContext'
import { useTheme } from '../../contexts/ThemeContext'
import ActiveAnnouncementsCard from '../../components/ActiveAnnouncementsCard'
import { getPortalAccountId } from '../../api/client'
import { fetchProjectsForDashboard, type ProjectItem } from '../../api/projects'

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
  activityFocusLabel: _activityFocusLabel,
  activityMatcher: _activityMatcher,
}: RoleDashboardBaseProps) {
  const { addEntry } = useActivityLog()
  const { theme } = useTheme()
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState<string | null>(null)

  useEffect(() => {
    addEntry({ action: 'page_visited', actor: title, target: `${title} dashboard`, details: `Viewed ${title} dashboard` })
  }, [addEntry, title])

  useEffect(() => {
    const employeeID = getPortalAccountId()
    if (!employeeID) {
      setProjects([])
      setProjectsLoading(false)
      setProjectsError('No employee session found. Please sign in again.')
      return
    }
    let cancelled = false
    void (async () => {
      setProjectsLoading(true)
      setProjectsError(null)
      try {
        const data = await fetchProjectsForDashboard(segment, employeeID)
        if (cancelled) return
        setProjects(data)
      } catch (e) {
        if (cancelled) return
        setProjects([])
        setProjectsError(e instanceof Error ? e.message : 'Failed to load projects.')
      } finally {
        if (!cancelled) setProjectsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [segment])

  const pipelineData = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of projects) {
      const status = String(p.status || 'UNKNOWN').toUpperCase()
      map.set(status, (map.get(status) ?? 0) + 1)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [projects])

  const completedProjects = useMemo(
    () => projects.filter((p) => /COMPLETED|DONE|CLOSED/i.test(String(p.status))).length,
    [projects]
  )
  const activeProjects = projects.length - completedProjects

  const projectActivitySeries = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of projects) {
      if (!/COMPLETED|DONE|CLOSED/i.test(String(p.status))) continue
      const raw = p.startDate
      const date = raw ? new Date(raw) : null
      if (!date || Number.isNaN(date.getTime())) continue
      const key = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }))
  }, [projects])

  const chartGrid = theme === 'dark' ? '#334155' : '#e2e8f0'
  const chartAxis = theme === 'dark' ? '#94a3b8' : '#64748b'
  const statusColors = ['#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#a855f7']
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
            <span className="dashboard-stat-value">{projects.length}</span>
            <span className="dashboard-stat-label">List of projects</span>
          </div>
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{activeProjects}</span>
            <span className="dashboard-stat-label">In pipeline</span>
          </div>
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{completedProjects}</span>
            <span className="dashboard-stat-label">Completed projects</span>
          </div>
        </section>
        <div className="dashboard-graphs">
          <section className="dashboard-graph-card" aria-label={`${title} projects`}>
            <h2 className="dashboard-graph-title">List of projects</h2>
            <p className="dashboard-graph-desc">Projects assigned to your account from the project API.</p>
            <div className="dashboard-graph-wrap">
              {projectsLoading ? (
                <div className="dashboard-graph-empty">Loading projects...</div>
              ) : projectsError ? (
                <div className="dashboard-graph-empty">{projectsError}</div>
              ) : projects.length === 0 ? (
                <div className="dashboard-graph-empty">No projects found for this account.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {projects.slice(0, 8).map((p) => (
                    <div key={`${p.id}-${p.name}`} className="rounded-lg border border-slate-200/25 p-3 bg-white/5">
                      <p className="text-sm font-semibold">{p.name || p.application || segment}</p>
                      <p className="text-xs text-slate-400 mt-1">{p.description || p.status}</p>
                      <span className="inline-flex mt-2 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[color-mix(in_srgb,var(--aa-blue)_20%,transparent)] text-[var(--aa-shell-text)]">
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
          <section className="dashboard-graph-card" aria-label={`${title} project pipeline`}>
            <h2 className="dashboard-graph-title">Project pipeline status</h2>
            <p className="dashboard-graph-desc">Status distribution of your current project list.</p>
            <div className="dashboard-graph-wrap">
              {pipelineData.length === 0 ? (
                <div className="dashboard-graph-empty">No pipeline status data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280} debounce={200}>
                  <BarChart data={pipelineData} margin={{ top: 8, right: 12, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: chartAxis, fontWeight: 500 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartAxis, fontWeight: 500 }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip contentStyle={chartTooltip} />
                    <Bar dataKey="value" name="Projects" radius={[6, 6, 0, 0]}>
                      {pipelineData.map((row, i) => (
                        <Cell key={`${row.name}-${i}`} fill={statusColors[i % statusColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          <section className="dashboard-graph-card" aria-label={`${title} project activity`}>
            <h2 className="dashboard-graph-title">Project activeness</h2>
            <p className="dashboard-graph-desc">Completed projects timeline grouped by Start_date.</p>
            <div className="dashboard-graph-wrap">
              {projectActivitySeries.length === 0 ? (
                <div className="dashboard-graph-empty">No project activity timeline available yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280} debounce={200}>
                  <LineChart data={projectActivitySeries} margin={{ top: 8, right: 12, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartAxis, fontWeight: 500 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartAxis, fontWeight: 500 }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip contentStyle={chartTooltip} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Project updates"
                      stroke="var(--aa-blue)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: 'var(--aa-blue)' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </div>
        <ActiveAnnouncementsCard />
      </div>
    </div>
  )
}

