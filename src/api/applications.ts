import { apiRequest, hasApiBase } from './client'
import { isConfiguredForExternalApi } from './config'
import type { App } from '../contexts/ApplicationsContext'
import { forgetAppVisibility, rememberAppVisibility, reconcileVisibleWithLocalCache } from '../utils/appVisibilityLocal'

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

/** ASCII Record Separator — almost never appears in labels; yields the shortest lossless multi-value `role` string. */
const ROLE_LIST_SEP = '\u001e'

/**
 * Serializes selected departments for the legacy `role` DB column (string).
 * Uses {@link ROLE_LIST_SEP} between values to minimize length vs JSON and reduce VARCHAR truncation.
 * If a name contains the separator, falls back to comma or JSON.
 */
export function serializeVisibleToForBackend(visibleTo: string[]): string {
  const list = (visibleTo ?? []).map((s) => String(s).trim()).filter(Boolean)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  const hasSep = (s: string) => s.includes(ROLE_LIST_SEP)
  const hasComma = (s: string) => s.includes(',')
  const candidates: string[] = []
  if (!list.some(hasSep)) candidates.push(list.join(ROLE_LIST_SEP))
  if (!list.some(hasComma)) candidates.push(list.join(','))
  candidates.push(JSON.stringify(list))
  return candidates.reduce((a, b) => (a.length <= b.length ? a : b))
}

/**
 * Normalize role/department labels from API (JSON array string, comma list, or broken fragments).
 * Exported for UI that needs the same cleanup as list mapping.
 */
export function normalizeVisibleToLabels(parts: string[]): string[] {
  const raw = (parts ?? []).map((p) => String(p ?? '').trim()).filter(Boolean)
  if (raw.length === 0) return []

  const dedupe = (labels: string[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const l of labels) {
      const t = l.trim()
      if (!t) continue
      const k = t.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(t)
    }
    return out
  }

  const looseSplit = (s: string): string[] => {
    const t = s.trim()
    if (!t) return []
    const inner = t.replace(/^\[/, '').replace(/\]$/, '').trim()
    if (!inner) return []
    return inner
      .split(/","|,/)
      .map((p) => p.replace(/^\[+|"+$/g, '').replace(/^"+|"\]?$/g, '').replace(/\]+$/g, '').trim())
      .filter(Boolean)
  }

  const tryParseJsonArray = (s: string): string[] | null => {
    if (!s.startsWith('[')) return null
    try {
      const parsed = JSON.parse(s) as unknown
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean)
    } catch {
      /* fall through */
    }
    const loose = looseSplit(s)
    return loose.length ? loose : null
  }

  /**
   * Some backends return glued roles: MARKETING""ADMIN""CEO (not valid JSON).
   * Split on consecutive quotes; trim brackets / stray quotes per segment.
   */
  const splitDoubleQuoteGlue = (s: string): string[] => {
    if (!s.includes('""')) return []
    const parts = s
      .split('""')
      .map((p) =>
        p
          .replace(/^\[+/, '')
          .replace(/\]+$/, '')
          .replace(/^"+|"+$/g, '')
          .trim(),
      )
      .filter(Boolean)
    return parts.length > 1 ? parts : []
  }

  if (raw.length === 1) {
    const single = raw[0]
    if (single.includes(ROLE_LIST_SEP)) {
      return dedupe(
        single
          .split(ROLE_LIST_SEP)
          .map((s) => s.trim())
          .filter(Boolean),
      )
    }
    const json = tryParseJsonArray(single)
    if (json?.length) return dedupe(json)
    const glued = splitDoubleQuoteGlue(single)
    if (glued.length) return dedupe(glued)
    if (single.includes(',')) return dedupe(looseSplit(single))
    return dedupe([single])
  }

  // Multiple segments: do not join() then parse as one JSON/glue blob — the merged string can
  // accidentally start with `[` or match quote heuristics and return fewer labels than the inputs.
  return dedupe(raw.flatMap((s) => normalizeVisibleToLabels([s])))
}

/**
 * Whether the app lists the given department / role (case-insensitive, after {@link normalizeVisibleToLabels}).
 * Use for admin filters and anywhere visibility must match despite API casing differences.
 */
export function visibleToIncludesDepartment(visibleTo: string[] | undefined, department: string): boolean {
  const needle = String(department ?? '').trim().toLowerCase()
  if (!needle) return true
  return normalizeVisibleToLabels(visibleTo ?? []).some((l) => l.trim().toLowerCase() === needle)
}

/** Single cell from API: string, number, or `{ role_name, ... }`. */
function roleCellToLabel(x: unknown): string {
  if (x == null) return ''
  if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') return String(x).trim()
  if (typeof x === 'object' && !Array.isArray(x)) {
    const o = x as Record<string, unknown>
    const name = o.role_name ?? o.role_Name ?? o.name ?? o.r_name ?? o.label ?? o.title
    if (name != null && typeof name !== 'object') return String(name).trim()
  }
  return ''
}

/** Parse `roles` from API (array of strings/objects, JSON string, plain object map, or missing). */
function parseRolesColumnUnknown(raw: unknown): string[] {
  if (raw == null) return []

  if (Array.isArray(raw)) {
    const labels = raw.map(roleCellToLabel).filter(Boolean)
    return normalizeVisibleToLabels(labels)
  }

  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return []
    let parsed: unknown = t
    for (let i = 0; i < 3; i++) {
      if (typeof parsed !== 'string') break
      const s = parsed.trim()
      if (!s.startsWith('[') && !s.startsWith('{')) break
      try {
        parsed = JSON.parse(s) as unknown
      } catch {
        break
      }
    }
    if (Array.isArray(parsed)) {
      return normalizeVisibleToLabels(parsed.map(roleCellToLabel).filter(Boolean))
    }
    return normalizeVisibleToLabels([t])
  }

  if (typeof raw === 'object') {
    const vals = Object.values(raw as Record<string, unknown>)
    const labels = vals.map(roleCellToLabel).filter(Boolean)
    if (labels.length) return normalizeVisibleToLabels(labels)
  }

  return []
}

/**
 * Merge `roles` + legacy `role` so nothing is dropped when one column is truncated
 * or the API only fills one of them.
 */
function parseVisibleRolesFromBackend(row: ApplicationRow): string[] {
  const fromRoles = parseRolesColumnUnknown(row.roles)
  const roleStr = String(row.role ?? '').trim()
  const fromLegacy = roleStr ? normalizeVisibleToLabels([roleStr]) : []
  return normalizeVisibleToLabels([...fromRoles, ...fromLegacy])
}

function pickField(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k]
    if (v != null && v !== '') return v
  }
  return undefined
}

