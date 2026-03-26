import { apiRequest, hasApiBase } from './client'
import { isConfiguredForExternalApi } from './config'
import type { App } from '../contexts/ApplicationsContext'

type ApplicationRow = {
  app_id?: number
  id?: number
  routes: string
  role: string
  version: string
  name?: string
  app_name?: string
}

function mapBackendApplication(row: ApplicationRow): App {
  const id = Number((row.app_id ?? row.id) ?? 0)
  const routes = String(row.routes ?? '').trim()
  const role = String(row.role ?? '').trim()
  const version = String(row.version ?? '').trim()
  const displayName = String((row.name ?? row.app_name) ?? '').trim()

  const name = displayName || routes || `App #${id || ''}`.trim()
  const description = version ? `Version ${version}` : ''
  const domain = routes

  return {
    id,
    name,
    description,
    domain,
    visibleTo: role ? [role] : [],
  }
}

function applicationToBackendPayload(app: Partial<App>, forUpdateId?: number): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (forUpdateId != null) out.app_id = forUpdateId
  if (app.name != null) out.name = app.name
  if (app.domain != null) out.routes = app.domain
  if (app.visibleTo && app.visibleTo[0]) out.role = app.visibleTo[0]
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
  role: string
  version: string
}

export async function createApplication(input: CreateApplicationInput): Promise<App | null> {
  const routes = input.routes.trim()
  const role = input.role.trim()
  const version = input.version.trim()
  if (!routes || !role || !version) return null
  const name = (input.name ?? '').trim()

  const createBody: Record<string, string> = { routes, role, version }
  if (name) createBody.name = name

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

  for (const path of paths) {
    try {
      const res = await apiRequest<unknown>(path, {
        method: 'POST',
        body: JSON.stringify(createBody),
      })
      if (res != null && typeof res === 'object' && !Array.isArray(res)) {
        const r = res as { data?: ApplicationRow } & ApplicationRow
        const row = (r.data ?? r) as ApplicationRow
        return mapBackendApplication(row)
      }
    } catch {
      // try next path
    }
  }
  return null
}

function fallbackApplicationFromUpdate(id: number, body: Record<string, unknown>): App {
  return mapBackendApplication({
    app_id: id,
    name: (body.name as string) ?? '',
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
  const body: Record<string, unknown> = {
    app_id: id,
    name: app.name ?? '',
    routes: app.domain ?? '',
    role: app.visibleTo && app.visibleTo[0] ? app.visibleTo[0] : '',
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

