function normalizeBaseUrl(raw: unknown): string {
  if (!raw) return ''
  const value = String(raw).trim()
  if (!value) return ''
  return value.replace(/\/$/, '')
}

/**
 * If someone pastes a full `.env` line into `VITE_API_BASE_URL` / `VITE_API_BASE_URLS`,
 * the value can be `VITE_API_BASE_URL=https://host` — not a valid absolute URL, so `fetch`
 * resolves it against the Vite dev server and login hits localhost with a bogus path.
 */
function sanitizeEnvBaseUrlLine(raw: string): string {
  let s = String(raw).trim()
  if (!s) return ''
  // Strip one or more accidental `VITE_*=...=` prefixes (double-pasted .env lines).
  while (/^VITE_[A-Za-z0-9_]+=/.test(s)) {
    const eq = s.indexOf('=')
    if (eq === -1) break
    s = s.slice(eq + 1).trim()
  }
  s = s.replace(/^https?:\/\/https?:\/\//i, 'https://')
  return s.replace(/\/$/, '')
}

function isValidHttpBaseUrl(s: string): boolean {
  if (!s || !/^https?:\/\//i.test(s)) return false
  try {
    return Boolean(new URL(s).hostname)
  } catch {
    return false
  }
}

function parseBaseUrls(rawList: unknown): string[] {
  if (!rawList) return []
  const parts = String(rawList)
    .split(',')
    .map((s) => normalizeBaseUrl(sanitizeEnvBaseUrlLine(s)))
    .filter(isValidHttpBaseUrl)
  return Array.from(new Set(parts))
}

/** True when the API is not loopback — cross-origin fetches need CORS (or a dev proxy). */
function isRemoteApiHost(base: string): boolean {
  if (!base) return false
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(base) ? base : `https://${base}`
    const host = new URL(withScheme).hostname.toLowerCase()
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]'
  } catch {
    return false
  }
}

function getConfiguredBaseUrls(): string[] {
  const useDeployProxy = String(import.meta.env.VITE_USE_DEPLOY_PROXY ?? '').trim().toLowerCase() === 'true'
  if (!import.meta.env.DEV && useDeployProxy) {
    return ['/__portal_api']
  }

  // In dev mode, route through Vite proxy to avoid CORS issues
  if (import.meta.env.DEV) {
    const rawSingle = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
    const rawMulti = String(import.meta.env.VITE_API_BASE_URLS ?? '').trim()
    const devProxyDisabled = import.meta.env.VITE_USE_DEV_PROXY === 'false'
    
    if (!devProxyDisabled && (rawSingle || rawMulti)) {
      if (typeof window !== 'undefined') {
        const w = window as any
        if (!w.__portalApiProxyLogged) {
          console.info('[Portal API] Using Vite dev proxy (/__portal_api) for API calls.')
          w.__portalApiProxyLogged = true
        }
      }
      // Use the Vite proxy path — all requests go through localhost
      return ['/__portal_api']
    }

    if (devProxyDisabled && typeof window !== 'undefined') {
      const w = window as any
      if (!w.__portalApiProxyLogged) {
        console.warn('[Portal API] Dev proxy is DISABLED via VITE_USE_DEV_PROXY=false. Direct API calls may fail due to CORS.')
        w.__portalApiProxyLogged = true
      }
    }
  }

  const multi = parseBaseUrls(import.meta.env.VITE_API_BASE_URLS)
  if (multi.length > 0) return multi
  const single = normalizeBaseUrl(sanitizeEnvBaseUrlLine(String(import.meta.env.VITE_API_BASE_URL ?? '')))
  return isValidHttpBaseUrl(single) ? [single] : []
}

export const API_BASE_URLS = getConfiguredBaseUrls()
export const API_BASE_URL = API_BASE_URLS[0] ?? ''

const prefix = import.meta.env.VITE_API_PREFIX
/** Path segment only (e.g. `/api`). Reject mistaken pastes of env lines or full URLs. */
function normalizeApiPrefix(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  let p = raw.trim().replace(/\/$/, '')
  if (!p) return ''
  if (/^VITE_[A-Za-z0-9_]+=/i.test(p) || /^https?:\/\//i.test(p) || p.includes('=')) {
    if (import.meta.env.DEV) {
      console.warn(
        '[Portal API] VITE_API_PREFIX must be a path only (e.g. /api), not a URL or env line. Using empty prefix.'
      )
    }
    return ''
  }
  return p.startsWith('/') ? p : `/${p}`
}

export const API_PREFIX = normalizeApiPrefix(prefix)

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
  return isRemoteApiHost(normalizeBaseUrl(base))
}

/**
 * True when API routes should match the remote Express-style paths (`/roles/get/roles`, `/application/...`).
 * In dev, the browser uses `localhost/.../__portal_api` as the fetch base, so we also check
 * `VITE_API_BASE_URL`: if it points at a remote host, we are proxying to that API and must use the same paths.
 */
export function isConfiguredForExternalApi(): boolean {
  // Check the raw env values — in dev mode getConfiguredBaseUrls() returns /__portal_api
  const rawUrls = [
    String(import.meta.env.VITE_API_BASE_URL ?? ''),
    String(import.meta.env.VITE_API_BASE_URLS ?? ''),
  ].join(',')
  const legacyHints = ['devtunnels', 'ngrok', 'localtunnel', 'ts.net', 'trycloudflare']
  if (legacyHints.some((hint) => rawUrls.toLowerCase().includes(hint))) return true

  const bases = getConfiguredBaseUrls()
  return bases.some((u) => isRemoteApiBaseUrl(u))
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
