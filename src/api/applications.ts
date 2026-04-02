import { apiRequest, hasApiBase } from './client'
import { isConfiguredForExternalApi } from './config'
import type { App } from '../contexts/ApplicationsContext'

type ApplicationRow = {
  app_id?: number
  id?: number
  routes: string
  role?: string
  /** Some APIs return an array of roles instead of a single `role` string. */
  roles?: unknown
  version: string
  /** DB column `application_name` (Express/Sequelize). */
  application_name?: string
  /** Legacy / alternate response keys */
  name?: string
  app_name?: string
  title?: string
  appName?: string
}

/**
 * DB column `application_name` is often NOT NULL. Always send a non-empty value:
 * explicit title → hostname from URL → fallback label.
 */
export function resolveApplicationNameForApi(title: string, routesOrDomain: string): string {
  const t = String(title ?? '').trim()
  if (t) return t.slice(0, 255)
  const raw = String(routesOrDomain ?? '').trim()
  const host = raw.replace(/^https?:\/\//i, '').split('/')[0]?.trim() ?? ''
  if (host) return host.slice(0, 255)
  return 'Application'
}

/** Compare routes/domain values from API vs form (ignore scheme, trailing slash, case). */
function normalizeRoutesKey(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .toLowerCase()
}

/** Pull created row from typical Express shapes: `{ data: row }`, `{ data: { data: row } }`, or flat row. */
function extractApplicationRowFromCreateResponse(res: unknown): ApplicationRow | null {
  if (res == null || typeof res !== 'object' || Array.isArray(res)) return null
  const top = res as Record<string, unknown>
  let cur: unknown = top.data ?? top
  for (let d = 0; d < 3 && cur != null && typeof cur === 'object' && !Array.isArray(cur); d += 1) {
    const o = cur as Record<string, unknown>
    const row = o as ApplicationRow
    if (row.routes != null && String(row.routes).trim()) return row
    if (row.app_id != null || (row as { id?: number }).id != null) return row
    if (o.data != null) cur = o.data
    else break
  }
  return null
}

/** Multiple admin checkboxes are stored in one DB field as JSON `["A","B"]` or comma-separated; single role stays plain text. */
export function serializeVisibleToForBackend(visibleTo: string[]): string {
  const list = (visibleTo ?? []).map((s) => String(s).trim()).filter(Boolean)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  return JSON.stringify(list)
}

function parseVisibleRolesFromBackend(row: ApplicationRow): string[] {
  const rawRoles = row.roles
  if (Array.isArray(rawRoles)) {
    return rawRoles.map((x) => String(x).trim()).filter(Boolean)
  }
  const role = String(row.role ?? '').trim()
  if (!role) return []
  if (role.startsWith('[')) {
    try {
      const parsed = JSON.parse(role) as unknown
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean)
    } catch {
      /* treat as literal */
    }
  }
  if (role.includes(',')) {
    return role
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return [role]
}

function mapBackendApplication(row: ApplicationRow): App {
  const id = Number((row.app_id ?? row.id) ?? 0)
  const routes = String(row.routes ?? '').trim()
  const version = String(row.version ?? '').trim()
  const displayName = String(
    row.application_name ?? row.name ?? row.app_name ?? row.title ?? row.appName ?? ''
  ).trim()

  // Card title: API `application_name` (DB column) → UI `App.name`. Never use app_id or routes as the title.
  const name = displayName || 'Unnamed application'
  const description = version ? `Version ${version}` : ''
  const domain = routes

  return {
    id,
    name,
    description,
    domain,
    visibleTo: parseVisibleRolesFromBackend(row),
  }
}

function applicationToBackendPayload(app: Partial<App>, forUpdateId?: number): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (forUpdateId != null) out.app_id = forUpdateId
  if (app.name != null || app.domain != null) {
    out.application_name = resolveApplicationNameForApi(String(app.name ?? ''), String(app.domain ?? ''))
  }
  if (app.domain != null) out.routes = app.domain
  if (app.visibleTo != null) {
    const ser = serializeVisibleToForBackend(app.visibleTo)
    if (ser) out.role = ser
  }
  if (app.description != null) {
    const v = app.description.replace(/^Version\s+/i, '').trim()
    out.version = v || app.description
  }
  return out
}

async function tryFetchAt(path: string): Promise<App[] | null> {
  try {
    const data = await apiRequest<unknown>(path)
    const list = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data
    if (!Array.isArray(list)) return []
    return list.map((row) => mapBackendApplication(row as ApplicationRow))
  } catch {
    return null
  }
}

export async function fetchApplications(): Promise<App[]> {
  const externalPaths = ['/application/all/applications', '/all/applications', '/applications']
  const localPaths = ['/api/applications']

  const paths = isConfiguredForExternalApi() ? externalPaths : localPaths

  for (const p of paths) {
    const apps = await tryFetchAt(p)
    if (apps) return apps
  }

  return []
}

export type CreateApplicationInput = {
  name?: string
  routes: string
  version: string
  /** Departments / roles that can see this app (matches admin checkboxes). */
  visibleTo: string[]
}

