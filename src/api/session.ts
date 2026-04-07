import { apiRequest } from './client'

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
  account: {
    acc_ID: number
    username: string
    role_ID: number
    role_name: string | null
    status: string
  }
  /** Full `Employee` row when `Employee.acc_ID` matches `account.acc_ID`. */
  employee: Record<string, unknown> | null
}

const SESSION_PATH_PREFIXES = ['/session', '/security/session', '/api/session']

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

  for (const prefix of SESSION_PATH_PREFIXES) {
    try {
      return await apiRequest<SessionLookupResponse>(`${prefix}/${encodeToken(t)}`, {
        method: 'GET',
        portal: { suppressFailureLog: true },
      })
    } catch {
      /* try next */
    }
  }
  return null
}
