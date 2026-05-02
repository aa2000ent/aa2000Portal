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
import ActiveAnnouncementsCard from '../../components/ActiveAnnouncementsCard'
import DashboardStories from '../../components/DashboardStories'

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

type KeywordRule = { label: string; re: RegExp }

const ROLE_ACTIVITY_RULES: Record<string, KeywordRule[]> = {
  sale: [
    { label: 'Lead Flow', re: /lead|prospect|client|customer/i },
    { label: 'Deals & Quotes', re: /deal|quote|proposal|contract/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  purchasing: [
    { label: 'Requests', re: /request|requisition|pr\b/i },
    { label: 'Orders', re: /order|po\b|purchase/i },
    { label: 'Vendors', re: /vendor|supplier|delivery/i },
  ],
  customer: [
    { label: 'Tickets & Support', re: /ticket|support|service|issue/i },
    { label: 'Client Actions', re: /client|customer|follow.?up/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  supplier: [
    { label: 'Supplier Ops', re: /supplier|vendor|delivery|shipment/i },
    { label: 'Orders', re: /order|purchase|request/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  operations: [
    { label: 'Workflow', re: /workflow|process|task|operation/i },
    { label: 'Approvals', re: /approve|reject|review/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  accounting: [
    { label: 'Ledger & Journal', re: /ledger|journal|recon|book/i },
    { label: 'Invoices & Payments', re: /invoice|payment|billing|collection/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  financial: [
    { label: 'Planning & Budget', re: /budget|forecast|plan|allocation/i },
    { label: 'Review & Approvals', re: /review|approve|reject|audit/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  technical: [
    { label: 'Support & Issues', re: /support|issue|incident|bug|ticket/i },
    { label: 'Deploy & Systems', re: /deploy|system|infra|technical|it/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  engineering: [
    { label: 'Build & Dev', re: /dev|engineer|build|feature|code/i },
    { label: 'Issues & Fixes', re: /issue|bug|fix|support/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  finance: [
    { label: 'Payments & Cashflow', re: /payment|cash|disburse|collection/i },
    { label: 'Budget & Reviews', re: /budget|review|approve|reject/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  marketing: [
    { label: 'Campaigns', re: /campaign|promo|ads|branding/i },
    { label: 'Leads & Content', re: /lead|content|social|media/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  ceo: [
    { label: 'Executive Reviews', re: /review|approve|reject|executive/i },
    { label: 'Strategy & Planning', re: /strategy|planning|growth|kpi|dashboard/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
  'co-ceo': [
    { label: 'Executive Ops', re: /operation|executive|review|approve|reject/i },
    { label: 'Coordination', re: /coordination|workflow|task|planning/i },
    { label: 'Launches', re: /app_launched|launch/i },
  ],
}

const ROLE_APP_RULES: Record<string, KeywordRule[]> = {
  sale: [
    { label: 'CRM / Leads', re: /crm|lead|sales|pipeline|client|customer/i },
    { label: 'Proposals', re: /quote|proposal|contract/i },
    { label: 'General', re: /.*/i },
  ],
  purchasing: [
    { label: 'Procurement', re: /purchase|procure|po|order|request/i },
    { label: 'Supplier Mgmt', re: /supplier|vendor|delivery|inventory/i },
    { label: 'General', re: /.*/i },
  ],
  customer: [
    { label: 'Support', re: /support|ticket|service|helpdesk/i },
    { label: 'Client Ops', re: /client|customer|feedback|chat/i },
    { label: 'General', re: /.*/i },
  ],
  supplier: [
    { label: 'Supplier Ops', re: /supplier|vendor|delivery|shipment/i },
    { label: 'Orders', re: /order|purchase|request/i },
    { label: 'General', re: /.*/i },
  ],
  operations: [
    { label: 'Workflow', re: /workflow|process|operations|task/i },
    { label: 'Coordination', re: /approval|tracking|monitor|status/i },
    { label: 'General', re: /.*/i },
  ],
  accounting: [
    { label: 'Accounting Core', re: /account|ledger|journal|recon|book/i },
    { label: 'Billing', re: /invoice|payment|billing|tax/i },
    { label: 'General', re: /.*/i },
  ],
  financial: [
    { label: 'Planning', re: /budget|forecast|planning|finance/i },
    { label: 'Controls', re: /audit|review|risk|approve/i },
    { label: 'General', re: /.*/i },
  ],
  technical: [
    { label: 'IT Tools', re: /technical|it|support|system|infra/i },
    { label: 'Issue Mgmt', re: /issue|incident|ticket|monitor/i },
    { label: 'General', re: /.*/i },
  ],
  engineering: [
    { label: 'Engineering', re: /engineering|dev|build|deploy|code/i },
    { label: 'Quality', re: /test|quality|issue|bug/i },
    { label: 'General', re: /.*/i },
  ],
  finance: [
    { label: 'Finance Ops', re: /finance|payment|cash|budget|treasury/i },
    { label: 'Approvals', re: /approve|review|controls|audit/i },
    { label: 'General', re: /.*/i },
  ],
  marketing: [
    { label: 'Campaign', re: /campaign|ads|promo|branding/i },
    { label: 'Content / Leads', re: /content|social|lead|crm|analytics/i },
    { label: 'General', re: /.*/i },
  ],
  ceo: [
    { label: 'Executive', re: /executive|board|strategy|kpi|dashboard/i },
    { label: 'Cross-functional', re: /operations|finance|marketing|engineering/i },
    { label: 'General', re: /.*/i },
  ],
  'co-ceo': [
    { label: 'Executive Ops', re: /executive|operations|workflow|dashboard/i },
    { label: 'Cross-functional', re: /finance|marketing|engineering|sales/i },
    { label: 'General', re: /.*/i },
  ],
}

function buildRoleBuckets(list: string[], rules: KeywordRule[]): { name: string; value: number }[] {
  const counts = rules.map((r) => ({ name: r.label, value: 0, re: r.re }))
  for (const text of list) {
    const t = text.toLowerCase()
    const found = counts.find((r) => r.re.test(t))
    if (found) found.value += 1
  }
  return counts
    .filter((r) => r.value > 0)
    .map(({ name, value }) => ({ name, value }))
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

  const roleActivityBreakdown = useMemo(() => {
    const rules = ROLE_ACTIVITY_RULES[segment] ?? [
      { label: 'Workflow Actions', re: /approve|reject|review|task|workflow/i },
      { label: 'Launches', re: /app_launched|launch/i },
      { label: 'Other', re: /.*/i },
    ]
    const source = recent.map((e) => `${e.action} ${e.details ?? ''} ${e.target}`)
    return buildRoleBuckets(source, rules)
  }, [recent, segment])

  const roleAppBreakdown = useMemo(() => {
    const rules = ROLE_APP_RULES[segment] ?? [
      { label: 'Role-specific', re: /dashboard|workflow|system/i },
      { label: 'General', re: /.*/i },
    ]
    const source = roleApps.map((a) => `${a.name} ${a.description} ${a.domain}`)
    return buildRoleBuckets(source, rules)
  }, [roleApps, segment])

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
      <div className="dashboard-page-content">
        <DashboardStories />
        <header className="dashboard-page-header">
          <h1 className="dashboard-page-title">{title}</h1>
          <p className="dashboard-page-subtitle">{subtitle}</p>
        </header>
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
            <span className="dashboard-stat-value">{roleActivityBreakdown.length}</span>
            <span className="dashboard-stat-label">Role activity groups</span>
          </div>
        </section>
        <div className="dashboard-graphs">
          <section className="dashboard-graph-card" aria-label={`${title} action breakdown`}>
            <h2 className="dashboard-graph-title">Role workflow activity</h2>
            <p className="dashboard-graph-desc">Recent actions grouped by {title.toLowerCase()} workflow categories.</p>
            <div className="dashboard-graph-wrap">
              {roleActivityBreakdown.length === 0 ? (
                <div className="dashboard-graph-empty">No tracked actions yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280} debounce={200}>
                  <BarChart data={roleActivityBreakdown} layout="vertical" margin={{ top: 8, right: 20, left: 24, bottom: 8 }}>
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
                      {roleActivityBreakdown.map((row, i) => (
                        <Cell key={`${row.name}-${i}`} fill={actionColors[i % actionColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          <section className="dashboard-graph-card" aria-label={`${title} app exposure`}>
            <h2 className="dashboard-graph-title">Role app mix</h2>
            <p className="dashboard-graph-desc">Assigned apps grouped by {title.toLowerCase()} use-cases.</p>
            <div className="dashboard-graph-wrap">
              {roleAppBreakdown.length === 0 ? (
                <div className="dashboard-graph-empty">No application visibility data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280} debounce={200}>
                  <PieChart>
                    <Pie
                      data={roleAppBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={86}
                      paddingAngle={3}
                    >
                      {roleAppBreakdown.map((slice, index) => (
                        <Cell key={slice.name} fill={actionColors[index % actionColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {roleAppBreakdown.length > 0 && (
                <div className="dashboard-graph-legend">
                  {roleAppBreakdown.map((slice, index) => (
                    <span key={slice.name} className="dashboard-legend-chip">
                      <i className="dashboard-legend-dot" style={{ background: actionColors[index % actionColors.length] }} aria-hidden />
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

