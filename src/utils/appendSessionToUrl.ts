import { getPortalAccountId, getSessionId } from '../api/client'

/** Plain query keys (used when `VITE_LAUNCH_AES_KEY` is not set). */
export const LAUNCH_SESSION_QUERY_KEY = 's_name'
export const LAUNCH_ACCOUNT_QUERY_KEY = 'acc_ID'

/** Obfuscated query keys for AES-GCM payloads (when launch crypto is configured). */
export const LAUNCH_ENCRYPTED_SESSION_QUERY_KEY = '__launch'
export const LAUNCH_ENCRYPTED_ACCOUNT_QUERY_KEY = '__actor'

const AES_IV_LEN = 12
const AES_KEY_LEN = 32

/**
 * In development only, if `VITE_LAUNCH_AES_KEY` is unset, the portal derives a 32-byte key as
 * `SHA-256(UTF-8 bytes of this string)` for AES-GCM — so launch URLs still use `__launch` / `__actor`.
 * Your sub-app must use the same derivation in dev, or set `VITE_LAUNCH_AES_KEY` everywhere (recommended).
 */
export const LAUNCH_DEV_KEY_DERIVATION_STRING = 'aa2000-portal-launch-dev-v1'

let cachedKey: CryptoKey | null | undefined

function parseAesKeyMaterial(): Uint8Array | null {
  const raw = (import.meta.env.VITE_LAUNCH_AES_KEY as string | undefined)?.trim()
  if (!raw) return null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const out = new Uint8Array(AES_KEY_LEN)
    for (let i = 0; i < AES_KEY_LEN; i++) out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16)
    return out
  }
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const bin = atob(b64 + pad)
    if (bin.length !== AES_KEY_LEN) return null
    const out = new Uint8Array(AES_KEY_LEN)
    for (let i = 0; i < AES_KEY_LEN; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function resolveRawKeyMaterial(): Promise<Uint8Array | null> {
  const fromEnv = parseAesKeyMaterial()
  if (fromEnv) return fromEnv
  if (import.meta.env.DEV) {
    const enc = new TextEncoder().encode(LAUNCH_DEV_KEY_DERIVATION_STRING)
    const digest = await crypto.subtle.digest('SHA-256', enc)
    return new Uint8Array(digest)
  }
  return null
}

async function getLaunchCryptoKey(): Promise<CryptoKey | null> {
  if (cachedKey !== undefined) return cachedKey
  const material = await resolveRawKeyMaterial()
  if (!material) {
    cachedKey = null
    return null
  }
  try {
    const keyBytes = new Uint8Array(material)
    cachedKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ])
    return cachedKey
  } catch {
    cachedKey = null
    return null
  }
}

function bytesToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(s: string): Uint8Array | null {
  try {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const bin = atob(b64 + pad)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function encryptUtf8(plain: string, key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(AES_IV_LEN)
  crypto.getRandomValues(iv)
  const enc = new TextEncoder().encode(plain)
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc)
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipherBuf), iv.length)
  return bytesToB64url(combined.buffer)
}

async function decryptUtf8(token: string, key: CryptoKey): Promise<string | null> {
  const raw = b64urlToBytes(token)
  if (!raw || raw.length < AES_IV_LEN + 16) return null
  const iv = raw.slice(0, AES_IV_LEN)
  const data = raw.slice(AES_IV_LEN)
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      data as BufferSource,
    )
    return new TextDecoder().decode(plainBuf)
  } catch {
    return null
  }
}

/**
 * Decrypts a single launch token produced by `appendSessionIdToLaunchUrl` when encryption is enabled.
 * Use the same `VITE_LAUNCH_AES_KEY` (or in dev the same `LAUNCH_DEV_KEY_DERIVATION_STRING` → SHA-256 rule).
 */
export async function decryptLaunchToken(token: string): Promise<string | null> {
  const key = await getLaunchCryptoKey()
  if (!key) return null
  return decryptUtf8(token.trim(), key)
}

function appendPlainParams(href: string, sessionId: string | null, accountId: string | number | null): string {
  if (!href || (!sessionId && accountId == null)) return href
  try {
    const url = new URL(href)
    if (sessionId) url.searchParams.set(LAUNCH_SESSION_QUERY_KEY, sessionId)
    if (accountId != null && accountId !== '') url.searchParams.set(LAUNCH_ACCOUNT_QUERY_KEY, String(accountId))
    return url.toString()
  } catch {
    const parts: string[] = []
    if (sessionId) parts.push(`${LAUNCH_SESSION_QUERY_KEY}=${encodeURIComponent(sessionId)}`)
    if (accountId != null && accountId !== '') {
      parts.push(`${LAUNCH_ACCOUNT_QUERY_KEY}=${encodeURIComponent(String(accountId))}`)
    }
    const sep = href.includes('?') ? '&' : '?'
    return `${href}${sep}${parts.join('&')}`
  }
}

/**
 * Appends portal session + account id to a launch URL.
 * - **Production:** set `VITE_LAUNCH_AES_KEY` (32 bytes, base64 or 64-char hex) or URLs stay plain `s_name` / `acc_ID`.
 * - **Development:** if that env is unset, key is derived from `LAUNCH_DEV_KEY_DERIVATION_STRING` (SHA-256) and params are `__launch` / `__actor`.
 */
export async function appendSessionIdToLaunchUrl(href: string): Promise<string> {
  const sessionId = getSessionId()
  const accountId = getPortalAccountId()
  if (!href || (!sessionId && (accountId == null || accountId === ''))) return href

  const key = await getLaunchCryptoKey()
  if (!key) {
    const msg =
      '[portal] Launch encryption off: production builds need VITE_LAUNCH_AES_KEY (32-byte base64 or 64-char hex) on the host (e.g. Vercel env for the portal). Until then, URLs use plain s_name & acc_ID.'
    if (import.meta.env.DEV) console.warn(msg)
    else console.error(msg)
    return appendPlainParams(href, sessionId || null, accountId)
  }

  try {
    const url = new URL(href)
    if (sessionId) url.searchParams.set(LAUNCH_ENCRYPTED_SESSION_QUERY_KEY, await encryptUtf8(sessionId, key))
    if (accountId != null && accountId !== '') {
      url.searchParams.set(LAUNCH_ENCRYPTED_ACCOUNT_QUERY_KEY, await encryptUtf8(String(accountId), key))
    }
    return url.toString()
  } catch {
    const parts: string[] = []
    if (sessionId) {
      parts.push(`${LAUNCH_ENCRYPTED_SESSION_QUERY_KEY}=${encodeURIComponent(await encryptUtf8(sessionId, key))}`)
    }
    if (accountId != null && accountId !== '') {
      parts.push(
        `${LAUNCH_ENCRYPTED_ACCOUNT_QUERY_KEY}=${encodeURIComponent(await encryptUtf8(String(accountId), key))}`,
      )
    }
    const sep = href.includes('?') ? '&' : '?'
    return `${href}${sep}${parts.join('&')}`
  }
}
