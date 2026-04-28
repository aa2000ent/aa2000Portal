import { apiRequest, setPortalAccountId, setPortalUsername, setSessionId } from './client'
import { getExecutiveTitleDefaultRoute, getLogoutCandidatePaths, getRoleIdRouteOverride } from './config'
import { fetchRoleById, fetchRoles } from './roles'
import { fetchEmployees } from './employees'

export type LoginVerificationPayload = {
  username: string
  password: string
  s_name?: string
}

/**
 * POST `/security/login/verification` — success body (Express security router):
 *
 * - `message` — e.g. "Login successful. Session created."
 * - `account` — `{ acc_ID, username, role_ID, status, acc_sessionID }`
 * - `session` — **DB session row**, not a role name: `{ s_ID, s_name, createdAt }`
 *   - Store **`session.s_name`** as the client session token (64-char hex).
 *
 * Errors: `401` invalid credentials; `500` server error.
 */
export type LoginVerificationResponse = {
  message: string
  account: {
    acc_ID: number
    /** Some Express APIs use `acc_username` instead of `username`. */
    username?: string
    acc_username?: string
    role_ID: number
    status: string
    acc_sessionID?: number
    /** If your API includes role label on login, routing uses this first */
    role_name?: string
    r_name?: string
    role?: { role_name?: string; r_name?: string; role_ID?: number }
  }
  session: {
    s_ID: number
    s_name: string
    createdAt?: string
  }
}

