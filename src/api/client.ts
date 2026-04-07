import { API_BASE_URLS, API_PREFIX, getBaseUrls } from './config'

export function hasApiBase(): boolean {
  return API_BASE_URLS.length > 0
}

const SESSION_ID_KEY = 'portal_session_id'
const PORTAL_ACCOUNT_ID_KEY = 'portal_account_id'
const PORTAL_USERNAME_KEY = 'portal_username'
const PORTAL_HOME_SEGMENT_KEY = 'portal_home_segment'

function getToken(): string | null {
  try {
    return localStorage.getItem('portal_token')
  } catch {
    return null
  }
}

/** Current JWT from localStorage (same value sent as `Authorization`), if any. */
export function getAuthToken(): string | null {
  return getToken()
}

/** True when the client has a session or bearer token (signed-in state for routing). */
export function isPortalSessionActive(): boolean {
  return Boolean(getSessionId() || getToken())
}

export function getSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_ID_KEY)
  } catch {
    return null
  }
}

export function setSessionId(s_name: string): void {
  try {
    localStorage.setItem(SESSION_ID_KEY, s_name)
  } catch {
    // ignore
  }
}

export function clearSessionId(): void {
  try {
    localStorage.removeItem(SESSION_ID_KEY)
  } catch {
    // ignore
  }
}

/** Signed-in account id (acc_ID) from login response. */
export function getPortalAccountId(): string | null {
  try {
    return localStorage.getItem(PORTAL_ACCOUNT_ID_KEY)
  } catch {
    return null
  }
}

export function setPortalAccountId(accId: number | string): void {
  const value = String(accId ?? '').trim()
  if (!value) return
  try {
    localStorage.setItem(PORTAL_ACCOUNT_ID_KEY, value)
  } catch {
    // ignore
  }
}

export function clearPortalAccountId(): void {
  try {
    localStorage.removeItem(PORTAL_ACCOUNT_ID_KEY)
  } catch {
    // ignore
  }
}

/** Signed-in username (for `/security/logout` body). Set on successful login. */
export function getPortalUsername(): string | null {
  try {
    return localStorage.getItem(PORTAL_USERNAME_KEY)
  } catch {
    return null
  }
}

export function setPortalUsername(username: string): void {
  try {
    localStorage.setItem(PORTAL_USERNAME_KEY, username.trim())
  } catch {
    // ignore
  }
}

export function clearPortalUsername(): void {
  try {
    localStorage.removeItem(PORTAL_USERNAME_KEY)
  } catch {
    // ignore
  }
}

/** First URL segment after login (e.g. `general-manager`) — for reminders when browsing another area. */
export function setPortalHomeSegment(segment: string): void {
  try {
    const s = segment.replace(/^\//, '').split('/')[0]?.trim()
    if (s) localStorage.setItem(PORTAL_HOME_SEGMENT_KEY, s)
  } catch {
    // ignore
  }
}

export function getPortalHomeSegment(): string | null {
  try {
    return localStorage.getItem(PORTAL_HOME_SEGMENT_KEY)
  } catch {
    return null
  }
}

export function clearPortalHomeSegment(): void {
  try {
    localStorage.removeItem(PORTAL_HOME_SEGMENT_KEY)
  } catch {
    // ignore
  }
}

/** `portal.suppressFailureLog` — skip `console.error` on failed response (e.g. trying alternate paths). */
export type ApiRequestOptions = RequestInit & {
  portal?: { suppressFailureLog?: boolean }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { portal, ...fetchInit } = options
  const p = path.startsWith('/') ? path : `/${path}`
  const bases = getBaseUrls()
  const token = getToken()
  const sessionId = getSessionId()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
    ...(fetchInit.headers as Record<string, string>),
  }
  let lastError: unknown = null

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i]
    const url = `${base}${API_PREFIX}${p}`
    let res: Response
    try {
      res = await fetch(url, { ...fetchInit, headers })
    } catch (networkErr) {
      lastError = networkErr
      console.error('[Portal API] Network error:', { url, error: networkErr })
      continue
    }

    if (!res.ok) {
      const text = await res.text()
      let message: string
      try {
        const j = JSON.parse(text) as Record<string, unknown>
        const pick = (v: unknown): string =>
          typeof v === 'string' && v.trim() ? v.trim() : ''
        message =
          pick(j.message) ||
          pick(j.error) ||
          pick(j.detail as string) ||
          (Array.isArray(j.errors)
            ? j.errors
                .map((e: unknown) =>
                  typeof e === 'string' ? e : (e as { msg?: string; message?: string })?.msg ?? (e as { message?: string }).message ?? ''
                )
                .filter(Boolean)
                .join('; ')
            : '')
      } catch {
        message = ''
      }
      if (!message || text.trimStart().startsWith('<!')) {
        message = res.status === 404
          ? 'Endpoint not found (404). Check that the server route matches.'
          : res.status >= 500
            ? `Server error (${res.status}). The API could not complete the request — check the backend service and logs, and that VITE_API_BASE_URL in .env points to the correct server.`
            : `Request failed: ${res.status} ${res.statusText || ''}`.trim()
      }

      const err = new Error(message)
      if (!portal?.suppressFailureLog) {
        console.error('[Portal API] Request failed:', {
          url,
          status: res.status,
          statusText: res.statusText,
          message,
          responseBody: text.slice(0, 500),
        })
      }

      // Retry next server on common failover statuses.
      const isRetryableHttp = res.status === 404 || res.status === 408 || res.status === 429 || res.status >= 500
      const hasNextBase = i < bases.length - 1
      if (isRetryableHttp && hasNextBase) {
        lastError = err
        continue
      }
      throw err
    }

    const contentType = res.headers.get('content-type')
    if (contentType?.includes('application/json')) return res.json() as Promise<T>
    return undefined as T
  }

  throw (lastError ?? new Error('All configured API base URLs failed.'))
}

export function setAuthToken(token: string): void {
  localStorage.setItem('portal_token', token)
}

export function clearAuthToken(): void {
  localStorage.removeItem('portal_token')
}
