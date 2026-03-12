const base = import.meta.env.VITE_API_BASE_URL
export const API_BASE_URL = typeof base === 'string' && base.length > 0 ? base.replace(/\/$/, '') : ''

const prefix = import.meta.env.VITE_API_PREFIX
export const API_PREFIX = typeof prefix === 'string' ? prefix.replace(/\/$/, '') : ''

export const getApiBase = () => `${API_BASE_URL}${API_PREFIX}`

export function getBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (raw && String(raw).trim()) {
    const url = String(raw).replace(/\/$/, '')
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      try {
        const w = window as unknown as { __portalApiBaseLogged?: boolean }
        if (!w.__portalApiBaseLogged) {
          console.info('[Portal API] Base URL (VITE_API_BASE_URL):', url)
          w.__portalApiBaseLogged = true
        }
      } catch {}
    }
    return url
  }
  throw new Error(
    'VITE_API_BASE_URL is required. Set it in .env (e.g. VITE_API_BASE_URL=https://your-backend.asse.devtunnels.ms).'
  )
}

export function isConfiguredForExternalApi(): boolean {
  const raw = import.meta.env.VITE_API_BASE_URL && String(import.meta.env.VITE_API_BASE_URL)
  return !!(raw && raw.includes('devtunnels'))
}

export function getApiBaseUrlForDisplay(): string {
  try {
    const raw = import.meta.env.VITE_API_BASE_URL
    if (raw && String(raw).trim()) return String(raw).replace(/\/$/, '')
  } catch {}
  return ''
}