export async function loginVerification(
  payload: LoginVerificationPayload
): Promise<LoginVerificationResponse> {
  const body: Record<string, string> = {
    username: payload.username,
    password: payload.password,
  }
  const res = await apiRequest<LoginVerificationResponse>('/security/login/verification', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (res.session?.s_name) setSessionId(res.session.s_name)
  if (res.account?.acc_ID != null) setPortalAccountId(res.account.acc_ID)
  const uname = String(res.account?.username ?? res.account?.acc_username ?? '').trim()
  if (uname) setPortalUsername(uname)
  return res
}

export type LogoutResponse = {
  message: string
}

/**
 * POST body: `{ username }`. Paths from `getLogoutCandidatePaths()` (see `VITE_LOGOUT_PATH` in `.env.example`).
 * All attempts use quiet logging; local sign-out still runs if the server has no route.
 */
export async function logoutSecurity(username: string | null | undefined): Promise<void> {
  const u = (username ?? '').trim()
  if (!u) return
  const paths = getLogoutCandidatePaths()
  const body = JSON.stringify({ username: u })
  let lastErr: unknown

  for (const path of paths) {
    try {
      await apiRequest<LogoutResponse>(path, {
        method: 'POST',
        body,
        portal: { suppressFailureLog: true },
      })
      return
    } catch (e) {
      lastErr = e
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr ?? '')
  if (msg.includes('404') || msg.includes('not found')) {
    console.info(
      '[Portal] Server has no logout route (404). Local session cleared. Deploy POST /security/logout on your API or set VITE_LOGOUT_PATH to match your Express route.'
    )
    return
  }
  console.warn('[Portal] Logout API failed (continuing with local sign-out):', lastErr)
}

const PORTAL_ROUTE_KEYS = new Set([
  'admin',
  'marketing',
  'sale',
  'purchasing',
  'customer',
  'supplier',
  'operations',
  'finance',
  'financial',
  'accounting',
  'engineering',
  'technical',
  'ceo',
  'co-ceo',
  'general-manager',
])

function normalizeRouteSegment(seg: string): string {
  const s = seg.trim().toLowerCase().replace(/^\/+/, '').split('/')[0] ?? ''
  return PORTAL_ROUTE_KEYS.has(s) ? s : 'admin'
}

/**
 * Map DB role label → React route first segment (`admin`, `marketing`, `finance`, `engineering`, `general-manager`).
 */
export function roleNameToRoute(roleName: string): string {
  const n = (roleName || '').toLowerCase().trim()
  if (!n) return 'admin'

  // Strict one-role -> one-screen routing (no shared department fallback).
  if (/\bgeneral[\s_-]*manager\b|^gm$/i.test(n)) return 'general-manager'
  if (/\bco[\s_-]*ceo\b|\bcoo\b|\bchief operating\b/i.test(n)) return 'co-ceo'
  if (/\bceo\b|\bchief executive\b|\bmanaging director\b/i.test(n)) return 'ceo'
  if (/\btechnical\b|\bit\b|\btechnician\b/i.test(n)) return 'technical'
  if (/\bengineering\b|\bengineer\b|\bdeveloper\b|\bsoftware\b/i.test(n)) return 'engineering'
  if (/\bfinancial\b/.test(n)) return 'financial'
  if (/\baccounting\b|\baccountant\b/.test(n)) return 'accounting'
  if (/\bfinance\b|\bbookkeep\b|\btreasury\b|\bcomptroller\b/.test(n)) return 'finance'
  if (/\bsale[s]?\b/.test(n)) return 'sale'
  if (/\bpurchasing\b/.test(n)) return 'purchasing'
  if (/\bcustomer\b/.test(n)) return 'customer'
  if (/\bsupplier\b/.test(n)) return 'supplier'
  if (/\boperations?\b/.test(n)) return 'operations'
  if (/\bmarketing\b|\bbrand\b|\bpromo\b/.test(n)) return 'marketing'
  if (/(^|[^a-z])admin([^a-z]|$)|supervisor|super user|director|human resource|\bhr\b|owner|executive/i.test(n)) return 'admin'

  if (/(^|[^a-z])(market|sales|brand|promo)([^a-z]|$)/i.test(roleName)) return 'marketing'
  if (/(financ|treasury|bookkeep|accountant|comptroller)/i.test(n)) return 'finance'
  if (/(engineer|developer|technical|software|\bit\b|technician)/i.test(n)) return 'engineering'
  if (/(^|[^a-z])admin([^a-z]|$)|supervisor|super user|director|human resource|\bhr\b|owner|executive/i.test(n)) return 'admin'

  if (n.includes('market')) return 'marketing'
  if (n.includes('finance') || n.includes('account')) return 'finance'
  if (n.includes('engineer')) return 'engineering'
  if (n.includes('admin')) return 'admin'

  // Other executive titles (fallback policy) → configurable (default admin)
  if (/\bvp\b|\bvice president\b/i.test(roleName.trim())) {
    return getExecutiveTitleDefaultRoute()
  }

  return 'admin'
}

/** Login name as returned by API (`username` or `acc_username`). */
export function accountDisplayUsername(account: LoginVerificationResponse['account']): string {
  return String(account?.username ?? account?.acc_username ?? '').trim()
}

function roleLabelFromAccount(account: LoginVerificationResponse['account']): string | undefined {
  const raw =
    account.role_name ??
    account.r_name ??
    (typeof account.role === 'object' && account.role
      ? String(account.role.role_name ?? account.role.r_name ?? '').trim()
      : '')
  const s = String(raw).trim()
  return s || undefined
}

/**
 * After login: send user to the area that matches their DB role (`role_ID` + role name).
 * Order: env `VITE_ROLE_ROUTE_MAP` → employee role by `acc_ID` → `/roles` list by `role_ID` →
 * GET role by id → API embedded role label → fallback.
 */
export async function resolvePortalRouteFromAccount(
  account: LoginVerificationResponse['account']
): Promise<string> {
  const roleId = Number(account.role_ID ?? 0)
  const accId = Number(account.acc_ID ?? 0)
  const override = getRoleIdRouteOverride()[roleId]
  if (override) return normalizeRouteSegment(override)

  // Employee role changes are managed in Admin Employees. Honor that first when available.
  if (Number.isFinite(accId) && accId > 0) {
    try {
      const employees = await fetchEmployees()
      const me = employees.find((e) => Number(e.accId ?? 0) === accId)
      const employeeRole = String(me?.role ?? '').trim()
      if (employeeRole) return roleNameToRoute(employeeRole)
    } catch {
      // Continue to account-role based resolution.
    }
  }

  if (Number.isFinite(roleId) && roleId > 0) {
    const roles = await fetchRoles()
    let match = roles.find((r) => r.role_ID === roleId)
    if (!match) {
      match = (await fetchRoleById(roleId)) ?? undefined
    }
    if (match?.role_name) return roleNameToRoute(match.role_name)
  }

  // Fallback only when role list endpoints are unavailable.
  const embedded = roleLabelFromAccount(account)
  if (embedded) return roleNameToRoute(embedded)

  return roleNameToRoute('')
}

export type RegisterPayload = {
  username: string
  password: string
  role_ID: number
  Emp_fname: string
  Emp_lname: string
  Emp_AddressID: number
  Emp_email?: string
  Emp_IDno?: string
  Emp_mname?: string
  Emp_cnum?: string
  Emp_role?: number
}

export type RegisterResponse = {
  message: string
  account?: { acc_ID: number; username: string; role_ID: number }
  employee?: Record<string, unknown>
}

export async function registerAccount(payload: RegisterPayload): Promise<RegisterResponse> {
  const body: Record<string, unknown> = {
    username: payload.username.trim(),
    password: payload.password,
    role_ID: payload.role_ID,
    Emp_fname: payload.Emp_fname.trim(),
    Emp_lname: payload.Emp_lname.trim(),
    Emp_AddressID: payload.Emp_AddressID,
  }
  if (payload.Emp_email != null && payload.Emp_email.trim() !== '') body.Emp_email = payload.Emp_email.trim()
  if (payload.Emp_IDno != null && payload.Emp_IDno.trim() !== '') body.Emp_IDno = payload.Emp_IDno.trim()
  if (payload.Emp_mname != null && payload.Emp_mname.trim() !== '') body.Emp_mname = payload.Emp_mname.trim()
  if (payload.Emp_cnum != null && payload.Emp_cnum.trim() !== '') body.Emp_cnum = payload.Emp_cnum.trim()
  if (payload.Emp_role != null) body.Emp_role = payload.Emp_role
  const res = await apiRequest<RegisterResponse>('/security/register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res
}
