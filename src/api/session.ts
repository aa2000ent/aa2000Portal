import { apiRequest } from './client'
import type { SessionLookupAccount } from '../utils/sessionLookupFields'

/**
 * Matches Express `GET /session/:sessionToken` where `sessionToken` === `Session.s_name`
 * (plain launch URLs use `?s_name=...`; when `VITE_LAUNCH_AES_KEY` is set the portal sends
 * `?__launch=...` and `?__actor=...` — decrypt with the same key / `decryptLaunchToken` in `appendSessionToUrl.ts`).
 */
export type SessionLookupResponse = {
  message: string
  session: {
    s_ID: number
    s_name: string
    createdAt?: string
  }
  /** Joined account row — use `sessionLookupFields` helpers for username / name / role aliases. */
  account: SessionLookupAccount
  /** Full `Employee` row when `Employee.acc_ID` matches `account.acc_ID`. */
  employee: Record<string, unknown> | null
}

export type ActiveEmployeeResponse = {
  Emp_fname: string
  Emp_mname?: string | null
  Emp_lname: string
}

const DEFAULT_SESSION_PATH_PREFIXES = [
  '/session',
  '/security/session',
  '/security/login/session',
  '/api/session',
  '/api/security/session',
]

let preferredSessionPrefix: string | null = null
const _failedSessionPrefixes = new Set<string>()

function normalizePrefix(v: string): string {
  const s = String(v ?? '').trim()
  if (!s) return ''
  const withSlash = s.startsWith('/') ? s : `/${s}`
  return withSlash.replace(/\/+$/, '')
}

function configuredSessionPrefixes(): string[] {
  const raw = String(import.meta.env.VITE_SESSION_LOOKUP_PATHS ?? import.meta.env.VITE_SESSION_LOOKUP_PATH ?? '')
  const fromEnv = raw
    .split(',')
    .map((x) => normalizePrefix(x))
    .filter(Boolean)
  const merged = [...fromEnv, ...DEFAULT_SESSION_PATH_PREFIXES.map(normalizePrefix)]
  return [...new Set(merged)]
}

function encodeToken(sessionToken: string): string {
  return encodeURIComponent(sessionToken.trim())
}

/**
 * Resolve portal / sub-app session by token (the hex `s_name` from login or `?s_name=` on launch URL).
 * Tries common mount paths; returns `null` if all fail.
 */
export async function fetchSessionByToken(sessionToken: string): Promise<SessionLookupResponse | null> {
  const t = String(sessionToken ?? '').trim()
  if (!t) return null

  const allPrefixes = configuredSessionPrefixes()
  const prefixes = preferredSessionPrefix
    ? [preferredSessionPrefix, ...allPrefixes.filter((p) => p !== preferredSessionPrefix)]
    : allPrefixes

  for (const prefix of prefixes) {
    if (_failedSessionPrefixes.has(prefix)) continue
    try {
      const data = await apiRequest<SessionLookupResponse>(`${prefix}/${encodeToken(t)}`, {
        method: 'GET',
        portal: { suppressFailureLog: true },
      })
      preferredSessionPrefix = prefix
      return data
    } catch {
      _failedSessionPrefixes.add(prefix)
    }
  }
  return null
}

/**
 * Fetch active employees from current live sessions.
 * Matches backend route: GET /session/get/all-active-employees
 */
export async function fetchAllActiveEmployees(): Promise<ActiveEmployeeResponse[]> {
  return apiRequest<ActiveEmployeeResponse[]>('/session/get/all-active-employees', {
    method: 'GET',
  })
}
