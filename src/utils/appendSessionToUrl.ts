import { getSessionId } from '../api/client'

/** Obfuscated query key for launch context token. */
export const LAUNCH_SESSION_QUERY_KEY = '__launch'

/**
 * Appends the current portal session token to a launch URL (e.g. `?__launch=...`).
 * No-op if there is no session id or href is empty.
 */
export function appendSessionIdToLaunchUrl(href: string): string {
  const sessionId = getSessionId()
  if (!sessionId || !href) return href
  try {
    const url = new URL(href)
    url.searchParams.set(LAUNCH_SESSION_QUERY_KEY, sessionId)
    return url.toString()
  } catch {
    const sep = href.includes('?') ? '&' : '?'
    return `${href}${sep}${LAUNCH_SESSION_QUERY_KEY}=${encodeURIComponent(sessionId)}`
  }
}
