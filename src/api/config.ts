function normalizeBaseUrl(raw: unknown): string {
  if (!raw) return ''
  const value = String(raw).trim()
  if (!value) return ''
  return value.replace(/\/$/, '')
}

function parseBaseUrls(rawList: unknown): string[] {
  if (!rawList) return []
  const parts = String(rawList)
    .split(',')
    .map((s) => normalizeBaseUrl(s))
    .filter(Boolean)
  return Array.from(new Set(parts))
}

function getConfiguredBaseUrls(): string[] {
  const multi = parseBaseUrls(import.meta.env.VITE_API_BASE_URLS)
  if (multi.length > 0) return multi
  const single = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)
  return single ? [single] : []
}

export const API_BASE_URLS = getConfiguredBaseUrls()
export const API_BASE_URL = API_BASE_URLS[0] ?? ''

const prefix = import.meta.env.VITE_API_PREFIX
export const API_PREFIX = typeof prefix === 'string' ? prefix.replace(/\/$/, '') : ''

export const getApiBase = () => `${API_BASE_URL}${API_PREFIX}`

export function getBaseUrls(): string[] {
  if (API_BASE_URLS.length > 0) {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      try {
        const w = window as unknown as { __portalApiBasesLogged?: boolean }
        if (!w.__portalApiBasesLogged) {
          console.info('[Portal API] Base URLs:', API_BASE_URLS)
          w.__portalApiBasesLogged = true
        }
      } catch {}
    }
    return API_BASE_URLS
  }
  throw new Error(
    'API base URL is required. Set VITE_API_BASE_URLS (comma-separated) or VITE_API_BASE_URL in .env.'
  )
}

export function getBaseUrl(): string {
  return getBaseUrls()[0]
}

/** True when the API is not on this machine's loopback — use Express-style paths (/application/..., /roles/get/roles). */
function isRemoteApiBaseUrl(base: string): boolean {
  const normalized = normalizeBaseUrl(base)
  if (!normalized) return false
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) ? normalized : `https://${normalized}`
    const host = new URL(withScheme).hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return false
    return true
  } catch {
    return false
  }
}

export function isConfiguredForExternalApi(): boolean {
  const bases = getConfiguredBaseUrls()
  const legacyHints = ['devtunnels', 'ngrok', 'localtunnel', 'ts.net', 'trycloudflare']
  return bases.some(
    (u) => isRemoteApiBaseUrl(u) || legacyHints.some((hint) => u.toLowerCase().includes(hint))
  )
}

export function getApiBaseUrlForDisplay(): string {
  try {
    const urls = getConfiguredBaseUrls()
    if (urls.length > 0) return urls[0]
  } catch {}
  return ''
}

/**
 * Paths to try for POST logout (first match wins). Override if your Express route differs.
 * `VITE_LOGOUT_PATH=/my/path` → only that path (must start with `/` or it is added).
 * If unset: `/security/logout` then `/security/login/logout`.
 */
export function getLogoutCandidatePaths(): string[] {
  const raw = import.meta.env.VITE_LOGOUT_PATH
  if (typeof raw === 'string' && raw.trim()) {
    const p = raw.trim().replace(/\/$/, '')
    return [p.startsWith('/') ? p : `/${p}`]
  }
  return ['/security/logout', '/security/login/logout']
}

/**
 * Optional JSON map: `{ "1": "admin", "2": "marketing" }` — `role_ID` → first path segment after login.
 * Use when `/roles` list does not include every account role.
 */
export function getRoleIdRouteOverride(): Record<number, string> {
  try {
    const raw = import.meta.env.VITE_ROLE_ROUTE_MAP
    if (typeof raw !== 'string' || !raw.trim()) return {}
    const o = JSON.parse(raw) as Record<string, unknown>
    const out: Record<number, string> = {}
    for (const [k, v] of Object.entries(o)) {
      const id = Number(k)
      if (!Number.isFinite(id) || id <= 0) continue
      const seg = String(v ?? '')
        .trim()
        .replace(/^\//, '')
        .split('/')[0]
      if (seg) out[id] = seg
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Portal segment for executive titles (CEO, COO, …) — not General Manager (that uses `/general-manager` in code).
 */
export function getExecutiveTitleDefaultRoute(): string {
  const raw = import.meta.env.VITE_EXECUTIVE_DEFAULT_ROUTE
  if (typeof raw !== 'string' || !raw.trim()) return 'admin'
  const s = raw.trim().toLowerCase().replace(/^\//, '').split('/')[0] ?? 'admin'
  return ['admin', 'marketing', 'finance', 'engineering', 'general-manager'].includes(s) ? s : 'admin'
}