/** Normalize Sequelize / Express quirks: camelCase, nested `application`, alternate columns. */
function coerceApplicationRow(row: unknown): ApplicationRow {
  if (row == null || typeof row !== 'object' || Array.isArray(row)) {
    return { routes: '', version: '' } as ApplicationRow
  }
  const r = row as Record<string, unknown>
  const base = r as ApplicationRow
  let roleVal = pickField(r, ['role', 'Role', 'application_role', 'application_Role', 'r_role'])
  let rolesVal = pickField(r, ['roles', 'Roles', 'departments', 'Departments', 'visibleTo', 'visible_to'])

  const nested = r.application ?? r.Application
  if (nested != null && typeof nested === 'object' && !Array.isArray(nested)) {
    const a = nested as Record<string, unknown>
    if (roleVal == null) roleVal = pickField(a, ['role', 'Role'])
    if (rolesVal == null) rolesVal = pickField(a, ['roles', 'Roles', 'departments'])
  }

  return {
    ...base,
    role: roleVal != null ? String(roleVal as string | number | boolean) : base.role,
    roles: rolesVal ?? base.roles,
    routes: String(r.routes ?? base.routes ?? '').trim(),
    version: String(r.version ?? base.version ?? '').trim(),
  }
}

function mapBackendApplication(row: unknown): App {
  const coerced = coerceApplicationRow(row)
  const id = Number((coerced.app_id ?? coerced.id) ?? 0)
  const routes = String(coerced.routes ?? '').trim()
  const version = String(coerced.version ?? '').trim()
  const displayName = String(
    coerced.application_name ?? coerced.name ?? coerced.app_name ?? coerced.title ?? coerced.appName ?? ''
  ).trim()

  // Card title: API `application_name` (DB column) → UI `App.name`. Never use app_id or routes as the title.
  const name = displayName || 'Unnamed application'
  const description = version ? `Version ${version}` : ''
  const domain = routes

  const parsed = parseVisibleRolesFromBackend(coerced)
  const visibleTo = id > 0 ? reconcileVisibleWithLocalCache(id, parsed) : parsed

  return {
    id,
    name,
    description,
    domain,
    visibleTo,
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
    const list = app.visibleTo.map((s) => String(s).trim()).filter(Boolean)
    const ser = serializeVisibleToForBackend(app.visibleTo)
    if (ser) out.role = ser
    if (list.length) {
      out.roles = list
      out.visibleTo = list
      out.role_list = JSON.stringify(list)
    }
  }
  if (app.description != null) {
    const v = app.description.replace(/^Version\s+/i, '').trim()
    out.version = v || app.description
  }
  return out
}

