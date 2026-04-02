import { apiRequest, getSessionId, setPortalUsername, setSessionId } from './client'
import { getLogoutCandidatePaths } from './config'
import { fetchRoles } from './roles'

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
    username: string
    role_ID: number
    status: string
    acc_sessionID?: number
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
  const existingSession = getSessionId()
  if (existingSession) body.s_name = existingSession
  const res = await apiRequest<LoginVerificationResponse>('/security/login/verification', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (res.session?.s_name) setSessionId(res.session.s_name)
  if (res.account?.username) setPortalUsername(res.account.username)
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

/** Map role display name from DB → first path segment (`/admin`, `/marketing`, …). */
export function roleNameToRoute(roleName: string): string {
  const n = (roleName || '').toLowerCase().trim()
  if (n.includes('marketing')) return 'marketing'
  if (n.includes('finance')) return 'finance'
  if (n.includes('engineer')) return 'engineering'
  if (n.includes('admin')) return 'admin'
  return 'admin'
}

/** Resolve dashboard route from `account.role_ID` using `/roles` data. */
export async function resolvePortalRouteFromAccount(account: { role_ID: number }): Promise<string> {
  const roles = await fetchRoles()
  const match = roles.find((r) => r.role_ID === account.role_ID)
  if (match?.role_name) return roleNameToRoute(match.role_name)
  return 'admin'
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
