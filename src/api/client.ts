import { API_BASE_URLS, API_PREFIX, getBaseUrls } from './config'

export function hasApiBase(): boolean {
  return API_BASE_URLS.length > 0
}

const SESSION_ID_KEY = 'portal_session_id'

function getToken(): string | null {
  try {
    return localStorage.getItem('portal_token')
  } catch {
    return null
  }
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

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const p = path.startsWith('/') ? path : `/${path}`
  const bases = getBaseUrls()
  const token = getToken()
  const sessionId = getSessionId()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
    ...(options.headers as Record<string, string>),
  }
  let lastError: unknown = null

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i]
    const url = `${base}${API_PREFIX}${p}`
    let res: Response
    try {
      res = await fetch(url, { ...options, headers })
    } catch (networkErr) {
      lastError = networkErr
      console.error('[Portal API] Network error:', { url, error: networkErr })
      continue
    }

    if (!res.ok) {
      const text = await res.text()
      let message: string
      try {
        const j = JSON.parse(text)
        message = j?.message ?? j?.error ?? ''
      } catch {
        message = ''
      }
      if (!message || text.trimStart().startsWith('<!')) {
        message = res.status === 404
          ? 'Endpoint not found (404). Check that the server route matches.'
          : `Request failed: ${res.status} ${res.statusText || ''}`.trim()
      }

      const err = new Error(message)
      console.error('[Portal API] Request failed:', {
        url,
        status: res.status,
        statusText: res.statusText,
        message,
        responseBody: text.slice(0, 500),
      })

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
