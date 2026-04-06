import { getSessionId } from '../api/client'

/** Obfuscated query key for launch context token. */
export const LAUNCH_SESSION_QUERY_KEY = '__launch'
const LAUNCH_SECRET_FALLBACK = 'aa2k-launch-secret-v1'

/**
 * Browser-side AES-GCM encryption for launch token transport.
 * NOTE: this is obfuscation from casual inspection, not a replacement for server-side auth checks.
 */
async function encryptLaunchToken(raw: string): Promise<string> {
  const c = globalThis.crypto
  if (!c?.subtle) return raw
  const enc = new TextEncoder()
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const secret = (env?.VITE_LAUNCH_TOKEN_SECRET ?? '').trim() || LAUNCH_SECRET_FALLBACK
  const keyMaterial = await c.subtle.digest('SHA-256', enc.encode(secret))
  const key = await c.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = c.getRandomValues(new Uint8Array(12))
  const cipher = await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(raw))
  const payload = new Uint8Array(iv.length + new Uint8Array(cipher).length)
  payload.set(iv, 0)
  payload.set(new Uint8Array(cipher), iv.length)
  return bytesToBase64Url(payload)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/**
 * Appends the current portal session token to a launch URL (e.g. `?__launch=...`),
 * encrypted to avoid exposing the raw session id in plain text.
 * No-op if there is no session id or href is empty.
 */
export async function appendSessionIdToLaunchUrl(href: string): Promise<string> {
  const sessionId = getSessionId()
  if (!sessionId || !href) return href
  const token = await encryptLaunchToken(sessionId)
  try {
    const url = new URL(href)
    url.searchParams.set(LAUNCH_SESSION_QUERY_KEY, token)
    return url.toString()
  } catch {
    const sep = href.includes('?') ? '&' : '?'
    return `${href}${sep}${LAUNCH_SESSION_QUERY_KEY}=${encodeURIComponent(token)}`
  }
}