export async function createApplication(input: CreateApplicationInput): Promise<App | null> {
  const routes = input.routes.trim()
  const version = input.version.trim()
  const visible = input.visibleTo?.length ? input.visibleTo : ['Admin']
  const role = serializeVisibleToForBackend(visible)
  if (!routes || !role || !version) return null
  const name = (input.name ?? '').trim()
  const application_name = resolveApplicationNameForApi(name, routes)

  // Matches Sequelize `applications.application_name` only (no extra `name` key).
  const createBody: Record<string, string> = {
    routes,
    role,
    version,
    application_name,
  }

  const paths = isConfiguredForExternalApi()
    ? [
        '/application/add/application',
        '/application/add/applications',
        '/applications/add/application',
        '/applications/add/applications',
        '/add/application',
        '/add/applications',
      ]
    : ['/api/applications']

  const routeKey = normalizeRoutesKey(routes)

  for (const path of paths) {
    try {
      const res = await apiRequest<unknown>(path, {
        method: 'POST',
        body: JSON.stringify(createBody),
      })
      const row = extractApplicationRowFromCreateResponse(res)
      if (row && (String(row.routes ?? '').trim() || row.app_id != null || (row as { id?: number }).id != null)) {
        return mapBackendApplication(row)
      }
      // 201 success but minimal JSON — refresh list (API usually returns newest first).
      const list = await fetchApplications()
      const match = list.find((a) => normalizeRoutesKey(a.domain || '') === routeKey)
      if (match) return match
      if (list[0]) return list[0]
    } catch {
      // try next path
    }
  }
  return null
}

function fallbackApplicationFromUpdate(id: number, body: Record<string, unknown>): App {
  const appTitle = (body.application_name ?? body.name) as string
  return mapBackendApplication({
    app_id: id,
    application_name: appTitle ?? '',
    routes: (body.routes as string) ?? '',
    role: (body.role as string) ?? '',
    version: (body.version as string) ?? '',
  })
}

async function tryUpdateAtPath(
  path: string,
  body: Record<string, unknown>,
  id: number,
  method: 'PUT' | 'PATCH' = 'PUT',
): Promise<App | null> {
  try {
    const res = await apiRequest<unknown>(path, { method, body: JSON.stringify(body) })
    if (res != null && typeof res === 'object' && !Array.isArray(res)) {
      const r = res as { data?: ApplicationRow } & ApplicationRow
      const row = (r.data ?? r) as ApplicationRow
      const hasRow = row && (row.routes != null || row.app_id != null || (row as { id?: number }).id != null)
      if (hasRow) return mapBackendApplication({ ...row, app_id: row.app_id ?? (row as { id?: number }).id ?? id })
      return fallbackApplicationFromUpdate(id, body)
    }
    return fallbackApplicationFromUpdate(id, body)
  } catch {
    return null
  }
}

export async function updateApplication(
  id: number,
  app: Partial<App>,
): Promise<App | null> {
  const versionRaw = (app.description ?? '').replace(/^Version\s+/i, '').trim() || ''
  const visible = (app.visibleTo ?? []).map((s) => String(s).trim()).filter(Boolean)
  const titleForApi = resolveApplicationNameForApi(String(app.name ?? ''), String(app.domain ?? ''))
  const body: Record<string, unknown> = {
    app_id: id,
    application_name: titleForApi,
    routes: app.domain ?? '',
    role: serializeVisibleToForBackend(visible),
    version: versionRaw || (app.description ?? ''),
  }
  const backendPayload = applicationToBackendPayload(app, id)
  const paths: [string, Record<string, unknown>][] = [
    [`/application/update/application/${id}`, body],
    [`/applications/update/application/${id}`, body],
    [`/application/${id}`, backendPayload],
    [`/applications/${id}`, backendPayload],
    [`/update/application/${id}`, body],
    [`/applications/update/${id}`, body],
    [`/api/applications/${id}`, body],
  ]
  if (hasApiBase()) {
    for (const [path, payload] of paths) {
      let updated = await tryUpdateAtPath(path, payload, id, 'PUT')
      if (updated) return updated
      updated = await tryUpdateAtPath(path, payload, id, 'PATCH')
      if (updated) return updated
    }
  }
  return tryUpdateAtPath(`/api/applications/${id}`, body, id, 'PUT')
}

async function tryDeleteAt(path: string): Promise<boolean> {
  try {
    await apiRequest(path, { method: 'DELETE' })
    return true
  } catch {
    return false
  }
}

/**
 * Tries several DELETE URL shapes so deletes work across Express route variants
 * (e.g. /application/delete/..., /applications/:id, /api/... proxy).
 */
export async function deleteApplication(id: number): Promise<boolean> {
  const n = Number(id)
  if (!Number.isFinite(n) || n < 1) return false

  const paths = [
    `/application/delete/application/${n}`,
    `/applications/delete/application/${n}`,
    `/application/delete/applications/${n}`,
    `/applications/delete/applications/${n}`,
    `/delete/application/${n}`,
    `/delete/applications/${n}`,
    `/applications/delete/${n}`,
    `/application/delete/${n}`,
    `/applications/${n}`,
    `/application/${n}`,
    `/api/applications/${n}`,
  ]

  for (const path of paths) {
    if (await tryDeleteAt(path)) return true
  }
  return false
}

