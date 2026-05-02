import type { HistoryEntry } from '../contexts/ActivityLogContext'
import type { App } from '../contexts/ApplicationsContext'

/** Pie slices for portal apps grouped by visibility (no API status field on applications). */
const AUDIENCE_SLICE_COLORS: Record<string, string> = {
  Admin: 'var(--aa-blue)',
  Marketing: '#06b6d4',
  Finance: '#10b981',
  Engineering: '#8b5cf6',
  'General Manager': '#f59e0b',
  'Multiple roles': '#2563eb',
  'No audience set': '#94a3b8',
}

const AUDIENCE_FALLBACK_PALETTE = ['#3b82f6', '#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1']

export type PortalAppAudienceSlice = { name: string; value: number; color: string }

/**
 * Groups portal applications by who can see them: exactly one role, multiple roles, or none set.
 */
export function buildPortalAppsAudiencePie(apps: readonly App[]): PortalAppAudienceSlice[] {
  const counts = new Map<string, number>()

  for (const a of apps) {
    const v = [...new Set((a.visibleTo ?? []).map((x) => String(x).trim()).filter(Boolean))]
    let key: string
    if (v.length === 0) key = 'No audience set'
    else if (v.length === 1) key = v[0]
    else key = 'Multiple roles'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const sliceColor = (name: string, i: number): string => {
    if (AUDIENCE_SLICE_COLORS[name]) return AUDIENCE_SLICE_COLORS[name]
    const hit = Object.keys(AUDIENCE_SLICE_COLORS).find((k) => k.toLowerCase() === name.toLowerCase())
    if (hit) return AUDIENCE_SLICE_COLORS[hit]
    return AUDIENCE_FALLBACK_PALETTE[i % AUDIENCE_FALLBACK_PALETTE.length]
  }

  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return entries.map(([name, value], i) => ({
    name,
    value,
    color: sliceColor(name, i),
  }))
}

/** Activity log timestamps use `YYYY-MM-DD HH:mm` (see ActivityLogContext). */
export function parseActivityDate(ts: string): Date | null {
  const m = ts.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return new Date(y, mo - 1, d)
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthShortLabel(key: string): string {
  const y = Number(key.slice(0, 4))
  const m = Number(key.slice(5, 7))
  if (!Number.isFinite(y) || m < 1 || m > 12) return key
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short' })
}

function lastNCalendarMonthKeys(now: Date, n: number): string[] {
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(monthKey(x))
  }
  return keys
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export type AdminActivityMonthRow = { month: string; users: number; applications: number }
export type AdminMonthlyCountRow = { month: string; count: number }
export type AdminGrowthRow = { month: string; total: number }
export type AdminWeeklyRow = { day: string; logins: number; actions: number }

/**
 * Derives dashboard series from the browser activity log plus current headcount.
 * When no `user_added` events exist in the window, cumulative growth still ends at `totalUsers`.
 */
export function buildAdminDashboardSeries(
  entries: readonly HistoryEntry[],
  totalUsers: number,
  now: Date = new Date(),
): {
  activityData: AdminActivityMonthRow[]
  monthlyAppsData: AdminMonthlyCountRow[]
  growthData: AdminGrowthRow[]
  weeklyActivityData: AdminWeeklyRow[]
} {
  const monthKeys = lastNCalendarMonthKeys(now, 6)
  const usersPerMonth: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]))
  const appsPerMonth: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]))

  for (const e of entries) {
    const d = parseActivityDate(e.timestamp)
    if (!d) continue
    const key = monthKey(d)
    if (!(key in usersPerMonth)) continue
    if (e.action === 'user_added') usersPerMonth[key] += 1
    if (e.action === 'app_added') appsPerMonth[key] += 1
  }

  const activityData: AdminActivityMonthRow[] = monthKeys.map((k) => ({
    month: monthShortLabel(k),
    users: usersPerMonth[k],
    applications: appsPerMonth[k],
  }))

  const monthlyAppsData: AdminMonthlyCountRow[] = monthKeys.map((k) => ({
    month: monthShortLabel(k),
    count: appsPerMonth[k],
  }))

  const userAdds = monthKeys.map((k) => usersPerMonth[k])
  const sumAdds = userAdds.reduce((a, b) => a + b, 0)
  const prior = Math.max(0, totalUsers - sumAdds)
  let run = prior
  const growthData: AdminGrowthRow[] = monthKeys.map((k, i) => {
    run += userAdds[i]
    return { month: monthShortLabel(k), total: run }
  })

  const today = startOfLocalDay(now)
  const weeklyActivityData: AdminWeeklyRow[] = []
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today)
    day.setDate(today.getDate() - i)
    const label = day.toLocaleString(undefined, { weekday: 'short' })
    let logins = 0
    let actions = 0
    for (const e of entries) {
      const ed = parseActivityDate(e.timestamp)
      if (!ed) continue
      if (startOfLocalDay(ed).getTime() !== day.getTime()) continue
      if (e.action === 'sign_in') logins += 1
      else if (e.action !== 'page_visited') actions += 1
    }
    weeklyActivityData.push({ day: label, logins, actions })
  }

  return { activityData, monthlyAppsData, growthData, weeklyActivityData }
}
