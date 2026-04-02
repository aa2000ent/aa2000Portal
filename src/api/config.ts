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

export function isConfiguredForExternalApi(): boolean {
  const externalHostHints = ['devtunnels', 'ngrok', 'localtunnel']
  return getConfiguredBaseUrls().some((u) => externalHostHints.some((hint) => u.includes(hint)))
}

export function getApiBaseUrlForDisplay(): string {
  try {
    const urls = getConfiguredBaseUrls()
    if (urls.length > 0) return urls[0]
  } catch {}
  return ''
}