async function tryFetchAt(path: string): Promise<App[] | null> {
  try {
    const data = await apiRequest<unknown>(path, { portal: { suppressFailureLog: true } })
    const list = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data
    if (!Array.isArray(list)) return null
    return list.map((row) => mapBackendApplication(row))
  } catch {
    return null
  }
}


export async function fetchApplications(): Promise<App[]> {
  const path = isConfiguredForExternalApi() ? '/application/all/applications' : '/api/applications'
  const apps = await tryFetchAt(path)
  return apps ?? []
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

  // `roles` array: many backends store JSON/array in a separate field; keeps full selection if `role` VARCHAR truncates.
  const createBody: Record<string, unknown> = {
    routes,
    role,
    roles: visible,
    role_list: JSON.stringify(visible),
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
        const mapped = mapBackendApplication(row)
        const v = normalizeVisibleToLabels(visible.map((x) => String(x)))
        if (v.length) rememberAppVisibility(mapped.id, v)
        else forgetAppVisibility(mapped.id)
        return mapped
      }
      // 201 success but minimal JSON — refresh list (API usually returns newest first).
      const list = await fetchApplications()
      const match = list.find((a) => normalizeRoutesKey(a.domain || '') === routeKey)
      if (match) {
        const v = normalizeVisibleToLabels(visible.map((x) => String(x)))
        if (v.length) rememberAppVisibility(match.id, v)
        else forgetAppVisibility(match.id)
        return match
      }
      if (list[0]) {
        const v = normalizeVisibleToLabels(visible.map((x) => String(x)))
        if (v.length) rememberAppVisibility(list[0].id, v)
        else forgetAppVisibility(list[0].id)
        return list[0]
      }
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
    roles: (body.roles ?? body.visibleTo) as unknown,
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
  const visibleNorm = normalizeVisibleToLabels((app.visibleTo ?? []).map((s) => String(s).trim()).filter(Boolean))
  const titleForApi = resolveApplicationNameForApi(String(app.name ?? ''), String(app.domain ?? ''))
  const ser = serializeVisibleToForBackend(visibleNorm)
  const body: Record<string, unknown> = {
    app_id: id,
    application_name: titleForApi,
    routes: app.domain ?? '',
    role: ser,
    roles: visibleNorm,
    role_list: JSON.stringify(visibleNorm),
    /** Some Express routes map this name to a JSON/array column. */
    visibleTo: visibleNorm,
    version: versionRaw || (app.description ?? ''),
  }
  const onVisiblePersisted = (result: App | null): App | null => {
    if (result) {
      if (visibleNorm.length) rememberAppVisibility(id, visibleNorm)
      else forgetAppVisibility(id)
    }
    return result
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
      if (updated) return onVisiblePersisted(updated)
      updated = await tryUpdateAtPath(path, payload, id, 'PATCH')
      if (updated) return onVisiblePersisted(updated)
    }
  }
  return onVisiblePersisted(await tryUpdateAtPath(`/api/applications/${id}`, body, id, 'PUT'))
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
    if (await tryDeleteAt(path)) {
      forgetAppVisibility(n)
      return true
    }
  }
  return false
}

