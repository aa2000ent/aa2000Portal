import { apiRequest } from './client'
import { isConfiguredForExternalApi } from './config'

export type RoleOption = {
  role_ID: number
  role_name: string
}

function is404Error(err: unknown): boolean {
  return err instanceof Error && err.message.includes('404')
}

function normalizeRole(row: Record<string, unknown>): RoleOption {
  const id = Number(row.role_ID ?? row.id ?? row.role_id ?? 0)
  const name = String(row.role_name ?? row.name ?? row.role_Name ?? row.r_name ?? row.r_Name ?? '').trim() || `Role ${id}`
  return { role_ID: id, role_name: name }
}

function extractRoleFromEmployee(row: Record<string, unknown>): RoleOption | null {
  const roleObj = row.Role ?? row.role
  if (roleObj == null || typeof roleObj !== 'object' || Array.isArray(roleObj)) return null
  const r = roleObj as Record<string, unknown>
  const role_ID = Number(r.role_ID ?? r.role_id ?? row.Emp_role ?? row.emp_role ?? r.id ?? 0)
  const role_name = String(r.r_name ?? r.r_Name ?? r.role_name ?? r.role_Name ?? r.name ?? '').trim() || `Role ${role_ID}`
  if (role_ID <= 0) return null
  return { role_ID, role_name }
}

function parseRoleList(data: unknown, useNormalize: boolean): RoleOption[] {
  const list = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data
  if (!Array.isArray(list)) return []

  if (useNormalize) {
    const out: RoleOption[] = []
    const seenNames = new Set<string>()
    let nextId = 1
    for (const item of list) {
      if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
      const r0 = normalizeRole(item as Record<string, unknown>)
      const name = r0.role_name.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seenNames.has(key)) continue
      seenNames.add(key)
      const role_ID = r0.role_ID > 0 ? r0.role_ID : nextId++
      out.push({ role_ID, role_name: name })
    }
    return out.sort((a, b) => a.role_ID - b.role_ID)
  }

  const seen = new Set<number>()
  const roles: RoleOption[] = []
  for (const item of list) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
    const role = extractRoleFromEmployee(item as Record<string, unknown>)
    if (role && !seen.has(role.role_ID)) {
      seen.add(role.role_ID)
      roles.push(role)
    }
  }
  return roles.sort((a, b) => a.role_ID - b.role_ID)
}

let _cachedRoleFetchPath: string | null = null

export async function fetchRoles(): Promise<RoleOption[]> {
  const externalPaths = ['/roles/get/roles', '/roles']
  const localPaths = ['/roles']

  // Fast path: reuse the endpoint that worked last time
  if (_cachedRoleFetchPath) {
    try {
      const data = await apiRequest<unknown>(_cachedRoleFetchPath, { portal: { suppressFailureLog: true } })
      const list = parseRoleList(data, _cachedRoleFetchPath === '/roles/get/roles')
      if (list.length) return list
    } catch {
      _cachedRoleFetchPath = null
    }
  }

  const paths = isConfiguredForExternalApi() ? externalPaths : localPaths

  // Fire all paths in parallel — first success wins
  try {
    return await Promise.any(
      paths.map(async (p) => {
        try {
          const data = await apiRequest<unknown>(p, { portal: { suppressFailureLog: true } })
          const list = parseRoleList(data, p === '/roles/get/roles')
          if (!list.length) throw new Error('empty')
          _cachedRoleFetchPath = p
          return list
        } catch (err) {
          throw err
        }
      }),
    )
  } catch {
    return []
  }
}

/** Resolve one role by id when the bulk `/roles` list misses a row (common with large DBs). */
export async function fetchRoleById(roleId: number): Promise<RoleOption | null> {
  if (!Number.isFinite(roleId) || roleId <= 0) return null
  const paths = [`/roles/${roleId}`, `/roles/get/role/${roleId}`, `/roles/role/${roleId}`]
  for (const p of paths) {
    try {
      const data = await apiRequest<unknown>(p)
      if (data != null && typeof data === 'object' && !Array.isArray(data)) {
        const r = normalizeRole(data as Record<string, unknown>)
        if (r.role_ID > 0 || r.role_name) return { role_ID: r.role_ID || roleId, role_name: r.role_name || `Role ${roleId}` }
      }
    } catch {
      // try next path
    }
  }
  return null
}

async function tryCreateRoleAtPath(path: string, name: string): Promise<RoleOption | null> {
  const payloads: Array<Record<string, unknown>> = [
    { role_name: name },
    { r_name: name },
    { name },
  ]
  for (const body of payloads) {
    try {
      const created = await apiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(body) })
      if (created != null && typeof created === 'object' && !Array.isArray(created)) {
        const r = normalizeRole(created as Record<string, unknown>)
        if (r.role_ID > 0) return r
      }
      // Some APIs return a list or wrap in { data }, so we just return a minimal role.
      return { role_ID: 0, role_name: name }
    } catch {
      // try next payload
    }
  }
  return null
}

export async function createRole(name: string): Promise<RoleOption | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  // Most likely route in local dev / simple APIs.
  const direct = await tryCreateRoleAtPath('/roles', trimmed)
  if (direct) return direct

  // External API variants (seen with /get/* patterns in other endpoints).
  if (isConfiguredForExternalApi()) {
    const candidates = ['/roles/post/roles', '/roles/add/roles', '/roles/create/roles', '/roles/create']
    for (const p of candidates) {
      const created = await tryCreateRoleAtPath(p, trimmed)
      if (created) return created
    }
  }

  return null
}
