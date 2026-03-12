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

export async function fetchRoles(): Promise<RoleOption[]> {
  try {
    const path = isConfiguredForExternalApi() ? '/roles/get/roles' : '/roles'
    let data: unknown
    try {
      data = await apiRequest<unknown>(path)
    } catch (err) {
      if (path === '/roles/get/roles' && is404Error(err)) {
        data = await apiRequest<unknown>('/roles')
        return parseRoleList(data, true)
      }
      throw err
    }
    return parseRoleList(data, path === '/roles/get/roles')
  } catch {
    return []
  }
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
